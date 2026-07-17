"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { resolveVehicleImageUrl, resolveMainVehicleImage } from "@/lib/images";
import ColorSwatch from "@/components/ui/ColorSwatch";
import { getLocationLabel } from "@/config/site";
import type { Vehicle } from "@/lib/types";

const DEFAULT_DESCRIPTION =
  "Quality vetted, ready for the local roads. Guaranteed easy approvals with our direct dealership financing.";

export default function VehicleCard({
  vehicle,
  onOpenDetails,
}: {
  vehicle: Vehicle;
  onOpenDetails: (vehicle: Vehicle) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(0);

  const isSold = vehicle.status === "sold";
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const images =
    vehicle.images && vehicle.images.length > 0
      ? vehicle.images.map(img => resolveVehicleImageUrl(img) ?? resolveMainVehicleImage(null))
      : [resolveMainVehicleImage(null)];
  const hasCarousel = images.length > 1;

  const locLabel = `📍 ${getLocationLabel(vehicle.location)}`;
  let paymentLabel = vehicle.payment_est ?? "";
  if (isSold) paymentLabel = "Sold";
  const badgeText = isSold ? "Just Sold" : vehicle.badge;

  const slide = (direction: number) => {
    setCurrentIndex(current => (current + direction + images.length) % images.length);
  };

  return (
    <div
      className={`car-card bg-zinc-950 rounded-xl overflow-hidden flex flex-col justify-between transition-all duration-300 border border-zinc-900 hover:border-zinc-500/30 ${
        isSold ? "opacity-80 border-dashed" : ""
      }`}
    >
      {/* Image / carousel */}
      <div
        className={`relative h-52 overflow-hidden bg-zinc-900 cursor-pointer${hasCarousel ? " card-carousel group" : ""}`}
        onClick={() => onOpenDetails(vehicle)}
        onTouchStart={e => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={e => {
          if (!hasCarousel) return;
          const diff = e.changedTouches[0].clientX - touchStartX.current;
          if (Math.abs(diff) > 40) slide(diff > 0 ? -1 : 1);
        }}
      >
        {images.map((url, idx) => (
          <Image
            key={`${url}-${idx}`}
            src={url}
            alt={hasCarousel ? `${title} - Photo ${idx + 1}` : title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={`object-cover ${isSold ? "grayscale-[40%]" : ""} ${idx !== currentIndex ? "hidden" : ""}`}
          />
        ))}

        {hasCarousel && (
          <>
            <button
              aria-label="Previous photo"
              className="carousel-arrow absolute top-1/2 -translate-y-1/2 left-2 w-7 h-7 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white z-10 transition-colors"
              onClick={e => {
                e.stopPropagation();
                slide(-1);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              aria-label="Next photo"
              className="carousel-arrow absolute top-1/2 -translate-y-1/2 right-2 w-7 h-7 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white z-10 transition-colors"
              onClick={e => {
                e.stopPropagation();
                slide(1);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
              {images.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === currentIndex ? "bg-white" : "bg-white/50"}`}
                />
              ))}
            </div>
          </>
        )}

        {badgeText && (
          <div className="absolute top-4 left-4 bg-zinc-800 text-white text-[10px] font-black px-3 py-1 rounded uppercase tracking-wider badge-shadow">
            {badgeText}
          </div>
        )}
        {paymentLabel && (
          <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-sm text-zinc-300 text-xs font-black px-3 py-1 rounded">
            {paymentLabel}
          </div>
        )}
      </div>

      {/* Body */}
      <div className={`p-6 ${isSold ? "opacity-60" : ""}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-bold uppercase">
            {locLabel}
          </span>
          <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
            {vehicle.mileage.toLocaleString()} Miles
          </span>
        </div>
        <h3
          className="text-xl font-bold text-white mb-2 cursor-pointer hover:text-primary transition-colors"
          onClick={() => onOpenDetails(vehicle)}
        >
          {title} {vehicle.trim ?? ""}
        </h3>
        <p className="text-zinc-400 text-xs mb-4">{vehicle.description || DEFAULT_DESCRIPTION}</p>
        <div className="border-t border-zinc-900 pt-4 mb-4">
          {vehicle.engine || vehicle.exterior_color || vehicle.interior_color ? (
            <div className="space-y-1.5 text-[11px] text-zinc-400">
              {vehicle.exterior_color && (
                <div className="flex items-center gap-2">
                  <ColorSwatch name={vehicle.exterior_color} />
                  <span className="truncate">
                    {vehicle.exterior_color} <span className="text-zinc-600">Exterior</span>
                  </span>
                </div>
              )}
              {vehicle.interior_color && (
                <div className="flex items-center gap-2">
                  <ColorSwatch name={vehicle.interior_color} />
                  <span className="truncate">
                    {vehicle.interior_color} <span className="text-zinc-600">Interior</span>
                  </span>
                </div>
              )}
              {vehicle.engine && (
                <div className="flex items-center gap-2">
                  <svg className="w-3 h-3 text-zinc-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 003.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H8a1.65 1.65 0 001-1.51V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V8a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                  </svg>
                  <span className="truncate">{vehicle.engine}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
              <div>• Dealership Vetted</div>
              <div>• Se Habla Español</div>
              <div>• Warranty Eligible</div>
              <div>• Flexible Financing</div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 pt-0 border-t border-zinc-900/40">
        <div className="flex justify-between items-baseline pt-4">
          <div>
            <span className={`text-2xl font-black ${isSold ? "text-zinc-600" : "text-white"}`}>
              {isSold ? "---" : `$${vehicle.price.toLocaleString()}`}
            </span>
            <span className="block text-[10px] text-zinc-500 mt-0.5">{isSold ? "Sold" : "Cash Price"}</span>
          </div>
          {isSold ? (
            <button disabled className="text-xs font-bold bg-zinc-900 text-zinc-600 px-5 py-2.5 rounded-lg cursor-not-allowed uppercase tracking-wider">
              Sold
            </button>
          ) : (
            <button
              onClick={() => onOpenDetails(vehicle)}
              className="text-xs font-bold bg-primary text-zinc-950 px-5 py-2.5 rounded-lg transition-colors uppercase tracking-wider"
            >
              Details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
