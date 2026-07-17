-- 0001_initial_schema.sql
-- ============================================================================
-- Complete baseline schema for the dealership platform.
--
-- Apply to a FRESH Supabase project: `supabase db push`, or paste into the SQL
-- editor. It builds everything — tables, row-level security, the admin
-- allow-list model, the vehicle-photos storage bucket, and the lead-notification
-- trigger — in the final, secure state. It is idempotent-friendly where it
-- safely can be, but is intended to run once on an empty database.
--
-- SECURITY MODEL (see README): RLS is the ENTIRE access-control layer. The app
-- talks to Supabase from the browser with only the anon key; there is no server
-- API. Every sensitive policy checks the caller's verified email
-- (auth.jwt()->>'email') against the `authorized_admins` table. Two admin levels:
-- ordinary admins (manage inventory + applications) and super admins (also manage
-- the admin list), distinguished by `authorized_admins.is_super_admin`.
--
-- >>> AFTER APPLYING, do the two steps at the very bottom of this file
--     (add your first admin, set the Vault secrets) or the admin portal and
--     lead notifications will not work.
-- ============================================================================

-- ---- Extensions ------------------------------------------------------------
-- pg_net lets the AFTER INSERT trigger POST to the notification edge function.
create extension if not exists pg_net with schema extensions;
-- IDs use gen_random_uuid() (built in on Postgres 13+ / Supabase) — no uuid-ossp.

-- ---- Functions -------------------------------------------------------------

-- Is an email in the admin allow-list? Called by the login flow BEFORE sending an
-- OTP, so it must be callable by anon. It is a UX gate only — the real boundary is
-- the RLS policies below. SECURITY DEFINER so it can read authorized_admins.
create or replace function public.is_email_authorized(test_email text)
returns boolean
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  return exists (
    select 1 from public.authorized_admins where lower(email) = lower(test_email)
  );
end;
$$;

-- Is the CURRENT caller a super admin?
-- SECURITY DEFINER is REQUIRED, not incidental: a policy ON authorized_admins that
-- queried authorized_admins directly would re-enter itself and Postgres would raise
-- "infinite recursion detected in policy". Running as the function owner (for whom
-- RLS on that table does not apply) breaks the cycle. Keep the pinned search_path.
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.authorized_admins
    where lower(email) = lower(auth.jwt() ->> 'email')
      and is_super_admin
  );
$$;

-- Standard updated_at bump.
create or replace function public.update_modified_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Fires after a credit application is inserted and POSTs it to the notification
-- edge function. URL, anon key, and shared secret are read from Vault so NOTHING is
-- hardcoded — set them after deploying (see the bottom of this file). Never aborts
-- the customer's insert over a notification problem: it warns and moves on.
create or replace function public.notify_credit_app_webhook()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_url    text;
  v_anon   text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_anon   from vault.decrypted_secrets where name = 'project_anon_key' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'send_credit_app_notification_secret' limit 1;

  if v_url is null or v_anon is null or v_secret is null then
    raise warning 'credit app notification skipped: vault secret(s) missing';
    return new;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/send-credit-app-notification',
    body := jsonb_build_object(
      'type', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA, 'record', row_to_json(new)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'X-Webhook-Secret', v_secret
    )
  );
  return new;
end;
$$;

-- ---- Tables ----------------------------------------------------------------

create table public.authorized_admins (
  id             uuid default gen_random_uuid() not null primary key,
  email          text not null unique,
  is_super_admin boolean default false not null,
  created_at     timestamptz default timezone('utc'::text, now()) not null
);

