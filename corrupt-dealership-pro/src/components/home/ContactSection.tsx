"use client";
import { useLanguage } from "@/lib/i18n";
import { siteConfig, fullAddress } from "@/config/site";

const MAPS_QUERY = encodeURIComponent(`${siteConfig.brand.name}, ${fullAddress}`);
const MAPS_EMBED_SRC = `https://maps.google.com/maps?q=${MAPS_QUERY}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
const MAPS_LINK = `https://maps.google.com/maps?q=${MAPS_QUERY}`;

export default function ContactSection() {
  const { t } = useLanguage();

  return (
    <section id="contact" className="bg-zinc-950 py-16 border-t border-zinc-900">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <span className="text-primary font-bold uppercase text-xs tracking-widest">{t("getInTouch")}</span>
          <h3 className="text-2xl font-black text-white mt-1 mb-6">{t("visitUs")}</h3>
          <div className="space-y-6 text-zinc-400 text-sm">
            <div>
              <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">Our Location</h4>
              <p>{fullAddress}</p>
            </div>
            <div>
              <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">Hours of Operation</h4>
              <p>Monday - Friday: 9:00 AM - 6:00 PM</p>
              <p>Saturday: 9:00 AM - 3:00 PM</p>
              <p>Sunday: Closed</p>
            </div>
            <div>
              <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">Quick Contact</h4>
              <p>
                Phone:{" "}
                <a href={`tel:${siteConfig.contact.phone.raw}`} className="text-primary font-bold hover:underline">
                  {siteConfig.contact.phone.display}
                </a>
              </p>
              <p>
                Email:{" "}
                <a href={`mailto:${siteConfig.contact.email.general}`} className="text-zinc-300 hover:underline">
                  {siteConfig.contact.email.general}
                </a>
              </p>
            </div>
            {siteConfig.social.facebook && (
              <div className="pt-4 flex gap-4">
                <a
                  href={siteConfig.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded font-bold text-xs uppercase tracking-wider transition-colors inline-block"
                >
                  Message on Facebook
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Google Map */}
        <div className="lg:col-span-7 bg-zinc-900 rounded-lg overflow-hidden h-[350px] lg:h-full min-h-[320px] border border-zinc-800 relative">
          <iframe
            src={MAPS_EMBED_SRC}
            className="w-full h-full border-0 grayscale opacity-70 contrast-125 focus:outline-none"
            allowFullScreen
            loading="lazy"
          />
          <div className="absolute bottom-4 left-4 right-4 bg-zinc-950/95 border border-zinc-800 p-4 rounded shadow-2xl backdrop-blur-md pointer-events-none md:pointer-events-auto">
            <h4 className="font-black text-white text-xs uppercase tracking-wide">{siteConfig.brand.legalName}</h4>
            <p className="text-[11px] text-zinc-400 mt-0.5">{fullAddress}</p>
            <a
              href={MAPS_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary text-[10px] font-bold hover:underline mt-1.5 inline-block pointer-events-auto"
            >
              Open in Google Maps &rarr;
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
