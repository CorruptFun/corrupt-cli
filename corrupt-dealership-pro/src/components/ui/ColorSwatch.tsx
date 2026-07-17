import { colorToHex } from "@/lib/colors";

// Small color dot for a named paint/upholstery color. Unrecognized names get a
// neutral metallic fill so the row still reads as a color. Pure presentational.
export default function ColorSwatch({ name, size = 12 }: { name: string; size?: number }) {
  const hex = colorToHex(name);
  return (
    <span
      className="inline-block rounded-full border border-white/25 flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: hex ?? "conic-gradient(from 45deg, #9ca3af, #4b5563, #d1d5db, #6b7280, #9ca3af)",
      }}
      aria-hidden="true"
    />
  );
}
