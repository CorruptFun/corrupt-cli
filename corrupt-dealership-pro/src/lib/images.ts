export const VEHICLE_PHOTOS_BUCKET = "vehicle-photos";

/**
 * Resolves a vehicle image reference to a full public URL.
 *
 * The `vehicles.images` column holds two shapes of data: full public URLs
 * (written by the sync agent) and bare storage filenames (written by the
 * admin upload flow). Bare filenames resolve against the public
 * vehicle-photos bucket, matching the legacy site's behavior.
 */
export function resolveVehicleImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;

  return `${baseUrl}/storage/v1/object/public/${VEHICLE_PHOTOS_BUCKET}/${path}`;
}

/** Generic stock photo shown when a vehicle has no photos (V1 behavior). */
export const FALLBACK_VEHICLE_IMAGE =
  "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&q=80&w=800";

/** Resolves a vehicle's primary photo, falling back to the stock image. */
export function resolveMainVehicleImage(images: string[] | null | undefined): string {
  return resolveVehicleImageUrl(images?.[0]) ?? FALLBACK_VEHICLE_IMAGE;
}
