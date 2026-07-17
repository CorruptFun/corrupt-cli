"use client";
import Image from "next/image";
import { useLanguage } from "@/lib/i18n";

export default function Hero() {
  const { t } = useLanguage();

  return (
    <header className="relative h-[65vh] flex items-center justify-center overflow-hidden border-b border-zinc-900">
      <Image
        src="https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&q=80&w=2000"
        alt="Used Car Lot Hero"
        fill
        preload
        sizes="100vw"
        className="object-cover opacity-30"
      />
      <div className="absolute inset-0 hero-gradient" />
      <div className="relative z-10 text-center px-4 max-w-4xl">
        <span className="bg-zinc-800/20 border border-zinc-700/50 text-zinc-300 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest mb-6 inline-block">
          Premium Showroom & Flexible Financing
        </span>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black mb-4 tracking-tight leading-none text-white">
          {t("heroTitle")}
        </h1>
        <p className="text-base md:text-lg text-zinc-400 max-w-xl mx-auto font-normal mt-4 leading-relaxed">
          {t("heroSubtitle")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a
            href="#inventory"
            className="bg-primary text-zinc-950 px-8 py-3.5 rounded-lg font-bold text-sm tracking-wider uppercase transition-all duration-300"
          >
            {t("viewInventory")}
          </a>
          <a
            href="#financing"
            className="bg-transparent hover:bg-zinc-900 text-zinc-300 hover:text-white border border-zinc-700 px-8 py-3.5 rounded-lg font-bold text-sm tracking-wider uppercase transition-all duration-300"
          >
            {t("applyNow")}
          </a>
        </div>
      </div>
    </header>
  );
}
