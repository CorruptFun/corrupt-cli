"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { resolveVehicleImageUrl, VEHICLE_PHOTOS_BUCKET } from "@/lib/images";
import type { Vehicle, VehicleStatus } from "@/lib/types";
import VehicleForm from "@/components/admin/VehicleForm";

const STATUSES: VehicleStatus[] = ["active", "waiting_approval", "sold", "preapproved"];

const STATUS_LABELS: Record<VehicleStatus, string> = {
  active: "Active",
  waiting_approval: "Waiting Approval",
  sold: "Sold",
  preapproved: "Pre-Approved",
};

export default function InventoryManager() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cleaning, setCleaning] = useState(false);
  // Tidying storage is platform maintenance, not a dealership task — staff should
  // never see it. Super admins still need it: photos are now filed under their
  // vehicle and cleaned up automatically, but a failed request mid-delete can still
  // strand a file, and there is no other way to remove one (the Storage API is the
  // only correct path). Rare and hidden, not gone.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  // null = list view, "new" = add form, Vehicle = edit form
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  // Bumped to re-run the load effect after a form save
  const [reloadKey, setReloadKey] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(`Failed to load inventory: ${error.message}`);
        } else {
          setError("");
          setVehicles(data as Vehicle[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    // Same SECURITY DEFINER function the RLS policies use, so the button can never
    // appear for someone the database would refuse anyway.
    supabase.rpc("is_super_admin").then(({ data }) => {
      if (!cancelled) setIsSuperAdmin(data === true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Brings the bucket back to its invariant: every photo lives at
  // "<vehicle-id>/<file>", and nothing exists that no vehicle references.
  //
  // Two jobs, because there are two ways the bucket drifted:
  //  1. Photos uploaded before 2026-07-16 sit flat in the bucket root, so ownership
  //     was only inferable by diffing arrays. Referenced ones get moved into their
  //     vehicle's folder and the images array is repointed.
  //  2. storage.objects had no DELETE policy until then, so cleanups were silently
  //     denied and ~100 photos (102MB) went unaccounted for. Those get deleted.
  //
  // Idempotent and safe to re-run: once everything is foldered, "orphan" stops
  // being a guess and becomes "the folder's vehicle is gone, or the vehicle no
  // longer lists this file".
  const cleanUpOrphanedPhotos = async () => {
    setError("");
    setCleaning(true);
    try {
      const { data: rows, error: vehErr } = await supabase.from("vehicles").select("id, images");
      if (vehErr) {
        setError(`Could not read inventory: ${vehErr.message}`);
        return;
      }
      const byId = new Map(rows.map(r => [r.id as string, ((r.images as string[] | null) ?? [])]));
      const allRefs = rows.flatMap(r => (r.images as string[] | null) ?? []);

      // list() returns one level: files here, plus folder entries (id === null).
      const { data: top, error: listError } = await supabase.storage
        .from(VEHICLE_PHOTOS_BUCKET)
        .list("", { limit: 1000 });
      if (listError) {
        setError(`Could not list photos: ${listError.message}`);
        return;
      }
      const rootFiles = (top ?? []).filter(o => o.id !== null).map(o => o.name);
      const folders = (top ?? []).filter(o => o.id === null).map(o => o.name);

      // Anything already foldered: orphaned if its vehicle is gone, or the vehicle
      // no longer lists it. No substring guessing needed.
      const orphans: string[] = [];
      for (const folder of folders) {
        const { data: inner } = await supabase.storage
          .from(VEHICLE_PHOTOS_BUCKET)
          .list(folder, { limit: 1000 });
        const listed = byId.get(folder);
        for (const f of inner ?? []) {
          const path = `${folder}/${f.name}`;
          if (!listed || !listed.includes(path)) orphans.push(path);
        }
      }

      // Root files still use the old convention. A referenced one gets moved into
      // its owner's folder; an unreferenced one is orphaned debt.
      const moves: { from: string; to: string; vehicleId: string }[] = [];
      for (const name of rootFiles) {
        const owner = rows.find(r => ((r.images as string[] | null) ?? []).includes(name));
        if (owner) moves.push({ from: name, to: `${owner.id}/${name}`, vehicleId: owner.id as string });
        else if (!allRefs.some(img => img.includes(name))) orphans.push(name);
      }

      if (moves.length === 0 && orphans.length === 0) {
        setError("Storage is already organized — every photo is filed under its vehicle.");
        return;
      }
      const ok = window.confirm(
        `Storage cleanup:\n\n` +
          `• Move ${moves.length} photo${moves.length === 1 ? "" : "s"} into their vehicle's folder\n` +
          `• Permanently delete ${orphans.length} photo${orphans.length === 1 ? "" : "s"} no vehicle uses\n\n` +
          `Deletions cannot be undone. Continue?`
      );
      if (!ok) return;

      let moved = 0;
      for (const m of moves) {
        const { error: mvErr } = await supabase.storage
          .from(VEHICLE_PHOTOS_BUCKET)
          .move(m.from, m.to);
        if (mvErr) {
          setError(`Could not move ${m.from}: ${mvErr.message}`);
          return;
        }
        // Repoint the row immediately, per photo: a crash mid-run must never leave
        // a vehicle pointing at a path that no longer exists.
        const next = (byId.get(m.vehicleId) ?? []).map(img => (img === m.from ? m.to : img));
        byId.set(m.vehicleId, next);
        const { error: upErr } = await supabase
          .from("vehicles")
          .update({ images: next })
          .eq("id", m.vehicleId);
        if (upErr) {
          setError(`Moved ${m.from} but could not update its vehicle: ${upErr.message}`);
          return;
        }
        moved++;
      }

      let deleted = 0;
      if (orphans.length > 0) {
        const { error: rmErr } = await supabase.storage.from(VEHICLE_PHOTOS_BUCKET).remove(orphans);
        if (rmErr) {
          setError(`Moved ${moved}, but deletion failed: ${rmErr.message}`);
          return;
        }
        deleted = orphans.length;
      }
      setError(`Done — filed ${moved} photo(s) under their vehicle, deleted ${deleted} unused.`);
      setReloadKey(k => k + 1);
    } finally {
      setCleaning(false);
    }
  };

  // Only bare filenames live in our bucket; external URLs aren't ours to delete.
  const storedPhotosOf = (vehicle: Vehicle) =>
    (vehicle.images ?? []).filter(
      img => img && !img.startsWith("http://") && !img.startsWith("https://")
    );

  const updateStatus = async (vehicle: Vehicle, status: VehicleStatus) => {
    setError("");
    const previous = vehicles;
    setVehicles(vehicles.map(v => (v.id === vehicle.id ? { ...v, status } : v)));
    const { error } = await supabase.from("vehicles").update({ status }).eq("id", vehicle.id);
    if (error) {
      setVehicles(previous);
      setError(`Failed to update status: ${error.message}`);
      return;
    }
    if (status === "sold") await offerPhotoCleanup(vehicle);
  };

  // Sold vehicles are hidden from the public site (page.tsx filters out
  // status='sold'), so their photos are dead weight in storage. Deleting them is
  // irreversible and sales do fall through, so the admin decides — we never delete
  // photos as a silent side effect of a status change. Marking sold is never
  // blocked by this: it has already been saved by the time we ask.
  const offerPhotoCleanup = async (vehicle: Vehicle) => {
    const storedFiles = storedPhotosOf(vehicle);
    if (storedFiles.length === 0) return;

    const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const n = storedFiles.length;
    const ok = window.confirm(
      `"${title}" is now marked sold and hidden from the website.\n\n` +
        `Delete its ${n} photo${n === 1 ? "" : "s"} to free up storage?\n\n` +
        `This cannot be undone. If the sale falls through you would have to ` +
        `photograph and upload the vehicle again.`
    );
    if (!ok) return;

    const { error: storageError } = await supabase.storage
      .from(VEHICLE_PHOTOS_BUCKET)
      .remove(storedFiles);
    if (storageError) {
      setError(`Photos could not be deleted: ${storageError.message}`);
      return;
    }
    // Drop the now-dead filenames but keep any external URLs.
    const remaining = (vehicle.images ?? []).filter(img => !storedFiles.includes(img));
    const { error: updateError } = await supabase
      .from("vehicles")
      .update({ images: remaining })
      .eq("id", vehicle.id);
    if (updateError) {
      setError(`Photos were deleted, but the vehicle still lists them: ${updateError.message}`);
      return;
    }
    setVehicles(vs => vs.map(v => (v.id === vehicle.id ? { ...v, images: remaining } : v)));
  };

  const deleteVehicle = async (vehicle: Vehicle) => {
    const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    if (!window.confirm(`Delete "${title}" permanently? This cannot be undone.`)) return;

    setError("");
    const { error } = await supabase.from("vehicles").delete().eq("id", vehicle.id);
    if (error) {
      setError(`Failed to delete vehicle: ${error.message}`);
      return;
    }
    // Clean up storage photos (bare filenames only — external URLs aren't ours to delete)
    const storedFiles = storedPhotosOf(vehicle);
    if (storedFiles.length > 0) {
      const { error: storageError } = await supabase.storage
        .from(VEHICLE_PHOTOS_BUCKET)
        .remove(storedFiles);
      // The vehicle row is already gone, so a cleanup failure is a warning, not a
      // failure. It must still be visible: a missing storage DELETE policy denied
      // every one of these silently until 2026-07-16, orphaning ~100 files.
      if (storageError) {
        setError(`Vehicle deleted, but its photos could not be removed: ${storageError.message}`);
      }
    }
    setVehicles(vehicles.filter(v => v.id !== vehicle.id));
  };

  if (editing !== null) {
    return (
      <VehicleForm
        vehicle={editing === "new" ? null : editing}
        onSaved={() => {
          setEditing(null);
          setLoading(true);
          setReloadKey(k => k + 1);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-4 justify-between items-center mb-6">
        <h2 className="text-xl font-bold uppercase">Inventory ({vehicles.length})</h2>
        <div className="flex flex-wrap gap-3">
          {isSuperAdmin && (
            <button
              onClick={cleanUpOrphanedPhotos}
              disabled={cleaning}
              title="Maintenance: file every photo under its vehicle and delete ones nothing uses"
              className="border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 font-medium py-2 px-4 rounded uppercase tracking-wider text-xs transition-colors disabled:opacity-50"
            >
              {cleaning ? "Working…" : "Tidy Photos"}
            </button>
          )}
          <button
            onClick={() => setEditing("new")}
            className="bg-primary text-zinc-950 font-bold py-2 px-5 rounded uppercase tracking-wider text-sm transition-colors"
          >
            + Add Vehicle
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 text-red-400 border border-red-900 p-3 rounded mb-4 text-sm font-medium">{error}</div>
      )}

      {loading ? (
        <p className="text-zinc-500 py-8 text-center">Loading inventory…</p>
      ) : vehicles.length === 0 ? (
        <p className="text-zinc-500 py-8 text-center">No vehicles yet. Add your first one.</p>
      ) : (
        <>
        {/* Mobile: card list */}
        <div className="md:hidden space-y-3">
          {vehicles.map(vehicle => {
            const photo = resolveVehicleImageUrl(vehicle.images?.[0]);
            return (
              <div key={vehicle.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex gap-3">
                  <div className="w-24 h-16 bg-black rounded overflow-hidden relative flex-shrink-0">
                    {photo && <Image src={photo} alt="" fill sizes="96px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white text-sm truncate">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                      {vehicle.trim ? ` ${vehicle.trim}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {vehicle.stock_number ? `Stock #${vehicle.stock_number}` : vehicle.vin}
                    </p>
                    <p className="text-sm mt-1">
                      <span className="font-bold text-white">${vehicle.price.toLocaleString()}</span>
                      <span className="text-zinc-500"> · {vehicle.mileage.toLocaleString()} mi · </span>
                      <span className="text-zinc-500 capitalize">{vehicle.location}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-zinc-800/60">
                  <select
                    value={vehicle.status}
                    onChange={e => updateStatus(vehicle, e.target.value as VehicleStatus)}
                    className="bg-black border border-zinc-800 rounded p-2 text-white text-xs focus:border-zinc-500 focus:outline-none"
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <div className="whitespace-nowrap">
                    <button
                      onClick={() => setEditing(vehicle)}
                      className="text-zinc-300 hover:text-white font-bold uppercase text-xs mr-4 py-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteVehicle(vehicle)}
                      className="text-red-500 hover:text-red-400 font-bold uppercase text-xs py-2"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto bg-zinc-900 border border-zinc-800 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 uppercase text-xs border-b border-zinc-800">
                <th className="p-3">Photo</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Price</th>
                <th className="p-3">Mileage</th>
                <th className="p-3">Location</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map(vehicle => {
                const photo = resolveVehicleImageUrl(vehicle.images?.[0]);
                return (
                  <tr key={vehicle.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                    <td className="p-3">
                      <div className="w-20 h-14 bg-black rounded overflow-hidden relative">
                        {photo && (
                          <Image src={photo} alt="" fill sizes="80px" className="object-cover" />
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-white">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </span>
                      {vehicle.trim && <span className="text-zinc-400"> {vehicle.trim}</span>}
                      <div className="text-xs text-zinc-500">
                        {vehicle.stock_number ? `Stock #${vehicle.stock_number}` : vehicle.vin}
                      </div>
                    </td>
                    <td className="p-3 font-bold">${vehicle.price.toLocaleString()}</td>
                    <td className="p-3 text-zinc-400">{vehicle.mileage.toLocaleString()} mi</td>
                    <td className="p-3 text-zinc-400 capitalize">{vehicle.location}</td>
                    <td className="p-3">
                      <select
                        value={vehicle.status}
                        onChange={e => updateStatus(vehicle, e.target.value as VehicleStatus)}
                        className="bg-black border border-zinc-800 rounded p-2 text-white text-xs focus:border-zinc-500 focus:outline-none"
                      >
                        {STATUSES.map(s => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(vehicle)}
                        className="text-zinc-300 hover:text-white font-bold uppercase text-xs mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteVehicle(vehicle)}
                        className="text-red-500 hover:text-red-400 font-bold uppercase text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
