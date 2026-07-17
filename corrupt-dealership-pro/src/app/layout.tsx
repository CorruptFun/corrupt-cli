import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { siteConfig, cityState } from "@/config/site";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

const TITLE = `${siteConfig.brand.legalName} | Reliable Used Cars & Trucks | ${cityState}`;
const DESCRIPTION = `Find reliable used cars, trucks, and SUVs at ${siteConfig.brand.name} in ${cityState}. Simple Buy Here Pay Here (BHPH) and bank financing options available. Apply online today!`;

export const metadata: Metadata = {
  title: TITLE,
  icons: {
    icon: { url: "/favicon.svg", type: "image/svg+xml" },
  },
  manifest: "/manifest.json",
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: siteConfig.site.url,
    siteName: siteConfig.brand.legalName,
    images: [
      {
        url: `${siteConfig.site.url}/dealership.jpg`,
        width: 1200,
        height: 630,
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} bg-[#080808] text-[#f3f4f6]`}>
      <body className="font-sans antialiased overflow-x-hidden w-full m-0 p-0">
        {children}
      </body>
    </html>
  );
}

export const viewport: Viewport = {
  themeColor: "#080808",
};
