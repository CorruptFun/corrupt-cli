"use client";
import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { resolveVehicleImageUrl, resolveMainVehicleImage } from "@/lib/images";
import ColorSwatch from "@/components/ui/ColorSwatch";
import { useToast } from "@/components/ui/Toast";
import { siteConfig, getLocationLabel } from "@/config/site";
import type { CreditApplicationInsert, Vehicle } from "@/lib/types";

export default function VehicleDetailsModal({
  vehicle,
  onClose,
  onApply,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onApply: (vehicle: Vehicle) => void;
}) {
  const images =
    vehicle.images && vehicle.images.length > 0
      ? vehicle.images.map(img => resolveVehicleImageUrl(img) ?? resolveMainVehicleImage(null))
      : [resolveMainVehicleImage(null)];
  const [activeImage, setActiveImage] = useState(0);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  // special_notes is a honeypot: hidden from humans, tempting to bots. Named to
  // match the equivalent field in FinancingSection.tsx.
  const [inquiry, setInquiry] = useState({ name: "", phone: "", message: "", special_notes: "" });
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();
  const supabase = createClient();

  const isSold = vehicle.status === "sold";
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const locLabel = `📍 ${getLocationLabel(vehicle.location)}`;
  const badgeText = isSold ? "Just Sold" : vehicle.badge;

  const copyLink = async () => {
    const url = `${window.location.origin}/?vin=${encodeURIComponent(vehicle.vin)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("❌ Could not copy the link. Please copy the URL from the address bar.");
    }
  };

  const submitInquiry = async () => {
    // Honeypot: only a bot fills a field it cannot see. Every insert here fires a
    // Resend email via an AFTER INSERT trigger, so unfiltered spam costs money and
    // buries real leads. Mirrors FinancingSection.tsx:98.
    if (inquiry.special_notes) {
      showToast("❌ Submission failed. Please try again.");
      return;
    }
    const name = inquiry.name.trim();
    const phone = inquiry.phone.trim();
    if (!name || !phone) {
      showToast("❌ Please enter your name and phone number.");
      return;
    }
    const appData: CreditApplicationInsert = {
      financing_type: "vehicle_inquiry",
      full_name: name,
      phone,
      email: null,
      monthly_income: null,
      employer: null,
      target_terms: inquiry.message.trim() || "Customer expressed interest via Quick Inquiry",
      vehicle_preferences: title,
      status: "pending",
      vehicle_of_interest: {
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        price: vehicle.price,
        mileage: vehicle.mileage,
        image_url: resolveMainVehicleImage(vehicle.images),
      },
    };
    const { error } = await supabase.from("credit_applications").insert([appData]);
    if (error) {
      console.error("Error submitting inquiry:", error.message);
      showToast(`❌ Error submitting inquiry: ${error.message}`);
    } else {
      showToast(`🎉 Inquiry sent! We'll reach out about the ${title} shortly.`, 6000);
      setInquirySent(true);
      setInquiryOpen(false);
    }
  };

  return (
    <div
      className="details-modal fixed inset-0 bg-black/95 backdrop-blur-md z-[999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="details-modal-container bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 md:p-8 transition-all duration-300"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-6 border-b border-zinc-900 pb-4">
          <div>
            <span className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              {locLabel}
            </span>
            <h2 className="text-2xl md:text-3xl font-black text-white mt-2">{title}</h2>
            {vehicle.trim && <p className="text-zinc-500 text-xs mt-0.5">{vehicle.trim}</p>}
          </div>
          <button onClick={onClose} aria-label="Close details" className="text-zinc-500 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left: gallery */}
          <div className="space-y-4">
            <div className="relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 aspect-video md:aspect-[4/3]">
              <Image src={images[activeImage]} alt={title} fill sizes="(max-width: 768px) 100vw, 40vw" className="object-cover" />
              {badgeText && (
                <div className="absolute top-4 left-4 bg-zinc-800 text-white text-[10px] font-black px-3 py-1 rounded uppercase tracking-wider badge-shadow">
                  {badgeText}
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="thumb-strip">
                {images.map((url, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${url}-${idx}`}
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    className={idx === activeImage ? "active-thumb" : ""}
                    onClick={() => setActiveImage(idx)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: specs and actions */}
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex items-baseline justify-between border-b border-zinc-900 pb-4 mb-4">
                <div>
                  <span className="block text-[10px] text-zinc-500 uppercase tracking-widest">Cash Price</span>
                  <span className="text-3xl font-black text-white">
                    {isSold ? "---" : vehicle.price > 0 ? `$${vehicle.price.toLocaleString()}` : "Contact Dealer"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] text-zinc-500 uppercase tracking-widest">Estimated Rate</span>
                  <span className="text-lg font-black text-zinc-300">
                    {isSold ? "Sold" : vehicle.payment_est ?? ""}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs mb-6 bg-zinc-900/20 border border-zinc-800/40 rounded-lg p-4">
                <div>
                  <span className="text-zinc-500 block">Mileage</span>
                  <span className="font-bold text-white">{vehicle.mileage.toLocaleString()} miles</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Category</span>
                  <span className="font-bold text-white uppercase">{vehicle.type}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Engine</span>
                  <span className="font-bold text-white truncate">{vehicle.engine ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Exterior</span>
                  {vehicle.exterior_color ? (
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <ColorSwatch name={vehicle.exterior_color} />
                      <span className="truncate">{vehicle.exterior_color}</span>
                    </span>
                  ) : (
                    <span className="font-bold text-white">N/A</span>
                  )}
                </div>
                <div>
                  <span className="text-zinc-500 block">Interior</span>
                  {vehicle.interior_color ? (
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <ColorSwatch name={vehicle.interior_color} />
                      <span className="truncate">{vehicle.interior_color}</span>
                    </span>
                  ) : (
                    <span className="font-bold text-white">N/A</span>
                  )}
                </div>
                <div>
                  <span className="text-zinc-500 block">Stock Number</span>
                  <span className="font-bold text-white">{vehicle.stock_number ? `#${vehicle.stock_number}` : "N/A"}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">VIN (Secure ID)</span>
                  <span className="font-bold text-white font-mono break-all">{vehicle.vin || "N/A"}</span>
                </div>
              </div>

              <p className="text-zinc-400 text-xs leading-relaxed mb-6">
                {vehicle.description ||
                  "Quality vetted, ready for local roads. This vehicle has passed our multi-point inspection checks. We guarantee easy in-house financing (Buy Here Pay Here) and flexible lender bank approvals. Se Habla Español!"}
              </p>
            </div>

            <div>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={`tel:${siteConfig.contact.phone.raw}`}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white py-3.5 rounded-lg font-black uppercase text-center tracking-wider text-xs border border-zinc-800 transition-all duration-300"
                >
                  📞 Call Dealership
                </a>
                {!isSold && (
                  <button
                    onClick={() => onApply(vehicle)}
                    className="flex-1 bg-primary text-zinc-950 py-3.5 rounded-lg font-black uppercase tracking-wider text-xs transition-all duration-300 transform hover:scale-105"
                  >
                    📝 Apply for Financing
                  </button>
                )}
              </div>

              {/* Quick Inquiry */}
              {!isSold && (
                <div className="mt-4">
                  <button
                    onClick={() => !inquirySent && setInquiryOpen(open => !open)}
                    disabled={inquirySent}
                    className={`w-full text-white py-3.5 rounded-lg font-black uppercase tracking-wider text-xs transition-all duration-300 flex items-center justify-center gap-2 ${
                      inquirySent
                        ? "bg-zinc-800 cursor-not-allowed"
                        : "bg-emerald-600 hover:bg-emerald-500 transform hover:scale-105"
                    }`}
                  >
                    {inquirySent ? (
                      "✅ Inquiry Sent!"
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        I&apos;m Interested — Get More Info
                      </>
                    )}
                  </button>
                  {inquiryOpen && !inquirySent && (
                    <div className="mt-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">
                        Quick Inquiry — We&apos;ll reach out ASAP
                      </p>
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Your Name"
                          value={inquiry.name}
                          onChange={e => setInquiry({ ...inquiry, name: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
                        />
                        <input
                          type="tel"
                          placeholder="Phone Number"
                          value={inquiry.phone}
                          onChange={e => setInquiry({ ...inquiry, phone: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
                        />
                        <input
                          type="text"
                          placeholder="Optional message (e.g. 'Is this still available?')"
                          value={inquiry.message}
                          onChange={e => setInquiry({ ...inquiry, message: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
                        />
                        {/* Honeypot — hidden from humans and screen readers, bots fill it. */}
                        <input
                          type="text"
                          name="special_notes"
                          tabIndex={-1}
                          autoComplete="off"
                          aria-hidden="true"
                          value={inquiry.special_notes}
                          onChange={e => setInquiry({ ...inquiry, special_notes: e.target.value })}
                          className="hidden"
                        />
                        <button
                          onClick={submitInquiry}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-black uppercase tracking-wider text-xs transition-all"
                        >
                          Send Inquiry
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={copyLink}
                  className="flex-1 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {copied ? "Copied!" : "Copy Vehicle Link"}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print / Save PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
