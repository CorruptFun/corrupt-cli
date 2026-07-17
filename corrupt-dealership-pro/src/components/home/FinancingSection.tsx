"use client";
import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { resolveMainVehicleImage } from "@/lib/images";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { siteConfig, cityState } from "@/config/site";
import type { CreditApplicationInsert, Vehicle } from "@/lib/types";

const INCOME_OPTIONS: { label: string; numeric: number }[] = [
  { label: "$2,500 - $4,000", numeric: 3250 },
  { label: "$4,000+", numeric: 4000 },
  { label: "$1,500 - $2,500", numeric: 2000 },
  { label: "Under $1,500", numeric: 1200 },
];

const BANK_TAB_DESC =
  "Apply for a secure auto loan backed by our partner banks and credit unions. Best for clients with qualifying banking records.";
const BHPH_TAB_DESC =
  `No credit required. Your steady income is your credit. Set a down payment and weekly terms directly with ${siteConfig.brand.legalName}.`;

const inputClass =
  "w-full bg-zinc-900 border border-zinc-800 rounded p-3 text-sm text-white focus:outline-none focus:border-zinc-500";
const selectClass =
  "w-full bg-zinc-900 border border-zinc-800 rounded p-3 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500";
const calcInputClass =
  "w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-zinc-600";

function estimateMonthlyPayment(price: number, down: number, termMonths: number): number {
  const rate = 0.089; // 8.9% APR (reasonable BHPH rate)
  const principal = Math.max(price - down, 0);
  if (principal <= 0) return 0;
  const monthlyRate = rate / 12;
  return Math.round(
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths))) / (Math.pow(1 + monthlyRate, termMonths) - 1)
  );
}