create table public.vehicles (
  id             uuid default gen_random_uuid() not null primary key,
  vin            text not null unique,
  stock_number   text,
  year           integer not null,
  make           text not null,
  model          text not null,
  "trim"         text,
  price          numeric not null,
  mileage        integer not null,
  payment_est    text,
  -- Free-form on purpose. Valid values are defined by `siteConfig.locations` in the
  -- app, not a DB enum — a template cannot know a given dealer's lots. Defaults to
  -- the single default lot id ("main"). Add a CHECK here only if you want the DB to
  -- enforce your specific lot list.
  location       text not null default 'main',
  type           text not null,
  badge          text,
  images         text[] default '{}'::text[],
  is_manual      boolean default false not null,
  status         text default 'active'::text not null,
  description    text,
  engine         text,
  exterior_color text,
  interior_color text,
  created_at     timestamptz default timezone('utc'::text, now()) not null,
  updated_at     timestamptz default timezone('utc'::text, now()) not null,
  constraint vehicles_status_check check (status = any (array['active'::text, 'waiting_approval'::text, 'sold'::text, 'preapproved'::text])),
  constraint vehicles_type_check   check (type   = any (array['truck'::text, 'suv'::text, 'sedan'::text, 'coupe'::text, 'hatchback'::text, 'van'::text, 'minivan'::text, 'wagon'::text, 'convertible'::text, 'golfcart'::text, 'utv'::text, 'motorcycle'::text, 'other'::text]))
);

create table public.credit_applications (
  id                  uuid default gen_random_uuid() not null primary key,
  financing_type      text not null,
  full_name           text not null,
  phone               text not null,
  email               text,
  street_address      text,
  city                text,
  state               text,
  zip_code            text,
  employment_status   text,
  monthly_income      numeric,
  ssn_encrypted       text,
  employer            text,
  target_terms        text,
  vehicle_preferences text,
  vehicle_of_interest jsonb,
  status              text default 'pending'::text not null,
  created_at          timestamptz default timezone('utc'::text, now()) not null,
  updated_at          timestamptz default timezone('utc'::text, now()) not null,
  constraint chk_full_name_length   check ((char_length(full_name) >= 2) and (char_length(full_name) <= 100)),
  constraint chk_phone_length       check ((char_length(phone) >= 7) and (char_length(phone) <= 30)),
  constraint chk_email_length       check ((email is null) or ((char_length(email) >= 3) and (char_length(email) <= 255))),
  constraint chk_address_length     check ((street_address is null) or (char_length(street_address) <= 200)),
  constraint chk_city_length        check ((city is null) or (char_length(city) <= 100)),
  constraint chk_state_length       check ((state is null) or (char_length(state) <= 50)),
  constraint chk_zip_length         check ((zip_code is null) or (char_length(zip_code) <= 20)),
  constraint chk_employment_status_length check ((employment_status is null) or (char_length(employment_status) <= 50)),
  constraint chk_employer_length    check ((employer is null) or (char_length(employer) <= 100)),
  constraint chk_monthly_income_range     check ((monthly_income is null) or ((monthly_income >= 0.0) and (monthly_income <= 1000000.0))),
  constraint chk_target_terms_length      check ((target_terms is null) or (char_length(target_terms) <= 150)),
  constraint chk_vehicle_preferences_length check ((vehicle_preferences is null) or (char_length(vehicle_preferences) <= 200)),
  constraint chk_financing_type     check ((financing_type = any (array['bank'::text, 'bhph'::text, 'vehicle_inquiry'::text])) and (char_length(financing_type) <= 20)),
  constraint chk_status_length      check ((status is null) or (char_length(status) <= 20)),
  constraint credit_applications_status_check check (status = any (array['pending'::text, 'reviewed'::text, 'approved'::text, 'declined'::text]))
);

create table public.error_logs (
  id            uuid default gen_random_uuid() not null primary key,
  page          text not null,
  error_message text not null,
  error_stack   text,
  user_agent    text,
  device_info   text,
  url           text,
  extra         jsonb,
  created_at    timestamptz default now()
);

-- ---- Indexes ---------------------------------------------------------------
create index credit_apps_status_idx      on public.credit_applications (status);
create index vehicles_location_type_idx  on public.vehicles (location, type, status);
create index vehicles_vin_idx            on public.vehicles (vin);

-- ---- Triggers --------------------------------------------------------------
create trigger tr_notify_credit_app_webhook after insert on public.credit_applications
  for each row execute function public.notify_credit_app_webhook();
create trigger update_credit_apps_modtime  before update on public.credit_applications
  for each row execute function public.update_modified_column();
