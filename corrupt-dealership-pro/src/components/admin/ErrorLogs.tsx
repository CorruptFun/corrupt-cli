"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ErrorLog {
  id: string;
  created_at: string;
  page: string | null;
  error_message: string | null;
  error_stack: string | null;
  user_agent: string | null;
  device_info: string | null;
  url: string | null;
}

export default function ErrorLogs() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(`Failed to load error logs: ${error.message}`);
        } else {
          setLogs(data as ErrorLog[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearLogs = async () => {
    if (!window.confirm("Delete all error logs? This cannot be undone.")) return;
    setError("");
    const { error } = await supabase.from("error_logs").delete().gte("created_at", "1970-01-01");
    if (error) {
      setError(`Failed to clear logs: ${error.message}`);
    } else {
      setLogs([]);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-4 justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold uppercase">Error Logs</h2>
          <p className="text-zinc-500 text-xs mt-1">
            {logs.length} error{logs.length !== 1 ? "s" : ""} (showing last 100)
          </p>
        </div>
        {logs.length > 0 && (
          <button onClick={clearLogs} className="text-red-500 hover:text-red-400 font-bold uppercase text-xs">
            Clear All
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-950/50 text-red-400 border border-red-900 p-3 rounded mb-4 text-sm font-medium">{error}</div>
      )}

      {loading ? (
        <p className="text-zinc-500 py-8 text-center">Loading logs…</p>
      ) : logs.length === 0 ? (
        <p className="text-zinc-500 py-12 text-center border border-zinc-900 rounded-lg bg-zinc-950/20">
          ✅ No errors logged. Everything is running smoothly!
        </p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800/60">
          {logs.map(log => {
            const expanded = expandedId === log.id;
            return (
              <div key={log.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : log.id)}
                  className="w-full flex items-start gap-3 p-3 text-left text-xs hover:bg-zinc-800/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-white truncate">{log.error_message ?? "(no message)"}</div>
                    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-zinc-500 mt-0.5">
                      <span className="whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</span>
                      <span className="font-bold uppercase text-zinc-400">{log.page ?? "unknown"}</span>
                    </div>
                  </div>
                  <span className="text-zinc-600 flex-shrink-0 mt-0.5">{expanded ? "▲" : "▼"}</span>
                </button>
                {expanded && (
                  <div className="p-4 border-t border-zinc-800 text-xs space-y-2">
                    {log.url && <p className="text-zinc-400"><span className="text-zinc-600 uppercase font-bold">URL:</span> {log.url}</p>}
                    {(log.device_info || log.user_agent) && (
                      <p className="text-zinc-400">
                        <span className="text-zinc-600 uppercase font-bold">Device:</span> {log.device_info || log.user_agent}
                      </p>
                    )}
                    {log.error_stack && (
                      <pre className="bg-black border border-zinc-800 rounded p-3 text-zinc-400 overflow-x-auto whitespace-pre-wrap">
                        {log.error_stack}
                      </pre>
                    )}
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
