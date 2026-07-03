-- =====================================================================
-- CORRUPT DEALERSHIP ENGINE - SUPABASE POSTGRESQL SCHEMA
-- Modularity: Multi-tenant ready, strict type checking, RLS enabled.
-- =====================================================================

-- Enable UUID generation extension if not exists
create extension if not exists "uuid-ossp";

-- 1. DEALERSHIP CONFIGURATION TABLE
create table if not exists dealer_config (
    id uuid primary key default uuid_generate_v4(),
    key varchar(128) unique not null,
    value jsonb not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table dealer_config is 'Stores theme configurations, contact numbers, and localized assets.';

-- 2. WHITELISTED ADMINS TABLE (Zero-Trust Whitelist)
create table if not exists whitelisted_admins (
    id uuid primary key default uuid_generate_v4(),
    email varchar(255) unique not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table whitelisted_admins is 'List of authorized emails verified during magic-link authentications.';

-- 3. VEHICLE INVENTORY TABLE
create table if not exists vehicles (
    id uuid primary key default uuid_generate_v4(),
    vin varchar(17) unique,
    year integer not null,
    make varchar(64) not null,
    model varchar(64) not null,
    trim varchar(64),
    price numeric(10, 2) not null,
    mileage integer not null,
    payment_est varchar(64),
    badge varchar(64),
    specs_highlight varchar(128), -- e.g., 'V8 Power', '35+ MPG'
    main_image text not null,
    gallery_images text[] default '{}'::text[],
    features text[] default '{}'::text[],
    status varchar(32) default 'available' not null, -- 'available', 'pending', 'sold'
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint status_check check (status in ('available', 'pending', 'sold')),
    constraint year_check check (year >= 1900 and year <= extract(year from now()) + 1)
);

comment on table vehicles is 'Dealer vehicle assets. Syncable via outbound DMS FTP feeds.';

-- 4. LEAD CAPTURE AND SALES FUNNEL TABLE
create table if not exists leads (
    id uuid primary key default uuid_generate_v4(),
    name varchar(255) not null,
    phone varchar(64) not null,
    email varchar(255),
    income_range varchar(128), -- e.g., '$2500 - $4000'
    preferred_vehicle_type varchar(128),
    vehicle_id uuid references vehicles(id) on delete set null,
    notes text,
    status varchar(32) default 'new' not null, -- 'new', 'contacted', 'qualified', 'closed_won', 'closed_lost'
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint lead_status_check check (status in ('new', 'contacted', 'qualified', 'closed_won', 'closed_lost'))
);

comment on table leads is 'Inbound digital pre-approvals and inquiries.';

-- =====================================================================
-- TIMESTAMPS AUTOMATION TRIGGERS
-- =====================================================================

create or replace function update_modified_column()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

create trigger update_vehicles_modtime
    before update on vehicles
    for each row
    execute procedure update_modified_column();

create trigger update_dealer_config_modtime
    before update on dealer_config
    for each row
    execute procedure update_modified_column();

-- =====================================================================
-- SECURITY: ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

-- Enable RLS on all tables
alter table dealer_config enable row level security;
alter table whitelisted_admins enable row level security;
alter table vehicles enable row level security;
alter table leads enable row level security;

-- 1. vehicles policies: anyone can view, only authenticated admins can mutate
create policy "Allow public viewing of active inventory"
    on vehicles for select
    using (true);

create policy "Allow whitelisted admins full vehicle control"
    on vehicles for all
    using (auth.email() in (select email from whitelisted_admins))
    with check (auth.email() in (select email from whitelisted_admins));

-- 2. leads policies: public can insert (lead submission), only whitelisted admins can read/update
create policy "Allow public lead creation"
    on leads for insert
    with check (true);

create policy "Allow whitelisted admins full access to leads"
    on leads for all
    using (auth.email() in (select email from whitelisted_admins))
    with check (auth.email() in (select email from whitelisted_admins));

-- 3. dealer_config policies: public can select, only whitelisted admins can mutate
create policy "Allow public config fetch"
    on dealer_config for select
    using (true);

create policy "Allow whitelisted admins config mutation"
    on dealer_config for all
    using (auth.email() in (select email from whitelisted_admins))
    with check (auth.email() in (select email from whitelisted_admins));
