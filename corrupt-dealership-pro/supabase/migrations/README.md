# Database migrations

## `0001_initial_schema.sql` — the complete baseline

This single file builds the entire database in its final, secure state: tables,
row-level security, the admin allow-list model, the `vehicle-photos` storage
bucket and its policies, and the lead-notification trigger.

### Apply it to a fresh Supabase project

```bash
# with the Supabase CLI
supabase link --project-ref <your-ref>
supabase db push
```

…or paste the file into the Supabase SQL editor and run it once.

### Then do the two required setup steps

They're documented at the bottom of the migration itself:

1. **Add your first super admin** — insert your email into `authorized_admins`
   with `is_super_admin = true`. Until you do, no one can log into the admin portal
   (RLS is the entire access-control layer — there is no bypass).
2. **Set the Vault secrets** the notification trigger reads (`project_url`,
   `project_anon_key`, `send_credit_app_notification_secret`). Until you do,
   credit-application emails are silently skipped (the insert still succeeds).

### Verify

```bash
./supabase/tests/rls_regression.sh   # set SUPABASE_DB_URL first
```

The suite asserts what each policy *should* allow, for anonymous visitors,
self-registered strangers, ordinary admins, and super admins. **Run it against the
freshly-applied project — never against a database you can't afford to test on.**

## Why one baseline instead of many migrations

This template was distilled from a production site whose schema had drifted across
a dozen unordered, hand-run SQL files — which is precisely how a security-critical
RLS gap once went unnoticed (nothing reconciled intent against reality). The
baseline is the authoritative, reviewed, secure schema. Going forward, add changes
as new timestamped migration files beside this one; never edit an applied migration.

## Extensions & Supabase features this relies on

- **`pg_net`** (enabled by the baseline) — the trigger uses `net.http_post`.
- **Supabase Vault** — the trigger reads secrets from `vault.decrypted_secrets`.
- **`auth` / `storage` schemas** — Supabase-managed; present on every project.

Because of these, the baseline is meant for a **Supabase** project, not a vanilla
Postgres instance.
