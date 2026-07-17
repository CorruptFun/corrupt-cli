"use client";
import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { resolveVehicleImageUrl, VEHICLE_PHOTOS_BUCKET } from "@/lib/images";
import ColorSwatch from "@/components/ui/ColorSwatch";
import { siteConfig } from "@/config/site";
import type { Vehicle, VehicleInput, VehicleLocation, VehicleStatus, VehicleType } from "@/lib/types";

const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Keep in step with VehicleType and the vehicles_type_check constraint.
const TYPES: VehicleType[] = [
  "truck", "suv", "sedan", "coupe", "hatchback", "van", "minivan",
  "wagon", "convertible", "golfcart", "utv", "motorcycle", "other",
];

// Postgres constraint errors are accurate and useless to a salesperson on a phone.
// The duplicate-VIN one fired 7 times in 3 minutes on 2026-07-10 — someone
// retrying because "duplicate key value violates unique constraint
// vehicles_vin_key" does not tell you what to do about it.
function friendlySaveError(message: string): string {
  if (message.includes("vehicles_vin_key")) {
    return "A vehicle with this VIN is already in the system. Search the inventory for it, or leave the VIN blank to let one be generated.";
  }
  if (message.includes("vehicles_type_check")) {
    return "That body style isn't allowed by the database. Pick another type, or ask a developer to add it.";
  }
  if (message.includes("vehicles_status_check")) {
    return "That status isn't allowed by the database.";
  }
  if (message.includes("violates row-level security")) {
    return "Your account isn't authorized to change inventory. Ask an admin to add you to the whitelist.";
  }
  return `Failed to save vehicle: ${message}`;
}
const STATUSES: VehicleStatus[] = ["active", "waiting_approval", "sold", "preapproved"];

interface PhotoEntry {
  /** Storage filename or external URL already saved on the vehicle. */
  existing?: string;
  /** Newly selected file, not yet uploaded. */
  file?: File;
  previewUrl: string;
}

const inputClass =
  "w-full bg-black border border-zinc-800 rounded p-3 text-white focus:border-zinc-500 focus:outline-none";
const labelClass = "block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2";

