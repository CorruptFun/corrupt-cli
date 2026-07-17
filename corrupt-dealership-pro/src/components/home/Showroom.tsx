"use client";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import VehicleCard from "@/components/home/VehicleCard";
import VehicleDetailsModal from "@/components/home/VehicleDetailsModal";
import { siteConfig } from "@/config/site";
import type { Vehicle } from "@/lib/types";

type SortMode = "newest" | "price-low" | "price-high" | "mileage-low";

const TYPE_FILTERS: { value: string; i18nKey?: "allVehicles" | "trucks" | "suvs" | "sedans" | "golfCarts"; label: string }[] = [
  { value: "all", i18nKey: "allVehicles", label: "All Types" },
  { value: "truck", i18nKey: "trucks", label: "Trucks" },
  { value: "suv", i18nKey: "suvs", label: "SUVs" },
  { value: "sedan", i18nKey: "sedans", label: "Sedans" },
  { value: "coupe", label: "Coupes" },
  { value: "van", label: "Vans" },
  { value: "golfcart", i18nKey: "golfCarts", label: "Golf Carts" },
];

export default function Showroom({
  vehicles,
  onApply,
}: {
  vehicles: Vehicle[];
  onApply: (vehicle: Vehicle) => void;
}) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [typeFilter, setTypeFilter] = useState("all");
  const [locFilter, setLocFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [detailsVehicle, setDetailsVehicle] = useState<Vehicle | null>(null);

  // Debounced search (V1 used a 300ms debounce)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ?vin= deep linking (V1 behavior): open the modal on load, keep the URL in sync
  useEffect(() => {
    const vinParam = new URLSearchParams(window.location.search).get("vin");
    if (vinParam) {
      let decoded = vinParam;
      try {
        decoded = decodeURIComponent(vinParam);
      } catch {
        // fall back to the raw value
      }
      const vehicle = vehicles.find(v => v.vin === decoded);
      if (vehicle) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time URL deep-link sync on mount
        setDetailsVehicle(vehicle);
      } else {
        showToast("❌ The requested vehicle is no longer available or the link is invalid.");
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetails = (vehicle: Vehicle) => {
    setDetailsVehicle(vehicle);
    window.history.pushState({}, "", `/?vin=${encodeURIComponent(vehicle.vin)}`);
  };

  const closeDetails = () => {
    setDetailsVehicle(null);
    window.history.pushState({}, "", window.location.pathname);
  };

  const visibleVehicles = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    const filtered = vehicles.filter(v => {
      if (typeFilter !== "all" && v.type !== typeFilter) return false;
      if (locFilter !== "all" && v.location !== locFilter) return false;
      if (query) {
        const title = `${v.year} ${v.make} ${v.model} ${v.trim ?? ""}`.toLowerCase();
        if (!title.includes(query)) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      switch (sortMode) {
        case "price-low":
          return a.price - b.price;
        case "price-high":
          return b.price - a.price;
        case "mileage-low":
          return a.mileage - b.mileage;
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [vehicles, typeFilter, locFilter, debouncedSearch, sortMode]);

  const filterButtonClass = (active: boolean) =>
    active
      ? "bg-zinc-800 border border-zinc-700 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-colors"
      : "bg-zinc-900 border border-zinc-800 text-zinc-400 px-4 py-2 rounded text-xs font-bold uppercase tracking-wider hover:text-white transition-colors";

  return (
    <main id="inventory" className="max-w-7xl mx-auto px-6 py-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b border-zinc-900 pb-6">
        <div>
          <span className="text-zinc-400 font-bold uppercase text-xs tracking-widest">Available Stock</span>
          <h2 className="text-3xl md:text-4xl font-black text-white mt-1">Showroom Inventory</h2>
          <p className="text-zinc-500 mt-2 max-w-xl">
            All vehicles are fully inspected, dynamic, and road-ready. Filter by category or lot location below.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex flex-wrap gap-2">
          {TYPE_FILTERS.map(f => (
            <button key={f.value} onClick={() => setTypeFilter(f.value)} className={filterButtonClass(typeFilter === f.value)}>
              {f.i18nKey ? t(f.i18nKey) : f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-8">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`🔍  ${t("searchPlaceholder")}`}
          className="w-full max-w-md bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500 transition-all placeholder-zinc-600"
        />
      </div>

      {/* Location tabs — only shown when more than one lot is configured */}
      {siteConfig.locations.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-8 border-b border-zinc-900 pb-4">
          <button onClick={() => setLocFilter("all")} className={filterButtonClass(locFilter === "all")}>
            {t("allLots")}
          </button>
          {siteConfig.locations.map(loc => (
            <button key={loc.id} onClick={() => setLocFilter(loc.id)} className={filterButtonClass(locFilter === loc.id)}>
              {loc.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
          {visibleVehicles.length} {t("vehicles")}
        </span>
        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as SortMode)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 font-bold uppercase tracking-wider focus:outline-none focus:border-zinc-500 cursor-pointer"
        >
          <option value="newest">{t("newestFirst")}</option>
          <option value="price-low">{t("priceLow")}</option>
          <option value="price-high">{t("priceHigh")}</option>
          <option value="mileage-low">{t("mileageLow")}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {visibleVehicles.length === 0 ? (
          <div className="col-span-full text-center py-20 text-zinc-500 border border-zinc-900 rounded-xl bg-zinc-950/20">
            <span className="text-4xl block mb-4">🚗</span>
            <h3 className="text-lg font-bold text-white mb-1">No Vehicles in Stock</h3>
            <p className="text-sm max-w-md mx-auto">
              We are currently updating our showroom inventory. Please check back later or contact us directly!
            </p>
          </div>
        ) : (
          visibleVehicles.map(vehicle => <VehicleCard key={vehicle.id} vehicle={vehicle} onOpenDetails={openDetails} />)
        )}
      </div>

      {detailsVehicle && (
        <VehicleDetailsModal
          vehicle={detailsVehicle}
          onClose={closeDetails}
          onApply={vehicle => {
            closeDetails();
            onApply(vehicle);
          }}
        />
      )}
    </main>
  );
}
