"use client";
import { useLanguage } from "@/lib/i18n";
import { siteConfig } from "@/config/site";

export default function MobileContactBar() {
  const { t } = useLanguage();

  return (
    <div className="mobile-contact-bar fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 px-4 py-3 flex gap-3">
      <a
        href={`tel:${siteConfig.contact.phone.raw}`}
        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-black uppercase text-xs tracking-wider text-center transition-all flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <span>{t("callNow")}</span>
      </a>
      <a
        href={`sms:${siteConfig.contact.phone.raw}`}
        className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-lg font-black uppercase text-xs tracking-wider text-center transition-all flex items-center justify-center gap-2 border border-zinc-700"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span>{t("textUs")}</span>
      </a>
    </div>
  );
}
