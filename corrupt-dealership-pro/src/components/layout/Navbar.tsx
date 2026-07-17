"use client";
import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { siteConfig, cityState } from "@/config/site";

const NAV_LINKS = [
  { href: "#inventory", label: "Inventory" },
  { href: "#financing", label: "Easy Financing" },
  { href: "#about", label: "Our Dealership" },
  { href: "#contact", label: "Contact Us" },
];

export default function Navbar() {
  const { t, toggleLanguage } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="p-4 md:p-6 flex flex-wrap justify-between items-center border-b border-zinc-800/60 sticky top-0 bg-black/90 backdrop-blur-md z-50">
        <div className="flex items-center space-x-3">
          <div className="text-2xl md:text-3xl font-black italic tracking-tighter text-primary uppercase">
            {siteConfig.brand.name} <span className="text-white italic font-normal text-xl md:text-2xl">{siteConfig.brand.legalSuffix}</span>
          </div>
          <span className="hidden sm:inline-block bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
            {cityState}
          </span>
        </div>
        <div className="hidden lg:flex space-x-8 text-xs font-semibold uppercase tracking-widest text-zinc-300">
          {NAV_LINKS.map(link => (
            <a key={link.href} href={link.href} className="hover:text-primary transition-colors">
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex items-center space-x-4 mt-2 sm:mt-0">
          <span className="hidden sm:inline-block text-zinc-300 font-extrabold text-xs tracking-wider animate-pulse uppercase bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-full">
            Se Habla Español
          </span>
          <button
            onClick={toggleLanguage}
            className="text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-600"
          >
            {t("langToggle")}
          </button>
          <a
            href={`tel:${siteConfig.contact.phone.raw}`}
            className="bg-primary text-zinc-950 px-5 py-2 rounded-lg text-xs font-black tracking-wider transition-all duration-300 transform hover:scale-105"
          >
            CALL {siteConfig.contact.phone.display}
          </a>
          <button
            onClick={() => setMobileOpen(open => !open)}
            className="lg:hidden text-zinc-300 hover:text-white p-1.5 transition-colors"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-zinc-950 border-b border-zinc-800 sticky top-[65px] z-40">
          <div className="flex flex-col space-y-1 p-4 text-xs font-semibold uppercase tracking-widest text-zinc-300">
            {NAV_LINKS.map((link, i) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`hover:text-primary transition-colors py-2.5 ${i < NAV_LINKS.length - 1 ? "border-b border-zinc-900" : ""}`}
              >
                {link.label}
              </a>
            ))}
            <div className="flex items-center justify-between pt-2">
              <span className="text-zinc-400 font-extrabold text-xs tracking-wider uppercase">Se Habla Español 🇲🇽</span>
              <button
                onClick={toggleLanguage}
                className="text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-600"
              >
                {t("langToggle")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
