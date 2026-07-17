#!/usr/bin/env bash
#
# RLS regression tests.
#
#   ./supabase/tests/rls_regression.sh
#
# Reads SUPABASE_DB_URL from the environment or .env.local.
#
# WHY THIS EXISTS
# ---------------
# On 2026-07-16 anyone holding the public anon key could write to live inventory,
# and any self-registered user could read every credit application. The cause was
# loose USING(true) policies left beside correctly-scoped ones -- Postgres ORs
# permissive policies, so the loose ones won. Nothing detected it because nothing
# ever asserted what the policies were SUPPOSED to allow.
#
# This asserts exactly that. Run it after ANY change under supabase/.
#
# Every test runs inside a transaction that is rolled back. Safe against
# production -- it writes nothing. Identities are simulated with
# request.jwt.claims, which is what auth.jwt() reads.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1

DBURL="${SUPABASE_DB_URL:-}"
if [ -z "$DBURL" ] && [ -f .env.local ]; then
    DBURL=$(grep -E '^SUPABASE_DB_URL=' .env.local | cut -d= -f2- | sed 's/^["'"'"']//; s/["'"'"']$//')
fi
[ -z "$DBURL" ] && { echo "SUPABASE_DB_URL not set and not found in .env.local"; exit 1; }

# These defaults are placeholders. Override with RLS_TEST_ADMIN_EMAIL /
# RLS_TEST_SUPER_EMAIL, or seed authorized_admins with matching rows —
# either way, both addresses must actually exist in authorized_admins for
# the "admin" / "super admin" sections below to pass.
ADMIN_EMAIL="${RLS_TEST_ADMIN_EMAIL:-admin@example.com}"        # in authorized_admins, NOT super
SUPER_EMAIL="${RLS_TEST_SUPER_EMAIL:-superadmin@example.com}"   # in authorized_admins, IS super
STRANGER_EMAIL="not-an-admin@example.invalid"                    # not in authorized_admins

pass=0; fail=0

# try <role> <email|-> <sql>  ->  prints ALLOWED or DENIED
try() {
    local role="$1" email="$2" sql="$3" claims out
    if [ "$email" = "-" ]; then claims='{"role":"anon"}'
    else claims="{\"email\":\"$email\",\"role\":\"authenticated\"}"; fi
    out=$(psql "$DBURL" -tAq -v ON_ERROR_STOP=1 2>&1 <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', '$claims', true);
SET LOCAL ROLE $role;
$sql
ROLLBACK;
SQL
)
    if grep -qE '42501|violates row-level security|permission denied' <<<"$out"; then
        echo "DENIED"
    else
        echo "ALLOWED"
    fi
}

# count_as <role> <email|-> <sql>  ->  prints the numeric result
# SELECT-side RLS filters rows rather than raising, so these assert on row counts.
count_as() {
    local role="$1" email="$2" sql="$3" claims
    if [ "$email" = "-" ]; then claims='{"role":"anon"}'
    else claims="{\"email\":\"$email\",\"role\":\"authenticated\"}"; fi
    psql "$DBURL" -tAq 2>/dev/null <<SQL | grep -E '^[0-9]+$' | tail -1
BEGIN;
SELECT set_config('request.jwt.claims', '$claims', true);
SET LOCAL ROLE $role;
$sql
ROLLBACK;
SQL
}

check() { # check <description> <expected> <actual>
    if [ "$2" = "$3" ]; then
        printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1))
    else
        printf '  \033[31mFAIL\033[0m  %s  (expected %s, got %s)\n' "$1" "$2" "$3"; fail=$((fail+1))
    fi
}

NEW_VEHICLE="INSERT INTO public.vehicles (vin,year,make,model,price,mileage,location,type)
             VALUES ('RLSTEST-'||substr(md5(random()::text),1,10),1999,'RLSTEST','RLSTEST',1,1,'main','sedan');"

echo
echo "RLS regression tests"
echo "  admin under test:    $ADMIN_EMAIL"
echo "  stranger under test: $STRANGER_EMAIL"
echo

