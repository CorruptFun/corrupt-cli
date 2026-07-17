/**
 * Central branding & contact configuration.
 *
 * This is the ONE file you need to edit to rebrand this template for a new
 * dealership. Every component that displays a brand name, phone number,
 * address, or lot location imports its values from here — nothing else in
 * `src/` (or the genericized files under `public/`) should hardcode
 * dealership-specific text.
 *
 * Infrastructure (Supabase URL/keys) is configured separately via
 * environment variables — see `.env.example`.
 */

export interface DealershipLocation {
  /** Stable identifier stored on `vehicles.location`. Lowercase, no spaces. */
  id: string;
  /** Human-readable label shown in the UI (filters, badges, admin form). */
  label: string;
}

export const siteConfig = {
  brand: {
    /** Short display name used in running text, meta tags, and schema.org data. */
    name: "Acme Motors",
    /** Legal entity suffix, styled separately in some layouts (e.g. navbar). */
    legalSuffix: "LLC",
    /** Full legal name — footer copyright, privacy policy, outbound email "From" name. */
    legalName: "Acme Motors LLC",
    /** Shown as a badge on the hero section. */
    tagline: "Premium Showroom & Flexible Financing",
    /** Used for "Since {year}" style copy. Not computed into an age on purpose —
     *  a static year needs no yearly maintenance. */
    foundedYear: 2012,
  },
  contact: {
    phone: {
      /** Digits only — used for `tel:`/`sms:` links. */
      raw: "5555550100",
      /** Human-formatted for display. */
      display: "(555) 555-0100",
    },
    email: {
      /** General inquiries mailbox shown in the UI (Contact section, privacy policy). */
      general: "info@example.com",
    },
  },
  address: {
    street: "123 Main St",
    city: "Springfield",
    state: "ST",
    zip: "00000",
  },
  site: {
    /** Bare domain, no protocol — used for display copy. */
    domain: "example.com",
    /** Canonical site URL used in metadata, schema.org, and OG images. */
    url: "https://www.example.com",
  },
  social: {
    /**
     * Full Facebook page URL. Leave empty to hide the "Message on Facebook"
     * button in the Contact section.
     */
    facebook: "",
  },
  /**
   * Lot / showroom locations. `vehicles.location` stores one of these `id`s
   * as a plain string (see `src/lib/types.ts`). Defaults to a single lot —
   * add more entries here to run a multi-lot site; the location filter and
   * tabs in the Showroom only appear once more than one location exists.
   *
   * If your database enforces a CHECK constraint on `vehicles.location`,
   * keep it in sync with the `id`s listed here.
   */
  locations: [{ id: "main", label: "Main Lot" }] as DealershipLocation[],
} as const;

/** `"123 Main St, Springfield, ST 00000"` — reused anywhere the full mailing address is shown. */
export const fullAddress = `${siteConfig.address.street}, ${siteConfig.address.city}, ${siteConfig.address.state} ${siteConfig.address.zip}`;

/** `"Springfield, ST"` — short form used in badges and copy that doesn't need the full street address. */
export const cityState = `${siteConfig.address.city}, ${siteConfig.address.state}`;

/** Looks up a configured location's display label; falls back to the raw id if unknown. */
export function getLocationLabel(locationId: string): string {
  return siteConfig.locations.find(loc => loc.id === locationId)?.label ?? locationId;
}
