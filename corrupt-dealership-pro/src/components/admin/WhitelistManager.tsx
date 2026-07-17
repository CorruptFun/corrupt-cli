"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AuthorizedAdmin {
  id: string;
  email: string;
  created_at: string;
}

export default function WhitelistManager() {
  const [admins, setAdmins] = useState<AuthorizedAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("authorized_admins")
      .select("*")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(`Failed to load admins: ${error.message}`);
        } else {
          setAdmins(data as AuthorizedAdmin[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("authorized_admins")
      .insert([{ email }])
      .select()
      .single();
    setSaving(false);
    if (error) {
      setError(
        error.code === "42501"
          ? "Only super admins can add dealer logins."
          : `Failed to add admin: ${error.message}`
      );
    } else {
      setAdmins([...admins, data as AuthorizedAdmin]);
      setNewEmail("");
      setNotice(`${email} can now sign in to the dealer portal.`);
    }
  };

  const removeAdmin = async (admin: AuthorizedAdmin) => {
    if (!window.confirm(`Remove dealer portal access for ${admin.email}?`)) return;
    setError("");
    setNotice("");
    const { error, count } = await supabase
      .from("authorized_admins")
      .delete({ count: "exact" })
      .eq("id", admin.id);
    if (error) {
      setError(
        error.code === "42501"
          ? "Only super admins can remove dealer logins."
          : `Failed to remove admin: ${error.message}`
      );
    } else if (!count) {
      // RLS silently filters rows this user may not delete
      setError("Only super admins can remove dealer logins.");
    } else {
      setAdmins(admins.filter(a => a.id !== admin.id));
      setNotice(`${admin.email} no longer has dealer portal access.`);
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold uppercase mb-2">Authorized Admins</h2>
      <p className="text-zinc-500 text-sm mb-6">
        Emails on this list can sign in to the dealer portal. Regular admins see only their own entry; adding and
        removing requires a super admin account.
      </p>

      {error && (
        <div className="bg-red-950/50 text-red-400 border border-red-900 p-3 rounded mb-4 text-sm font-medium">{error}</div>
      )}
      {notice && (
        <div className="bg-emerald-950/50 text-emerald-400 border border-emerald-900 p-3 rounded mb-4 text-sm font-medium">
          {notice}
        </div>
      )}

      <form onSubmit={addAdmin} className="flex gap-3 mb-6">
        <input
          type="email"
          required
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder="new-admin@example.com"
          className="flex-1 bg-black border border-zinc-800 rounded p-3 text-white text-sm focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="bg-primary text-zinc-950 font-bold px-5 rounded uppercase tracking-wider text-xs transition-colors disabled:opacity-50"
        >
          {saving ? "Adding…" : "+ Add"}
        </button>
      </form>

      {loading ? (
        <p className="text-zinc-500 py-8 text-center">Loading admins…</p>
      ) : admins.length === 0 ? (
        <p className="text-zinc-500 py-8 text-center">No entries visible to your account.</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800/60">
          {admins.map(admin => (
            <div key={admin.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <span className="block text-white font-bold text-sm truncate">{admin.email}</span>
                <span className="block text-[10px] text-zinc-500 uppercase">
                  Added {new Date(admin.created_at).toLocaleDateString()}
                </span>
              </div>
              <button
                onClick={() => removeAdmin(admin)}
                className="text-red-500 hover:text-red-400 font-bold uppercase text-xs flex-shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