create trigger update_vehicles_modtime     before update on public.vehicles
  for each row execute function public.update_modified_column();

-- ---- Row-Level Security ----------------------------------------------------
-- Enabling RLS with no policy = deny all. Each table then opts specific access in.
alter table public.authorized_admins   enable row level security;
alter table public.vehicles            enable row level security;
alter table public.credit_applications enable row level security;
alter table public.error_logs          enable row level security;

-- vehicles: the public browses; only whitelisted admins write.
create policy "Allow public read access to vehicles" on public.vehicles
  for select using (true);
create policy "Allow whitelisted admins to insert vehicles" on public.vehicles
  for insert to authenticated
  with check (lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins));
create policy "Allow whitelisted admins to update vehicles" on public.vehicles
  for update to authenticated
  using (lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins))
  with check (lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins));
create policy "Allow whitelisted admins to delete vehicles" on public.vehicles
  for delete to authenticated
  using (lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins));

-- credit_applications: the public submits (INSERT only); only admins read/modify.
create policy "Allow public insert only" on public.credit_applications
  for insert to authenticated, anon with check (true);
create policy "Allow admin read access" on public.credit_applications
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins));
create policy "Allow admin update access" on public.credit_applications
  for update to authenticated
  using (lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins))
  with check (lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins));
create policy "Allow admin delete access" on public.credit_applications
  for delete to authenticated
  using (lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins));

-- error_logs: anyone can report; only admins read/clear.
create policy "Allow public to insert error logs" on public.error_logs
  for insert with check (true);
create policy "allow_admin_read_errors" on public.error_logs
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins));
create policy "allow_admin_delete_errors" on public.error_logs
  for delete to authenticated
  using (lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins));

-- authorized_admins: an admin sees their own row; only super admins see all / write.
-- (No UPDATE policy: promoting a super admin is a deliberate SQL operation.)
create policy "Allow select for self or super admin" on public.authorized_admins
  for select to authenticated
  using ((lower(email) = lower(auth.jwt() ->> 'email')) or public.is_super_admin());
create policy "Allow write access for super admins" on public.authorized_admins
  for insert to authenticated with check (public.is_super_admin());
create policy "Allow delete access for super admins" on public.authorized_admins
  for delete to authenticated using (public.is_super_admin());

-- ---- Storage: vehicle-photos bucket ----------------------------------------
-- Public bucket (photos are shown on the storefront), 25 MiB cap, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-photos', 'vehicle-photos', true, 26214400, array['image/*'])
on conflict (id) do nothing;

-- Anyone may VIEW photos; only whitelisted admins may write.
create policy "Allow public read access to vehicle-photos" on storage.objects
  for select using (bucket_id = 'vehicle-photos');

-- Uploads must be filed under a vehicle's UUID: "<uuid>/<filename>". The path IS
-- the record of ownership; the regex rejects flat uploads so the bucket can't drift.
-- Shape is enforced, not existence (photos upload before the row exists — the app
-- mints the id client-side), which is why there's no FK check here.
create policy "Whitelisted admins can upload vehicle photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+$'
    and lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins)
  );
create policy "Whitelisted admins can update vehicle photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'vehicle-photos' and lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins))
  with check (bucket_id = 'vehicle-photos' and lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins));
create policy "Whitelisted admins can delete vehicle photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vehicle-photos' and lower(auth.jwt() ->> 'email') in (select lower(email) from public.authorized_admins));

-- ============================================================================
-- AFTER APPLYING — required, or the admin portal + notifications won't work:
--
-- 1. Add your first super admin (edit the email):
--      insert into public.authorized_admins (email, is_super_admin)
--      values ('you@example.com', true);
--
-- 2. Set the Vault secrets the notification trigger reads
--    (Dashboard → Project Settings → Vault, or vault.create_secret(...)):
--      project_url                          = https://<your-ref>.supabase.co
--      project_anon_key                     = <your anon public key>
--      send_credit_app_notification_secret  = <a random shared secret; the edge
--                                              function must be given the same value>
--
-- Verify the whole thing with: supabase/tests/rls_regression.sh
-- ============================================================================
