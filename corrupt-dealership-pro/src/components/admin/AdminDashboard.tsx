"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import InventoryManager from "@/components/admin/InventoryManager";
import ApplicationsManager from "@/components/admin/ApplicationsManager";
import WhitelistManager from "@/components/admin/WhitelistManager";
import ErrorLogs from "@/components/admin/ErrorLogs";
import DashboardStats from "@/components/admin/DashboardStats";

type Tab = "inventory" | "applications" | "admins" | "logs";

const TABS: { key: Tab; label: string }[] = [
  { key: "inventory", label: "Inventory" },
  { key: "applications", label: "Applications" },
  { key: "admins", label: "Admins" },
  { key: "logs", label: "Logs" },
];

export default function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("inventory");
  const [adminEmail, setAdminEmail] = useState("");
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setAdminEmail(session?.user.email ?? "");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabClass = (active: boolean) =>
    `px-5 py-2 text-sm font-bold uppercase tracking-wider rounded transition-colors ${
      active ? "bg-zinc-800 text-white border border-zinc-700" : "text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800"
    }`;

  return (
    <div className="min-h-screen p-4 md:p-8 text-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap gap-4 justify-between items-center mb-8 pb-4 border-b border-zinc-800">
          <div>
            <h1 className="text-2xl font-black italic tracking-tighter uppercase text-primary">Dealer Portal</h1>
            {adminEmail && <p className="text-xs text-zinc-500 mt-1">{adminEmail}</p>}
          </div>
          <button onClick={onSignOut} className="text-sm text-zinc-400 hover:text-white uppercase font-bold">
            Sign Out
          </button>
        </div>

        <DashboardStats />

        <div className="flex flex-wrap gap-3 mb-8">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={tabClass(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "inventory" && <InventoryManager />}
        {tab === "applications" && <ApplicationsManager />}
        {tab === "admins" && <WhitelistManager />}
        {tab === "logs" && <ErrorLogs />}
      </div>
    </div>
  );
}