echo "-- structural invariants --"

# Exactly three policies may be wide open, and every one is deliberate.
open=$(psql "$DBURL" -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true');")
check "only 3 wide-open policies exist" "3" "$open"

# The 2026-07-16 bug in one assertion: service_role bypasses RLS, so a policy
# granted TO public for ALL commands is never 'for the service role' -- it is a
# hole open to anonymous callers.
allpub=$(psql "$DBURL" -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND cmd='ALL' AND 'public'=ANY(roles);")
check "no TO-public ALL-command policies" "0" "$allpub"

rlsoff=$(psql "$DBURL" -tAc "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND NOT relrowsecurity;")
check "RLS enabled on every public table" "0" "$rlsoff"

echo
echo "-- anonymous visitor (public anon key only) --"
check "anon CAN browse inventory"            "ALLOWED" "$(try anon - 'SELECT count(*) FROM public.vehicles;')"
check "anon CANNOT write inventory"          "DENIED"  "$(try anon - "$NEW_VEHICLE")"
check "anon CAN submit a credit application" "ALLOWED" "$(try anon - "INSERT INTO public.credit_applications (full_name,phone,financing_type) VALUES ('RLSTEST','5555550000','vehicle_inquiry');")"

# anon reads zero credit applications. Insert a row FIRST (public INSERT is
# allowed) inside the same rolled-back txn, so 0 means "anon cannot see even a row
# that exists," not "the table happened to be empty" — otherwise this assertion
# would pass against a wide-open table and miss a re-introduced anon-read hole.
# Empty output = permission denied (anon has no SELECT grant) = the strongest pass.
anon_ca=$(count_as anon - "INSERT INTO public.credit_applications (full_name,phone,financing_type) VALUES ('RLSTEST','5555550000','vehicle_inquiry'); SELECT count(*) FROM public.credit_applications;")
check "anon CANNOT read credit applications" "0" "${anon_ca:-0}"

echo
echo "-- authenticated stranger (self-registered, not whitelisted) --"
check "stranger CANNOT write inventory" "DENIED" "$(try authenticated "$STRANGER_EMAIL" "$NEW_VEHICLE")"
# Same non-vacuous pattern: seed a row in the rolled-back txn (a stranger may
# INSERT — public policy), then confirm RLS hides it from a non-admin read. 0 must
# mean "RLS filtered a real row," not "empty table".
stranger_ca=$(count_as authenticated "$STRANGER_EMAIL" "INSERT INTO public.credit_applications (full_name,phone,financing_type) VALUES ('RLSTEST','5555550000','vehicle_inquiry'); SELECT count(*) FROM public.credit_applications;")
check "stranger CANNOT read credit applications" "0" "${stranger_ca:-0}"

echo
echo "-- whitelisted admin (the portal must keep working) --"
check "admin CAN add a vehicle"    "ALLOWED" "$(try authenticated "$ADMIN_EMAIL" "$NEW_VEHICLE")"
check "admin CAN update inventory" "ALLOWED" "$(try authenticated "$ADMIN_EMAIL" "UPDATE public.vehicles SET status='sold' WHERE id=(SELECT id FROM public.vehicles LIMIT 1);")"
check "admin CAN delete inventory" "ALLOWED" "$(try authenticated "$ADMIN_EMAIL" "DELETE FROM public.vehicles WHERE id=(SELECT id FROM public.vehicles LIMIT 1);")"
# Insert-then-read inside the admin's own (rolled-back) transaction so this
# holds on a freshly-applied schema too, not just a DB that already has leads.
acount=$(count_as authenticated "$ADMIN_EMAIL" "INSERT INTO public.credit_applications (full_name,phone,financing_type) VALUES ('RLSTEST','5555550000','vehicle_inquiry'); SELECT count(*) FROM public.credit_applications;")
check "admin CAN read credit applications" "yes" "$([ "${acount:-0}" -ge 1 ] && echo yes || echo no)"

echo
echo "-- super admin (whitelist management) --"
NEW_ADMIN="INSERT INTO public.authorized_admins (email) VALUES ('rlstest-'||substr(md5(random()::text),1,8)||'@example.invalid');"
check "super admin CAN add an admin"        "ALLOWED" "$(try authenticated "$SUPER_EMAIL" "$NEW_ADMIN")"
check "ordinary admin CANNOT add an admin"  "DENIED"  "$(try authenticated "$ADMIN_EMAIL" "$NEW_ADMIN")"
check "stranger CANNOT add an admin"        "DENIED"  "$(try authenticated "$STRANGER_EMAIL" "$NEW_ADMIN")"
# Every admin must still see their own row: other tables' policies resolve admin
# status via `IN (SELECT email FROM authorized_admins)`, which is itself filtered
# by this table's SELECT policy. If self-read breaks, admin access breaks with it.
check "ordinary admin CAN see own row" "1" "$(count_as authenticated "$ADMIN_EMAIL" "SELECT count(*) FROM public.authorized_admins WHERE lower(email)=lower('$ADMIN_EMAIL');")"
check "ordinary admin CANNOT see whole list" "1" "$(count_as authenticated "$ADMIN_EMAIL" 'SELECT count(*) FROM public.authorized_admins;')"
# The super admin must see EVERY row. Compare against the true total read as the
# connecting owner role (which bypasses RLS), so this is correct for any admin
# count — a fresh project with 2 seeded admins or a live one with dozens.
total_admins=$(psql "$DBURL" -tAc "SELECT count(*) FROM public.authorized_admins;")
sa=$(count_as authenticated "$SUPER_EMAIL" 'SELECT count(*) FROM public.authorized_admins;')
check "super admin sees the full admin list" "$total_admins" "$sa"

echo
echo "-- storage: vehicle-photos bucket --"
# Storage RLS lives on storage.objects, in a different schema from the tables
# above. The 2026-07-16 audit initially missed it for exactly that reason.
# Photos must live at "<vehicle-uuid>/<file>" so the bucket records who owns what.
# A flat upload is what let ~100 photos go unaccounted for; the policy now rejects it.
FOLDERED="INSERT INTO storage.objects (bucket_id, name) VALUES ('vehicle-photos', gen_random_uuid()||'/rlstest.jpg');"
FLAT="INSERT INTO storage.objects (bucket_id, name) VALUES ('vehicle-photos','rlstest-'||substr(md5(random()::text),1,8)||'.jpg');"
NESTED="INSERT INTO storage.objects (bucket_id, name) VALUES ('vehicle-photos', gen_random_uuid()||'/nested/deep.jpg');"
check "anon CAN view photos (storefront)"   "ALLOWED" "$(try anon - "SELECT count(*) FROM storage.objects WHERE bucket_id='vehicle-photos';")"
check "anon CANNOT upload photos"           "DENIED"  "$(try anon - "$FOLDERED")"
check "stranger CANNOT upload photos"       "DENIED"  "$(try authenticated "$STRANGER_EMAIL" "$FOLDERED")"
check "admin CAN upload under a vehicle id" "ALLOWED" "$(try authenticated "$ADMIN_EMAIL" "$FOLDERED")"
check "admin CANNOT upload to bucket root"  "DENIED"  "$(try authenticated "$ADMIN_EMAIL" "$FLAT")"
check "admin CANNOT nest below the vehicle" "DENIED"  "$(try authenticated "$ADMIN_EMAIL" "$NESTED")"
check "admin CAN delete photos"           "ALLOWED" "$(try authenticated "$ADMIN_EMAIL" "DELETE FROM storage.objects WHERE bucket_id='vehicle-photos' AND name=(SELECT name FROM storage.objects WHERE bucket_id='vehicle-photos' LIMIT 1);")"
bucket=$(psql "$DBURL" -tAc "SELECT COALESCE(file_size_limit::text,'null') FROM storage.buckets WHERE id='vehicle-photos';")
check "bucket enforces a size limit server-side" "26214400" "$bucket"

echo
echo "  $pass passed, $fail failed"
echo
[ "$fail" -eq 0 ] || exit 1
