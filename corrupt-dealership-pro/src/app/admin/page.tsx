"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { ToastProvider } from "@/components/ui/Toast";

export default function AdminPortal() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"login" | "otp" | "dashboard" | "loading">("loading");
  const [error, setError] = useState("");
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setStep(session ? "dashboard" : "login");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const normalizedEmail = email.trim().toLowerCase();

    // Verify against the admin whitelist (SECURITY DEFINER function) before
    // sending an OTP, so unknown emails can't create accounts via this portal.
    const { data: isAuthorized, error: authCheckError } = await supabase.rpc(
      "is_email_authorized",
      { test_email: normalizedEmail }
    );
    if (authCheckError) {
      setError("Unable to verify access. Please try again.");
      return;
    }
    if (!isAuthorized) {
      setError("This email is not authorized for dealer access.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({ email: normalizedEmail });
    if (error) {
      setError(error.message);
    } else {
      setEmail(normalizedEmail);
      setStep("otp");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const { error } = await supabase.auth.verifyOtp({ email, token: otp.trim(), type: "email" });
    if (error) {
      setError(error.message);
    } else {
      setStep("dashboard");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setStep("login");
  };

  if (step === "loading") return <div className="min-h-screen flex items-center justify-center text-white">Loading...</div>;

  if (step === "dashboard") {
    return (
      <ToastProvider>
        <AdminDashboard onSignOut={handleLogout} />
      </ToastProvider>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080808] p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 sm:p-8">
        <h1 className="text-2xl font-black text-white text-center uppercase tracking-tight mb-2">Dealer Access</h1>
        <p className="text-zinc-400 text-center text-sm mb-6">Restricted administrative portal.</p>
        
        {error && <div className="bg-red-950/50 text-red-400 border border-red-900 p-3 rounded mb-4 text-sm font-medium">{error}</div>}

        {step === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-black border border-zinc-800 rounded p-3 text-white focus:border-zinc-500 focus:outline-none" />
            </div>
            <button type="submit" className="w-full bg-primary text-zinc-950 font-extrabold py-3 rounded uppercase tracking-wider transition-colors text-sm">Send Access Code</button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">6-Digit Access Code</label>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} required placeholder="123456" className="w-full text-center tracking-widest text-2xl bg-black border border-zinc-800 rounded p-3 text-white focus:border-zinc-500 focus:outline-none" />
            </div>
            <button type="submit" className="w-full bg-primary text-zinc-950 font-extrabold py-3 rounded uppercase tracking-wider transition-colors text-sm">Verify & Login</button>
          </form>
        )}
      </div>
    </div>
  );
}