export default function VehicleForm({
  vehicle,
  onSaved,
  onCancel,
}: {
  vehicle: Vehicle | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState({
    year: vehicle?.year.toString() ?? "",
    make: vehicle?.make ?? "",
    model: vehicle?.model ?? "",
    trim: vehicle?.trim ?? "",
    vin: vehicle?.vin ?? "",
    stock_number: vehicle?.stock_number ?? "",
    price: vehicle?.price.toString() ?? "",
    mileage: vehicle?.mileage.toString() ?? "",
    payment_est: vehicle?.payment_est ?? "",
    location: (vehicle?.location ?? siteConfig.locations[0]?.id ?? "main") as VehicleLocation,
    type: (vehicle?.type ?? "sedan") as VehicleType,
    status: (vehicle?.status ?? "active") as VehicleStatus,
    badge: vehicle?.badge ?? "",
    engine: vehicle?.engine ?? "",
    exterior_color: vehicle?.exterior_color ?? "",
    interior_color: vehicle?.interior_color ?? "",
    description: vehicle?.description ?? "",
  });
  const [photos, setPhotos] = useState<PhotoEntry[]>(
    (vehicle?.images ?? [])
      .filter(Boolean)
      .map(img => ({ existing: img, previewUrl: resolveVehicleImageUrl(img) ?? img }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setFields({ ...fields, [key]: e.target.value });

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError("");
    const additions: PhotoEntry[] = [];
    for (const file of Array.from(list)) {
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        setError(`"${file.name}" is not a supported format (JPEG, PNG, or WebP only).`);
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setError(`"${file.name}" exceeds the 25MB limit.`);
        return;
      }
      additions.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    setPhotos([...photos, ...additions]);
  };

  const removePhoto = (index: number) => {
    const photo = photos[index];
    if (photo.file) URL.revokeObjectURL(photo.previewUrl);
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const makeMain = (index: number) => {
    if (index === 0) return;
    const next = [...photos];
    const [photo] = next.splice(index, 1);
    next.unshift(photo);
    setPhotos(next);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const year = parseInt(fields.year, 10);
    const price = parseFloat(fields.price.replace(/[$,]/g, ""));
    const mileage = parseInt(fields.mileage.replace(/,/g, ""), 10);
    if (Number.isNaN(year) || Number.isNaN(price) || Number.isNaN(mileage)) {
      setError("Year, price, and mileage must be valid numbers.");
      return;
    }

    setSaving(true);

    // Every photo is stored under its vehicle's id: "<vehicle-id>/<file>". The
    // bucket then says who owns what, instead of ownership being inferable only by
    // diffing every vehicle's images array against a flat bucket — which is how
    // ~100 photos silently went unaccounted for before 2026-07-16.
    //
    // A new vehicle has no id yet and photos upload before the row is inserted, so
    // mint the id here rather than letting Postgres default it. Same value is used
    // for the path and the insert, so the two can never disagree.
    const vehicleId = vehicle?.id ?? crypto.randomUUID();

    const uploadedNames: string[] = [];
    const images: string[] = [];
    for (const photo of photos) {
      if (photo.existing) {
        images.push(photo.existing);
        continue;
      }
      if (!photo.file) continue;
      const ext = photo.file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const fileName = `${vehicleId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(VEHICLE_PHOTOS_BUCKET)
        .upload(fileName, photo.file);
      if (uploadError) {
        // Roll back anything uploaded in this batch
        if (uploadedNames.length > 0) {
          const { error: cleanupError } = await supabase.storage
            .from(VEHICLE_PHOTOS_BUCKET)
            .remove(uploadedNames);
          if (cleanupError) console.error("Photo rollback failed:", cleanupError.message);
        }
        setError(`Photo upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      uploadedNames.push(fileName);
      images.push(fileName);
    }

    const vehicleData: VehicleInput = {
      year,
      make: fields.make.trim(),
      model: fields.model.trim(),
      trim: fields.trim.trim() || null,
      vin:
        fields.vin.trim() ||
        `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      stock_number: fields.stock_number.trim() || null,
      price,
      mileage,
      payment_est: fields.payment_est.trim() || null,
      location: fields.location,
      type: fields.type,
      status: fields.status,
      badge: fields.badge.trim() || null,
      engine: fields.engine.trim() || null,
      exterior_color: fields.exterior_color.trim() || null,
      interior_color: fields.interior_color.trim() || null,
      description: fields.description.trim() || null,
      images,
      is_manual: vehicle?.is_manual ?? true,
    };

    const { error: saveError } = vehicle
      ? await supabase.from("vehicles").update(vehicleData).eq("id", vehicle.id)
      : // id is supplied rather than defaulted so it matches the photo paths above
        await supabase.from("vehicles").insert([{ ...vehicleData, id: vehicleId }]);

    if (saveError) {
      if (uploadedNames.length > 0) {
        const { error: cleanupError } = await supabase.storage
          .from(VEHICLE_PHOTOS_BUCKET)
          .remove(uploadedNames);
        if (cleanupError) console.error("Photo rollback failed:", cleanupError.message);
      }
      setError(friendlySaveError(saveError.message));
      setSaving(false);
      return;
    }

    // On edit, clean up stored photos that were removed from the vehicle
    if (vehicle) {
      const kept = new Set(images);
      const orphans = (vehicle.images ?? []).filter(
        img => img && !img.startsWith("http://") && !img.startsWith("https://") && !kept.has(img)
      );
      if (orphans.length > 0) {
        const { error: orphanError } = await supabase.storage
          .from(VEHICLE_PHOTOS_BUCKET)
          .remove(orphans);
        if (orphanError) console.error("Orphaned photo cleanup failed:", orphanError.message);
      }
    }

    photos.forEach(p => {
      if (p.file) URL.revokeObjectURL(p.previewUrl);
    });
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold uppercase">{vehicle ? "Edit Vehicle" : "Add Vehicle"}</h2>
        <button type="button" onClick={onCancel} className="text-zinc-400 hover:text-white uppercase font-bold text-sm">
          ← Back to Inventory
        </button>
      </div>

      {error && (
        <div className="bg-red-950/50 text-red-400 border border-red-900 p-3 rounded mb-4 text-sm font-medium">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className={labelClass}>Year *</label>
          <input type="number" required min={1900} max={2100} value={fields.year} onChange={set("year")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Make *</label>
          <input type="text" required value={fields.make} onChange={set("make")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Model *</label>
          <input type="text" required value={fields.model} onChange={set("model")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Trim</label>
          <input type="text" value={fields.trim} onChange={set("trim")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Price ($) *</label>
          <input type="text" required inputMode="decimal" value={fields.price} onChange={set("price")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Mileage *</label>
          <input type="text" required inputMode="numeric" value={fields.mileage} onChange={set("mileage")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>VIN (blank = auto)</label>
          <input type="text" value={fields.vin} onChange={set("vin")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Stock #</label>
          <input type="text" value={fields.stock_number} onChange={set("stock_number")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Est. Payment</label>
          <input type="text" placeholder="e.g. $250/mo" value={fields.payment_est} onChange={set("payment_est")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Location *</label>
          <select value={fields.location} onChange={set("location")} className={inputClass}>
            {siteConfig.locations.map(l => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Type *</label>
          <select value={fields.type} onChange={set("type")} className={inputClass}>
            {TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Status *</label>
          <select value={fields.status} onChange={set("status")} className={inputClass}>
            {STATUSES.map(s => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Badge</label>
          <input type="text" placeholder="e.g. Just Arrived" value={fields.badge} onChange={set("badge")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Engine</label>
          <input type="text" placeholder="e.g. 5.7L V8" value={fields.engine} onChange={set("engine")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Exterior Color</label>
          <div className="relative">
            <input type="text" placeholder="e.g. Liquid Carbon" value={fields.exterior_color} onChange={set("exterior_color")} className={`${inputClass} pl-9`} />
            {fields.exterior_color && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2">
                <ColorSwatch name={fields.exterior_color} size={14} />
              </span>
            )}
          </div>
        </div>
        <div>
          <label className={labelClass}>Interior Color</label>
          <div className="relative">
            <input type="text" placeholder="e.g. Ebony" value={fields.interior_color} onChange={set("interior_color")} className={`${inputClass} pl-9`} />
            {fields.interior_color && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2">
                <ColorSwatch name={fields.interior_color} size={14} />
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className={labelClass}>Description</label>
        <textarea rows={3} value={fields.description} onChange={set("description")} className={inputClass} />
      </div>

      <div className="mb-6">
        <label className={labelClass}>Photos (first photo is the main one)</label>
        <input
          type="file"
          accept={ALLOWED_PHOTO_TYPES.join(",")}
          multiple
          onChange={e => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          className="block text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-zinc-800 file:text-white file:font-bold hover:file:bg-zinc-700 file:cursor-pointer"
        />
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-4">
            {photos.map((photo, i) => (
              <div key={photo.previewUrl} className="relative w-32">
                <div className={`relative h-24 w-32 bg-black rounded overflow-hidden border ${i === 0 ? "border-primary" : "border-zinc-800"}`}>
                  <Image src={photo.previewUrl} alt="" fill sizes="128px" className="object-cover" unoptimized={!!photo.file} />
                  {i === 0 && (
                    <span className="absolute top-1 left-1 bg-primary text-[10px] font-bold uppercase px-1.5 py-0.5 rounded">
                      Main
                    </span>
                  )}
                </div>
                <div className="flex justify-between mt-1 text-[11px] font-bold uppercase">
                  {i !== 0 ? (
                    <button type="button" onClick={() => makeMain(i)} className="text-zinc-400 hover:text-white">
                      Make main
                    </button>
                  ) : (
                    <span />
                  )}
                  <button type="button" onClick={() => removePhoto(i)} className="text-red-500 hover:text-red-400">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-primary text-zinc-950 font-bold py-3 px-8 rounded uppercase tracking-wider text-sm transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : vehicle ? "Save Changes" : "Publish Vehicle"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-8 rounded uppercase tracking-wider text-sm transition-colors border border-zinc-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
