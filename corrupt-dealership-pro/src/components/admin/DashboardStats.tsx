"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Stats {
  totalVehicles: number;
  activeVehicles: number;
  soldVehicles: number;
  pendingApps: number;
}

function StatTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <span className="block text-3xl font-black text-white">{value ?? "—"}</span>
      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function DashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    const count = (table: string, filter?: { column: string; value: string }, negate = false) => {
      let query = supabase.from(table).select("*", { count: "exact", head: true });
      if (filter) query = negate ? query.neq(filter.column, filter.value) : query.eq(filter.column, filter.value);
      return query.then(({ count: c }) => c ?? 0);
    };
    Promise.all([
      count("vehicles"),
      count("vehicles", { column: "status", value: "active" }),
      count("vehicles", { column: "status", value: "sold" }),
      count("credit_applications", { column: "status", value: "pending" }),
    ]).then(([totalVehicles, activeVehicles, soldVehicles, pendingApps]) => {
      if (!cancelled) setStats({ totalVehicles, activeVehicles, soldVehicles, pendingApps });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <StatTile label="Total Vehicles" value={stats?.totalVehicles ?? null} />
      <StatTile label="Active Listings" value={stats?.activeVehicles ?? null} />
      <StatTile label="Sold" value={stats?.soldVehicles ?? null} />
      <StatTile label="Pending Applications" value={stats?.pendingApps ?? null} />
    </div>
  );
}
