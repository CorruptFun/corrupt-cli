import Image from "next/image";
import { siteConfig, cityState } from "@/config/site";

export default function AboutSection() {
  return (
    <section id="about" className="max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
      <div className="lg:col-span-5 relative">
        <div className="absolute -top-4 -left-4 w-24 h-24 border-t-4 border-l-4 border-zinc-800" />
        <div className="absolute -bottom-4 -right-4 w-24 h-24 border-b-4 border-r-4 border-zinc-800" />
        <Image
          src="/dealership.jpg"
          alt={`${siteConfig.brand.name} Dealership`}
          width={800}
          height={600}
          className="w-full rounded-lg grayscale contrast-125"
        />
      </div>
      <div className="lg:col-span-7">
        <span className="text-zinc-400 font-extrabold text-xs uppercase tracking-widest">Est. {siteConfig.brand.foundedYear}</span>
        <h2 className="text-3xl md:text-4xl font-black text-white mt-1 mb-6 uppercase">About {siteConfig.brand.legalName}</h2>
        <div className="space-y-4 text-zinc-400 text-sm leading-relaxed">
          <p>
            Since {siteConfig.brand.foundedYear}, {siteConfig.brand.legalName} has delivered reliable, work-ready trucks, SUVs, and cars built for the
            community. As a family-owned lot, we are fully committed to helping our neighbors secure dependable
            transportation with flexible, stress-free payments.
          </p>
          <p>
            No high pressure, no complicated runarounds. We offer straightforward bank financing through our trusted
            regional partners, combined with direct in-house terms where your job is your credit. Proudly serving our
            community from our {cityState} headquarters.
          </p>
        </div>
      </div>
    </section>
  );
}
