import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Vehicle photos live in the Supabase storage bucket (see sync_agent).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        // Hero background and vehicle-photo fallback images
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
