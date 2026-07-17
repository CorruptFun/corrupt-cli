#!/usr/bin/env bash
#
# Reports photos in the vehicle-photos bucket that no vehicle row references.
#
#   ./supabase/tools/audit_orphaned_photos.sh
#
# This REPORTS ONLY. To actually delete them, use "Clean Up Photos" in the admin
# portal's Inventory tab. That is not a limitation of this script -- it is the only
# correct way:
#   - storage.objects has a protect_objects_delete trigger that blocks deleting
#     rows directly, and
#   - even without it, deleting the row would leave the real file in S3 and merely
#     lose track of it, which is worse than doing nothing.
# Deletion must go through the Storage API, which the admin portal already does as
# an authenticated whitelisted admin.
#
# WHY ORPHANS EXIST
# -----------------
# storage.objects had no DELETE policy until 2026-07-16, so every photo cleanup the
# app attempted was silently denied while the code discarded the returned error.
# At that point: 119 objects stored, 19 referenced, ~102MB of debt (79 orphaned on
# 2026-07-08 alone). The leak is fixed -- deletes work and failures now surface --
# so this is for auditing, not firefighting.
#
# "Orphan" = a stored object whose name appears in NO vehicle's images array, and
# is not a SUBSTRING of any entry either. That second check matters: `images` may
# hold bare filenames OR full external URLs, so a substring match means the object
# IS in use via a URL and must not be touched.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1

DBURL="${SUPABASE_DB_URL:-}"
if [ -z "$DBURL" ] && [ -f .env.local ]; then
    DBURL=$(grep -E '^SUPABASE_DB_URL=' .env.local | cut -d= -f2- | sed 's/^["'"'"']//; s/["'"'"']$//')
fi
[ -z "$DBURL" ] && { echo "SUPABASE_DB_URL not set and not found in .env.local"; exit 1; }

echo
echo "vehicle-photos — storage audit"
echo

# Expected layout: every object at "<vehicle-uuid>/<file>". Anything at the bucket
# root predates that convention (the INSERT policy now rejects new flat uploads).
psql "$DBURL" -c "
WITH o AS (
  SELECT name,
         (metadata->>'size')::bigint AS bytes,
         name ~ '^[0-9a-fA-F-]{36}/[^/]+$' AS filed,
         split_part(name, '/', 1) AS folder,
         position('/' in name) > 0 AS foldered
  FROM storage.objects WHERE bucket_id = 'vehicle-photos'
)
SELECT count(*) AS stored,
       count(*) FILTER (WHERE filed) AS filed_under_vehicle,
       count(*) FILTER (WHERE NOT foldered) AS loose_in_root,
       count(*) FILTER (WHERE foldered AND NOT EXISTS (
           SELECT 1 FROM public.vehicles v WHERE v.id::text = o.folder)) AS folder_has_no_vehicle
FROM o;"

echo "  Unreferenced (safe to delete):"
psql "$DBURL" -c "
WITH orphan AS (
  SELECT o.name, o.created_at, (o.metadata->>'size')::bigint AS bytes
  FROM storage.objects o
  WHERE o.bucket_id = 'vehicle-photos'
    AND NOT EXISTS (SELECT 1 FROM public.vehicles v WHERE o.name = ANY(v.images))
    AND NOT EXISTS (
          SELECT 1 FROM public.vehicles v2, unnest(v2.images) img
          WHERE img LIKE '%' || o.name || '%')
)
SELECT count(*) AS orphaned,
       COALESCE(pg_size_pretty(sum(bytes)),'0') AS reclaimable,
       min(created_at)::date AS oldest,
       max(created_at)::date AS newest
FROM orphan;"

echo "  Fix both from the admin portal: Inventory -> Tidy Photos"
echo "  (files loose photos under their vehicle, then deletes unreferenced ones)"
echo
