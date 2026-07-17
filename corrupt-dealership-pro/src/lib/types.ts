// Database row types derived from the Supabase schema (see supabase/migrations).
// Keep in sync with the Supabase schema — check constraints enforce the unions below.

export type VehicleStatus = "active" | "waiting_approval" | "sold" | "preapproved";
/**
 * Free-form lot identifier matching one of the `id`s configured in
 * `src/config/site.ts` (`siteConfig.locations`). Kept as a plain string
 * rather than a closed union because the set of lots is operator-configured,
 * not fixed at compile time. If your database enforces a CHECK constraint on
 * `vehicles.location`, keep it in sync with your configured location ids.
 */
export type VehicleLocation = string;
// Must match the vehicles_type_check constraint exactly. These drifted apart once
// already: the DB constraint was widened after staff hit "violates check
// constraint" 22 times trying to list body styles the schema rejected, but this
// union was never updated — so the admin dropdown silently kept offering only the
// original five and a van or motorcycle could not be listed at all.
export type VehicleType =
  | "truck"
  | "suv"
  | "sedan"
  | "coupe"
  | "hatchback"
  | "van"
  | "minivan"
  | "wagon"
  | "convertible"
  | "golfcart"
  | "utv"
  | "motorcycle"
  | "other";

export interface Vehicle {
  id: string;
  vin: string;
  stock_number: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  price: number;
  mileage: number;
  payment_est: string | null;
  location: VehicleLocation;
  type: VehicleType;
  badge: string | null;
  description: string | null;
  images: string[];
  is_manual: boolean;
  status: VehicleStatus;
  engine: string | null;
  exterior_color: string | null;
  interior_color: string | null;
  created_at: string;
  updated_at: string;
}

/** Editable vehicle fields for admin insert/update (id and timestamps are DB-managed). */
export type VehicleInput = Omit<Vehicle, "id" | "created_at" | "updated_at">;

// "vehicle_inquiry" is used by the details-modal quick inquiry (V1 behavior)
export type FinancingType = "bank" | "bhph" | "vehicle_inquiry";
export type CreditApplicationStatus = "pending" | "reviewed" | "approved" | "declined";

/** Snapshot of the vehicle a customer is applying for (jsonb column). */
export interface VehicleOfInterest {
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number | null;
  mileage: number | null;
  image_url: string | null;
}

export interface CreditApplicationInsert {
  financing_type: FinancingType;
  full_name: string;
  phone: string;
  email: string | null;
  monthly_income: number | null;
  employer: string | null;
  target_terms: string | null;
  vehicle_preferences: string | null;
  status: CreditApplicationStatus;
  vehicle_of_interest: VehicleOfInterest | null;
}

export interface CreditApplication extends CreditApplicationInsert {
  id: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  employment_status: string | null;
  monthly_income: number | null;
  employer: string | null;
  target_terms: string | null;
  vehicle_preferences: string | null;
  status: CreditApplicationStatus;
  created_at: string;
  updated_at: string;
}
