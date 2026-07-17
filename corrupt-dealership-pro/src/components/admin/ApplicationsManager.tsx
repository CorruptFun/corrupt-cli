"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import type { CreditApplication, CreditApplicationStatus } from "@/lib/types";

const STATUSES: CreditApplicationStatus[] = ["pending", "reviewed", "approved", "declined"];

const STATUS_COLORS: Record<CreditApplicationStatus, string> = {
  pending: "text-yellow-500",
  reviewed: "text-blue-400",
  approved: "text-green-500",
  declined: "text-red-500",
};

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-zinc-500 uppercase font-bold">{label}</dt>
      <dd className="text-sm text-white">{value}</dd>
    </div>
  );
}

export default function ApplicationsManager() {
  const [apps, setApps] = useState<CreditApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { showToast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("credit_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(`Failed to load applications: ${error.message}`);
        } else {
          setApps(data as CreditApplication[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-prepend new applications as customers submit them (V1 admin behavior)
  useEffect(() => {
    const channel = supabase
      .channel("credit-apps-admin")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "credit_applications" },
        payload => {
          const app = payload.new as CreditApplication;
          setApps(current => (current.some(a => a.id === app.id) ? current : [app, ...current]));
          showToast(`🔔 New ${app.financing_type === "vehicle_inquiry" ? "vehicle inquiry" : "application"} from ${app.full_name}`, 6000);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = async (app: CreditApplication, status: CreditApplicationStatus) => {
    setError("");
    const previous = apps;
    setApps(apps.map(a => (a.id === app.id ? { ...a, status } : a)));
    const { error } = await supabase.from("credit_applications").update({ status }).eq("id", app.id);
    if (error) {
      setApps(previous);
      setError(`Failed to update status: ${error.message}`);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold uppercase mb-6">Credit Applications ({apps.length})</h2>

      {error && (
        <div className="bg-red-950/50 text-red-400 border border-red-900 p-3 rounded mb-4 text-sm font-medium">{error}</div>
      )}

      {loading ? (
        <p className="text-zinc-500 py-8 text-center">Loading applications…</p>
      ) : apps.length === 0 ? (
        <p className="text-zinc-500 py-8 text-center">No applications yet.</p>
      ) : (
        <div className="space-y-3">
          {apps.map(app => {
            const expanded = expandedId === app.id;
            return (
              <div key={app.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : app.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-800/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white truncate">{app.full_name}</span>
                      <span className={`text-[10px] uppercase font-bold ${STATUS_COLORS[app.status]}`}>{app.status}</span>
                    </div>
                    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs text-zinc-500 mt-1">
                      <span>{new Date(app.created_at).toLocaleDateString()}</span>
                      <span className="text-zinc-400">{app.phone}</span>
                      <span className="uppercase font-bold">
                        {app.financing_type === "bhph"
                          ? "Buy Here Pay Here"
                          : app.financing_type === "vehicle_inquiry"
                            ? "Vehicle Inquiry"
                            : "Bank"}
                      </span>
                    </div>
                  </div>
                  <span className="text-zinc-600 flex-shrink-0">{expanded ? "▲" : "▼"}</span>
                </button>

                {expanded && (
                  <div className="border-t border-zinc-800 p-4">
                    <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <DetailRow label="Email" value={app.email} />
                      <DetailRow label="Employer" value={app.employer} />
                      <DetailRow label="Employment Status" value={app.employment_status} />
                      <DetailRow
                        label="Monthly Income"
                        value={app.monthly_income != null ? `$${app.monthly_income.toLocaleString()}` : null}
                      />
                      <DetailRow
                        label="Address"
                        value={
                          [app.street_address, app.city, app.state, app.zip_code].filter(Boolean).join(", ") || null
                        }
                      />
                      <DetailRow label="Target Terms" value={app.target_terms} />
                      <DetailRow label="Vehicle Preferences" value={app.vehicle_preferences} />
                    </dl>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-zinc-500 uppercase font-bold">Status:</label>
                      <select
                        value={app.status}
                        onChange={e => updateStatus(app, e.target.value as CreditApplicationStatus)}
                        className="bg-black border border-zinc-800 rounded p-2 text-white text-xs focus:border-zinc-500 focus:outline-none"
                      >
                        {STATUSES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