export default function FinancingSection({
  selectedVehicle,
  onClearVehicle,
}: {
  selectedVehicle: Vehicle | null;
  onClearVehicle: () => void;
}) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const supabase = createClient();

  const [tab, setTab] = useState<"bank" | "bhph">("bank");
  // Bank payment estimator
  const [calcPrice, setCalcPrice] = useState("15000");
  const [calcDown, setCalcDown] = useState("2000");
  const [calcTerm, setCalcTerm] = useState("48");
  // BHPH budget calculator
  const [bhphDown, setBhphDown] = useState(1000);
  const [bhphWeekly, setBhphWeekly] = useState(100);
  const [bhphYears, setBhphYears] = useState(2.5);
  // Form fields the calculator writes into
  const [targetDown, setTargetDown] = useState("");
  const [targetWeekly, setTargetWeekly] = useState("");
  const [vehiclePref, setVehiclePref] = useState("Work Truck / Pickup");
  const [submitting, setSubmitting] = useState(false);

  const monthlyPayment = estimateMonthlyPayment(
    parseFloat(calcPrice) || 0,
    parseFloat(calcDown) || 0,
    parseInt(calcTerm, 10) || 48
  );
  const buyingPower = Math.round(bhphDown + bhphWeekly * 52 * bhphYears);

  const selectedTitle = selectedVehicle
    ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`
    : null;

  // Selecting a vehicle from the showroom pins it in the preference dropdown
  // (V1 behavior). State adjustment during render per react.dev's
  // "you might not need an effect" guidance.
  const [prevSelectedTitle, setPrevSelectedTitle] = useState(selectedTitle);
  if (prevSelectedTitle !== selectedTitle) {
    setPrevSelectedTitle(selectedTitle);
    if (selectedTitle) setVehiclePref(selectedTitle);
  }

  const applyCalculatorBudget = () => {
    setTab("bhph");
    setTargetDown(String(bhphDown));
    setTargetWeekly(String(bhphWeekly));
    document.getElementById("financing")?.scrollIntoView({ behavior: "smooth" });
    showToast("✅ Budget values applied to your In-House Credit Application! Complete the form below.");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    // Honeypot spam check (V1 behavior)
    if (String(formData.get("special_notes") ?? "")) {
      showToast("❌ Submission failed. Please try again.");
      return;
    }

    const name = String(formData.get("full_name") ?? "").trim();
    const income = String(formData.get("income") ?? "");
    const incomeNumeric = INCOME_OPTIONS.find(o => o.label === income)?.numeric ?? null;

    let employer: string | null = null;
    let targetTerms = "";
    if (tab === "bank") {
      employer = String(formData.get("employer") ?? "").trim() || "Not Listed";
      targetTerms = `Lender: ${formData.get("lender")}, Job Time: ${formData.get("job_time")}`;
    } else {
      targetTerms = `Down Payment: $${targetDown || "1000"}, Weekly Payment: $${targetWeekly || "100"}/week`;
    }

    const appData: CreditApplicationInsert = {
      financing_type: tab,
      full_name: name,
      phone: String(formData.get("phone") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim() || null,
      monthly_income: incomeNumeric,
      employer,
      target_terms: targetTerms,
      vehicle_preferences: vehiclePref,
      status: "pending",
      vehicle_of_interest: selectedVehicle
        ? {
            vin: selectedVehicle.vin,
            year: selectedVehicle.year,
            make: selectedVehicle.make,
            model: selectedVehicle.model,
            trim: selectedVehicle.trim,
            price: selectedVehicle.price,
            mileage: selectedVehicle.mileage,
            image_url: resolveMainVehicleImage(selectedVehicle.images),
          }
        : null,
    };

    setSubmitting(true);
    const { error } = await supabase.from("credit_applications").insert([appData]);
    setSubmitting(false);

    if (error) {
      console.error("Error submitting credit application:", error.message);
      showToast(`❌ Error submitting application: ${error.message}`);
    } else {
      showToast(`🎉 Application received! Thank you, ${name}. A ${siteConfig.brand.name} rep will contact you shortly.`, 6000);
      form.reset();
      setTargetDown("");
      setTargetWeekly("");
      setVehiclePref("Work Truck / Pickup");
      onClearVehicle();
    }
  };

  const tabClass = (active: boolean) =>
    `flex-1 pb-3 text-center text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
      active ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
    }`;

  return (
    <section id="financing" className="gray-gradient-bg py-20 px-6 border-y border-zinc-800">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-5">
          <span className="text-zinc-400 font-extrabold text-xs uppercase tracking-widest">{t("preApproval")}</span>
          <h2 className="text-3xl md:text-4xl font-black text-white mt-1 mb-4 leading-tight">{t("flexibleFinancing")}</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">{t("financingDesc")}</p>

          <div className="space-y-4">
            <div className="flex items-start space-x-3 text-sm text-zinc-300">
              <span className="text-zinc-400 text-lg">✓</span>
              <div>
                <span className="font-bold text-white block">🏦 {t("bankPartners")}</span>
                <span className="text-xs text-zinc-500">{t("bankDesc")}</span>
              </div>
            </div>
            <div className="flex items-start space-x-3 text-sm text-zinc-300">
              <span className="text-zinc-400 text-lg">✓</span>
              <div>
                <span className="font-bold text-white block">🚗 {t("bhph")}</span>
                <span className="text-xs text-zinc-500">{t("bhphDesc")}</span>
              </div>
            </div>
          </div>

          {/* Calculators — swap with the financing tab */}
          <div className="mt-8">
            {tab === "bank" ? (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 transition-all duration-300">
                <h4 className="text-xs font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  {t("paymentEstimator")}
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{t("vehiclePrice")}</label>
                    <input type="number" value={calcPrice} onChange={e => setCalcPrice(e.target.value)} className={calcInputClass} />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{t("downPayment")}</label>
                    <input type="number" value={calcDown} onChange={e => setCalcDown(e.target.value)} className={calcInputClass} />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{t("loanTerm")}</label>
                    <select value={calcTerm} onChange={e => setCalcTerm(e.target.value)} className={`${calcInputClass} cursor-pointer`}>
                      <option value="24">24 Months</option>
                      <option value="36">36 Months</option>
                      <option value="48">48 Months</option>
                      <option value="60">60 Months</option>
                      <option value="72">72 Months</option>
                    </select>
                  </div>
                  <div className="pt-3 border-t border-zinc-800 text-center">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">{t("estMonthly")}</span>
                    <span className="text-3xl font-black text-white">${monthlyPayment.toLocaleString()}</span>
                    <p className="text-[9px] text-zinc-600 mt-2">{t("calcDisclaimer")}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 transition-all duration-300">
                <h4 className="text-xs font-black text-white uppercase tracking-wider mb-4">BHPH Budget Calculator</h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-zinc-400">Down Payment</span>
                      <span className="text-zinc-300 font-bold">${bhphDown.toLocaleString()}</span>
                    </div>
                    <input
                      type="range"
                      min={500}
                      max={3000}
                      step={100}
                      value={bhphDown}
                      onChange={e => setBhphDown(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-zinc-400">Weekly Payment</span>
                      <span className="text-zinc-300 font-bold">${bhphWeekly.toLocaleString()}</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      step={10}
                      value={bhphWeekly}
                      onChange={e => setBhphWeekly(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-zinc-400">Term (Years)</span>
                      <span className="text-zinc-300 font-bold">
                        {bhphYears} Years ({Math.round(bhphYears * 12)} Mos)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1.5}
                      max={3.5}
                      step={0.5}
                      value={bhphYears}
                      onChange={e => setBhphYears(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-400"
                    />
                  </div>
                  <div className="pt-4 border-t border-zinc-800">
                    <div className="text-center">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Estimated Buying Power</span>
                      <span className="text-3xl font-black text-white">${buyingPower.toLocaleString()}</span>
                    </div>
                    <button
                      onClick={applyCalculatorBudget}
                      className="w-full mt-3 bg-zinc-950 border border-zinc-700 text-zinc-300 text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-zinc-800 hover:text-white transition-all uppercase tracking-wider"
                    >
                      Use This Budget →
                    </button>
                    <p className="text-[9px] text-zinc-600 mt-2 text-center">*Estimate only. Final terms set at signing.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pre-approval form */}
        <div className="lg:col-span-7 bg-zinc-950 p-6 md:p-8 rounded-xl border border-zinc-800 shadow-2xl">
          <div className="flex border-b border-zinc-900 mb-6">
            <button onClick={() => setTab("bank")} className={tabClass(tab === "bank")}>
              🏦 Outside Bank Financing
            </button>
            <button onClick={() => setTab("bhph")} className={tabClass(tab === "bhph")}>
              🚗 Buy Here Pay Here In-House
            </button>
          </div>

          <div className="mb-4">
            <p className="text-zinc-500 text-xs leading-relaxed">{tab === "bank" ? BANK_TAB_DESC : BHPH_TAB_DESC}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {selectedVehicle && selectedTitle && (
              <div className="mb-6 bg-zinc-900/60 border border-emerald-900/40 rounded-xl p-4 flex items-center gap-4">
                <div className="relative w-20 h-14 rounded-lg border border-zinc-800 flex-shrink-0 overflow-hidden">
                  <Image src={resolveMainVehicleImage(selectedVehicle.images)} alt={selectedTitle} fill sizes="80px" className="object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Applying For This Vehicle</p>
                  <p className="text-sm font-bold text-white truncate">
                    {selectedTitle}
                    {selectedVehicle.trim ? ` ${selectedVehicle.trim}` : ""}
                  </p>
                  <p className="text-xs text-zinc-400 font-mono">
                    {selectedVehicle.price ? `$${selectedVehicle.price.toLocaleString()}` : "Contact Dealer"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClearVehicle}
                  className="text-zinc-500 hover:text-white transition-colors flex-shrink-0"
                  title="Clear vehicle selection"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Honeypot anti-spam field */}
            <div className="hidden" aria-hidden="true">
              <input type="text" name="special_notes" tabIndex={-1} autoComplete="off" placeholder="Leave this empty" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase mb-2">{t("fullName")}</label>
                <input type="text" name="full_name" required maxLength={100} placeholder="John Doe" className={inputClass} />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase mb-2">{t("phone")}</label>
                <input
                  type="tel"
                  name="phone"
                  required
                  maxLength={20}
                  pattern="^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$"
                  title="Please enter a valid 10-digit phone number (e.g. (620) 555-0199 or 620-555-0199)"
                  placeholder="(620) 555-0199"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase mb-2">{t("email")}</label>
                <input type="email" name="email" maxLength={255} placeholder="john@example.com" className={inputClass} />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase mb-2">Monthly Take-Home Income</label>
                <select name="income" className={selectClass}>
                  {INCOME_OPTIONS.map(o => (
                    <option key={o.label} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {tab === "bank" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-zinc-400 text-xs font-bold uppercase mb-2">Current Employer</label>
                    <input type="text" name="employer" maxLength={100} placeholder="e.g. Acme Corp" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-bold uppercase mb-2">Time on Job</label>
                    <select name="job_time" className={selectClass}>
                      <option value="1+ Year">1+ Year</option>
                      <option value="2+ Years">2+ Years</option>
                      <option value="6-12 Months">6-12 Months</option>
                      <option value="Under 6 Months">Under 6 Months</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs font-bold uppercase mb-2">Preferred Lender Network</label>
                  <select name="lender" className={selectClass}>
                    <option value="Bank Financing">Bank Financing (Traditional Loan)</option>
                    <option value="Fast-Approval Lender">Fast-Approval Lender (Automated)</option>
                    <option value="Any Lender">Best Available Rate (All Partners)</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-zinc-400 text-xs font-bold uppercase mb-2">Target Down Payment ($)</label>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      placeholder="e.g. 1000"
                      value={targetDown}
                      onChange={e => setTargetDown(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-bold uppercase mb-2">Max Weekly Budget ($)</label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      placeholder="e.g. 100"
                      value={targetWeekly}
                      onChange={e => setTargetWeekly(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded text-[11px] text-zinc-400">
                  💡 <strong>No credit required.</strong> We finance you directly. If you have a driver&apos;s license, stable
                  income, and are a resident of the {cityState} area, you&apos;re pre-approved.
                </div>
              </div>
            )}

            <div>
              <label className="block text-zinc-400 text-xs font-bold uppercase mb-2">Vehicle Preference</label>
              <select value={vehiclePref} onChange={e => setVehiclePref(e.target.value)} className={selectClass}>
                <option value="Work Truck / Pickup">Work Truck / Pickup</option>
                <option value="Family SUV / Crossover">Family SUV / Crossover</option>
                <option value="Dependable Commuter Sedan">Dependable Commuter Sedan</option>
                <option value="Any Reliable Ride">Any Reliable Ride / Golf Car / Motorsports</option>
                {selectedTitle && <option value={selectedTitle}>Specifically: {selectedTitle}</option>}
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-zinc-950 py-3.5 rounded font-extrabold uppercase tracking-widest text-xs transition-colors duration-300 mt-2 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : t("submitApp")}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
