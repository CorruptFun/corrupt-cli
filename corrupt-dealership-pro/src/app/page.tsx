import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileContactBar from "@/components/layout/MobileContactBar";
import Hero from "@/components/home/Hero";
import ValueBanner from "@/components/home/ValueBanner";
import HomeClient from "@/components/home/HomeClient";
import AboutSection from "@/components/home/AboutSection";
import ContactSection from "@/components/home/ContactSection";
import { LanguageProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/server";
import { resolveMainVehicleImage } from "@/lib/images";
import { siteConfig } from "@/config/site";
import type { Vehicle } from "@/lib/types";
import { unstable_rethrow } from "next/navigation";

async function getShowroomVehicles(): Promise<Vehicle[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .neq("status", "sold")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch vehicles:", error.message);
      return [];
    }
    return data;
  } catch (err) {
    // Let Next.js control-flow errors (e.g. dynamic rendering signals from
    // `cookies()`) propagate; only swallow genuine failures such as
    // misconfigured env vars or an unreachable Supabase instance, so the
    // showroom renders its empty state instead of crashing the page.
    unstable_rethrow(err);
    console.error("Unexpected error fetching vehicles:", err);
    return [];
  }
}

/** Schema.org ItemList for SEO, ported from V1's injectSchemaOrg. */
function buildSchemaOrg(vehicles: Vehicle[]) {
  const available = vehicles.filter(v => v.status !== "sold");
  if (available.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${siteConfig.brand.name} Vehicle Inventory`,
    url: `${siteConfig.site.url}/#inventory`,
    numberOfItems: available.length,
    itemListElement: available.slice(0, 50).map((v, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "Car",
        name: `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`,
        image: resolveMainVehicleImage(v.images),
        url: `${siteConfig.site.url}/?vin=${v.vin ?? ""}`,
        brand: { "@type": "Brand", name: v.make },
        model: v.model,
        vehicleModelDate: String(v.year),
        mileageFromOdometer: { "@type": "QuantitativeValue", value: v.mileage ?? 0, unitCode: "SMI" },
        offers: {
          "@type": "Offer",
          price: v.price ?? 0,
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          seller: {
            "@type": "AutoDealer",
            name: siteConfig.brand.legalName,
            telephone: `+1${siteConfig.contact.phone.raw}`,
            address: {
              "@type": "PostalAddress",
              streetAddress: siteConfig.address.street,
              addressLocality: siteConfig.address.city,
              addressRegion: siteConfig.address.state,
              postalCode: siteConfig.address.zip,
              addressCountry: "US",
            },
          },
        },
      },
    })),
  };
}

export default async function Home() {
  const vehicles = await getShowroomVehicles();
  const schema = buildSchemaOrg(vehicles);

  return (
    <LanguageProvider>
      <ToastProvider>
        {schema && (
          <script
            type="application/ld+json"
            // JSON.stringify does not escape "<", so a vehicle field containing
            // "</script>" would close this block early and execute as markup.
            // Escaping it to < is valid JSON and removes the breakout. Only
            // admins can write vehicles now, but until 2026-07-16 anon could —
            // this was the sink those writes fed into.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}
          />
        )}
        <Navbar />
        <Hero />
        <ValueBanner />
        <HomeClient vehicles={vehicles} />
        <AboutSection />
        <ContactSection />
        <Footer />
        <MobileContactBar />
      </ToastProvider>
    </LanguageProvider>
  );
}
