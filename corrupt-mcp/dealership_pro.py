"""
End-to-end stand-up automation for the Pro dealership tier
(`corrupt-dealership-pro/` — Next.js + Supabase).

This module is the engine behind the Pro-tier MCP tools in `server.py`. It is a
plain library (no `mcp` dependency) so it can be unit-tested on its own and
reused from scripts. Everything here is deterministic and idempotent where the
underlying APIs allow, and fails loudly with the provider's own error text
rather than guessing.

The stand-up it automates, matching the manual runbook in
`corrupt-dealership-pro/README.md` + `supabase/README.md`:

  1. scaffold_pro()        copy the template out of the repo + generate config
  2. provision_supabase()  create the Supabase project, apply the schema,
                           seed the first super admin, set Vault + function secrets
  3. deploy_function()     deploy the lead-notification edge function
  4. deploy_vercel()       create the Vercel project + env, deploy
  5. verify()              run supabase/tests/rls_regression.sh against the project
  6. standup()             all of the above from one structured input

Credentials are NEVER hardcoded. Tokens come in as arguments or from the
environment (SUPABASE_ACCESS_TOKEN, VERCEL_TOKEN). Generated secrets (the
database password, the webhook shared secret) are returned to the caller so the
operator can record them — Supabase cannot show them again later.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import subprocess
import time
import urllib.parse

import requests

# --------------------------------------------------------------------------- #
# Paths / constants
# --------------------------------------------------------------------------- #

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FACTORY_ROOT = os.path.dirname(BASE_DIR)
TEMPLATE_PRO = os.path.join(FACTORY_ROOT, "corrupt-dealership-pro")
DEFAULT_MIGRATION = os.path.join(
    TEMPLATE_PRO, "supabase", "migrations", "0001_initial_schema.sql"
)
DEFAULT_FUNCTION_DIR = os.path.join(
    TEMPLATE_PRO, "supabase", "functions", "send-credit-app-notification"
)
DEFAULT_FUNCTION_SLUG = "send-credit-app-notification"
RLS_REGRESSION_REL = os.path.join("supabase", "tests", "rls_regression.sh")

SUPABASE_API = "https://api.supabase.com"
VERCEL_API = "https://api.vercel.com"

# Marker table proving the baseline schema has already been applied.
SCHEMA_MARKER = "public.authorized_admins"

# Names of the three Vault secrets the notification trigger reads. Kept as
# constants because the trigger in 0001_initial_schema.sql looks them up by
# these exact names.
VAULT_PROJECT_URL = "project_url"
VAULT_ANON_KEY = "project_anon_key"
VAULT_WEBHOOK_SECRET = "send_credit_app_notification_secret"

# Files/dirs never copied into a generated site.
_COPY_SKIP_DIRS = {"node_modules", ".next", ".git", ".vercel", "coverage"}
_COPY_SKIP_EXACT = {".DS_Store"}


class StandupError(RuntimeError):
    """Raised for any predictable, operator-actionable failure."""


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #

def _require(value, name, env_var=None):
    """Return value, else the env var, else raise a clear error."""
    if value:
        return value
    if env_var and os.environ.get(env_var):
        return os.environ[env_var]
    hint = f" or set ${env_var}" if env_var else ""
    raise StandupError(f"Missing required value: {name}{hint}.")


def _pg_str(value) -> str:
    """Render a Python value as a safe single-quoted Postgres string literal."""
    if value is None:
        return "null"
    s = str(value)
    return "'" + s.replace("'", "''") + "'"


def project_slug(name: str) -> str:
    """Vercel/DNS-safe slug: lowercase, hyphenated, trimmed."""
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:100] or "dealership"


def format_phone(raw: str) -> str:
    """(555) 555-0100 for a 10-digit US number; otherwise return as-is."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    if len(digits) == 11 and digits[0] == "1":
        return f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    return raw


def gen_password(nbytes: int = 24) -> str:
    """Strong DB password guaranteed to contain upper/lower/digit."""
    while True:
        pw = secrets.token_urlsafe(nbytes)
        if any(c.islower() for c in pw) and any(c.isupper() for c in pw) and any(
            c.isdigit() for c in pw
        ):
            return pw


def gen_secret(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


# --------------------------------------------------------------------------- #
# 1. Config generation  (config-FILE generation, not {{TOKEN}} replacement)
# --------------------------------------------------------------------------- #

def _ts_str(value) -> str:
    """JSON-encode a string as a TypeScript double-quoted literal."""
    return json.dumps("" if value is None else str(value))


def generate_site_config(
    *,
    brand_name: str,
    contact_phone: str,
    contact_email: str,
    address_street: str,
    address_city: str,
    address_state: str,
    address_zip: str,
    domain: str,
    legal_suffix: str = "LLC",
    legal_name: str = "",
    tagline: str = "Premium Showroom & Flexible Financing",
    founded_year: int = 0,
    site_url: str = "",
    phone_display: str = "",
    facebook_url: str = "",
    locations=None,
) -> str:
    """
    Produce the full contents of `src/config/site.ts` from structured inputs,
    matching the shape/types of the template's own config (interface
    DealershipLocation + siteConfig `as const` + the fullAddress/cityState/
    getLocationLabel helpers). This is a real config file, not a string-
    substituted template — every value is escaped for TypeScript.
    """
    legal_name = legal_name or f"{brand_name} {legal_suffix}".strip()
    site_url = site_url or f"https://www.{domain}"
    phone_raw = re.sub(r"\D", "", contact_phone or "")
    phone_display = phone_display or format_phone(contact_phone)
    if not locations:
        locations = [{"id": "main", "label": "Main Lot"}]
    # Validate location ids up front — they land in the DB and in URLs.
    for loc in locations:
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", loc.get("id", "")):
            raise StandupError(
                f"Invalid location id {loc.get('id')!r}: use lowercase letters, "
                "digits, hyphen or underscore (no spaces)."
            )

    loc_lines = ",\n".join(
        f"    {{ id: {_ts_str(l['id'])}, label: {_ts_str(l['label'])} }}"
        for l in locations
    )
    founded = founded_year if founded_year else 0
    founded_line = (
        f"    foundedYear: {founded},"
        if founded
        else "    // foundedYear omitted — add it for \"Since {year}\" copy.\n    foundedYear: new Date().getFullYear(),"
    )

    return f'''/**
 * Central branding & contact configuration.
 *
 * GENERATED by the Corrupt MCP Pro-tier scaffolder from structured inputs.
 * Safe to hand-edit afterwards — this is the one file that carries every
 * brand name, phone number, address, and lot location the UI displays.
 *
 * Infrastructure (Supabase URL/keys) is configured separately via environment
 * variables — see `.env.example`.
 */

export interface DealershipLocation {{
  /** Stable identifier stored on `vehicles.location`. Lowercase, no spaces. */
  id: string;
  /** Human-readable label shown in the UI (filters, badges, admin form). */
  label: string;
}}

export const siteConfig = {{
  brand: {{
    name: {_ts_str(brand_name)},
    legalSuffix: {_ts_str(legal_suffix)},
    legalName: {_ts_str(legal_name)},
    tagline: {_ts_str(tagline)},
{founded_line}
  }},
  contact: {{
    phone: {{
      /** Digits only — used for `tel:`/`sms:` links. */
      raw: {_ts_str(phone_raw)},
      /** Human-formatted for display. */
      display: {_ts_str(phone_display)},
    }},
    email: {{
      general: {_ts_str(contact_email)},
    }},
  }},
  address: {{
    street: {_ts_str(address_street)},
    city: {_ts_str(address_city)},
    state: {_ts_str(address_state)},
    zip: {_ts_str(address_zip)},
  }},
  site: {{
    /** Bare domain, no protocol — used for display copy. */
    domain: {_ts_str(domain)},
    /** Canonical site URL used in metadata, schema.org, and OG images. */
    url: {_ts_str(site_url)},
  }},
  social: {{
    /** Full Facebook page URL. Empty hides the "Message on Facebook" button. */
    facebook: {_ts_str(facebook_url)},
  }},
  /**
   * Lot / showroom locations. `vehicles.location` stores one of these `id`s.
   * The location filter/tabs only appear once more than one location exists.
   * If your database enforces a CHECK constraint on `vehicles.location`, keep
   * it in sync with the `id`s listed here.
   */
  locations: [
{loc_lines},
  ] as DealershipLocation[],
}} as const;

/** `"123 Main St, Springfield, ST 00000"` — full mailing address. */
export const fullAddress = `${{siteConfig.address.street}}, ${{siteConfig.address.city}}, ${{siteConfig.address.state}} ${{siteConfig.address.zip}}`;

/** `"Springfield, ST"` — short form used in badges and copy. */
export const cityState = `${{siteConfig.address.city}}, ${{siteConfig.address.state}}`;

/** Looks up a configured location's display label; falls back to the raw id. */
export function getLocationLabel(locationId: string): string {{
  return siteConfig.locations.find(loc => loc.id === locationId)?.label ?? locationId;
}}
'''


# --------------------------------------------------------------------------- #
# 1b. Template copy + env file
# --------------------------------------------------------------------------- #

def _copy_ignore(dir_path, names):
    ignored = set()
    for n in names:
        if n in _COPY_SKIP_DIRS or n in _COPY_SKIP_EXACT:
            ignored.add(n)
        elif n.endswith(".tsbuildinfo"):
            ignored.add(n)
        elif n.startswith(".env") and n != ".env.example":
            # exclude real env files, keep the committed example
            ignored.add(n)
    return ignored


def copy_template(target_path: str, force: bool = False) -> None:
    """Copy corrupt-dealership-pro/ to target_path, minus build/vcs/env cruft."""
    if not os.path.isdir(TEMPLATE_PRO):
        raise StandupError(f"Pro template not found at {TEMPLATE_PRO}")
    if os.path.exists(target_path):
        if force:
            shutil.rmtree(target_path)
        elif os.listdir(target_path):
            raise StandupError(
                f"{target_path} already exists and is not empty. "
                "Pass force=True to replace it."
            )
        else:
            os.rmdir(target_path)
    shutil.copytree(TEMPLATE_PRO, target_path, ignore=_copy_ignore)
    _harden_vercelignore(target_path)


def _harden_vercelignore(target_path: str) -> None:
    """Ensure local env files are never uploaded to Vercel at deploy time."""
    path = os.path.join(target_path, ".vercelignore")
    lines = []
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
    for pat in (".env", ".env.local", ".env.*.local"):
        if pat not in lines:
            lines.append(pat)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def write_env_local(
    target_path: str,
    *,
    supabase_url: str = "",
    supabase_anon_key: str = "",
    db_url: str = "",
) -> str:
    """Write <target>/.env.local with the browser + local-tooling variables."""
    path = os.path.join(target_path, ".env.local")
    body = (
        "# Generated by the Corrupt MCP Pro-tier scaffolder. Gitignored — never commit.\n"
        f"NEXT_PUBLIC_SUPABASE_URL={supabase_url}\n"
        f"NEXT_PUBLIC_SUPABASE_ANON_KEY={supabase_anon_key}\n"
    )
    if db_url:
        body += (
            "\n# Local tooling only (rls_regression.sh / migrations). Not read by the app.\n"
            f"SUPABASE_DB_URL={db_url}\n"
        )
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    return path


# --------------------------------------------------------------------------- #
# Supabase Management API client
# --------------------------------------------------------------------------- #

class SupabaseAdmin:
    """Thin wrapper over the Supabase Management API (api.supabase.com)."""

    # Terminal-failure statuses. Anything not healthy and not fatal (COMING_UP,
    # RESTORING, …) just means "keep polling until the deadline".
    _FATAL = {"INIT_FAILED", "REMOVED", "RESTORE_FAILED", "PAUSE_FAILED", "GOING_DOWN", "PAUSING"}

    def __init__(self, access_token: str, timeout: int = 60):
        self.token = _require(access_token, "Supabase access token", "SUPABASE_ACCESS_TOKEN")
        self.timeout = timeout
        self.s = requests.Session()
        self.s.headers.update(
            {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        )

    # -- low level -------------------------------------------------------- #
    def _req(self, method: str, path: str, *, json_body=None, params=None, raw=None,
             files=None, headers=None, ok=(200, 201)):
        url = SUPABASE_API + path
        h = None
        if headers:
            h = dict(self.s.headers)
            h.update(headers)
        resp = self.s.request(
            method, url, json=json_body, params=params, data=raw, files=files,
            headers=h, timeout=self.timeout,
        )
        if resp.status_code not in ok:
            raise StandupError(
                f"Supabase API {method} {path} -> {resp.status_code}: {resp.text[:800]}"
            )
        if resp.text and resp.headers.get("content-type", "").startswith("application/json"):
            return resp.json()
        return resp.text

    # -- organizations / projects ---------------------------------------- #
    def list_organizations(self):
        return self._req("GET", "/v1/organizations")

    def resolve_org(self, organization_id: str = "", organization_slug: str = ""):
        """Return (id, slug) for the org to create the project in."""
        orgs = self.list_organizations() or []
        if organization_id:
            for o in orgs:
                if o.get("id") == organization_id:
                    return o["id"], o["slug"]
            return organization_id, organization_slug or ""
        if organization_slug:
            for o in orgs:
                if o.get("slug") == organization_slug:
                    return o["id"], o["slug"]
            raise StandupError(f"No organization with slug {organization_slug!r}.")
        if len(orgs) == 1:
            return orgs[0]["id"], orgs[0]["slug"]
        names = ", ".join(f"{o.get('slug')} ({o.get('name')})" for o in orgs) or "none"
        raise StandupError(
            "Multiple (or zero) organizations found; pass organization_slug. "
            f"Available: {names}"
        )

    def create_project(self, *, name, db_pass, organization_id, organization_slug,
                       region="us-east-1", plan="", instance_size=""):
        body = {
            "name": name,
            "db_pass": db_pass,
            "organization_id": organization_id,
            "organization_slug": organization_slug,
            "region": region,
        }
        if plan:
            body["plan"] = plan
        if instance_size:
            body["desired_instance_size"] = instance_size
        return self._req("POST", "/v1/projects", json_body=body)

    def get_project(self, ref):
        return self._req("GET", f"/v1/projects/{ref}")

    def wait_ready(self, ref, *, timeout_s=900, interval_s=10, log=None):
        deadline = time.time() + timeout_s
        last = None
        while time.time() < deadline:
            # A blip during the (up to 15 min) provisioning window — a transient
            # 5xx, a brief 404 right after create, or a dropped connection — must
            # not abort the whole stand-up. Keep polling until the deadline; only
            # a _FATAL status or the timeout is terminal.
            try:
                proj = self.get_project(ref)
            except (StandupError, requests.RequestException) as e:
                if log:
                    log(f"  (transient while polling {ref}: {str(e)[:120]})")
                time.sleep(interval_s)
                continue
            status = proj.get("status")
            if status != last and log:
                log(f"  project {ref} status: {status}")
            last = status
            if status == "ACTIVE_HEALTHY":
                return proj
            if status in self._FATAL:
                raise StandupError(f"Project {ref} entered fatal status {status}.")
            time.sleep(interval_s)
        raise StandupError(
            f"Timed out after {timeout_s}s waiting for {ref} to become ACTIVE_HEALTHY "
            f"(last status: {last})."
        )

    # -- keys / SQL ------------------------------------------------------- #
    def get_anon_key(self, ref):
        """Return the browser (anon / publishable) API key value + which kind."""
        keys = self._req("GET", f"/v1/projects/{ref}/api-keys", params={"reveal": "true"})
        by_name = {k.get("name"): k for k in keys}
        # Prefer the classic anon JWT; fall back to the new publishable key.
        chosen = by_name.get("anon")
        if not chosen or not chosen.get("api_key"):
            chosen = next((k for k in keys if k.get("type") == "publishable" and k.get("api_key")), None)
        if not chosen or not chosen.get("api_key"):
            chosen = next((k for k in keys if k.get("type") != "secret" and k.get("api_key")), None)
        if not chosen or not chosen.get("api_key"):
            raise StandupError(f"Could not find an anon/publishable API key for {ref}.")
        return chosen["api_key"], (chosen.get("name") or chosen.get("type"))

    def run_sql(self, ref, query, *, read_only=False):
        return self._req(
            "POST", f"/v1/projects/{ref}/database/query",
            json_body={"query": query, "read_only": read_only},
        )

    def schema_applied(self, ref) -> bool:
        rows = self.run_sql(ref, f"select to_regclass('{SCHEMA_MARKER}') as t;", read_only=True)
        try:
            return bool(rows and rows[0].get("t"))
        except (AttributeError, IndexError, TypeError):
            return False

    def apply_migration(self, ref, sql_text):
        # One multi-statement call runs as a single implicit transaction, so a
        # failure rolls the whole thing back (nothing half-applied).
        return self.run_sql(ref, sql_text)

    def seed_super_admin(self, ref, email):
        self.run_sql(
            ref,
            "insert into public.authorized_admins (email, is_super_admin) "
            f"values ({_pg_str(email)}, true) "
            "on conflict (email) do update set is_super_admin = true;",
        )

    def upsert_vault_secret(self, ref, name, value):
        """Idempotent create-or-update of a Supabase Vault secret."""
        self.run_sql(ref, f"""
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = {_pg_str(name)};
  if v_id is null then
    perform vault.create_secret({_pg_str(value)}, {_pg_str(name)});
  else
    perform vault.update_secret(v_id, {_pg_str(value)});
  end if;
end $$;
""".strip())

    def read_vault_secret(self, ref, name):
        """Return a Vault secret's decrypted value, or None if it isn't set."""
        rows = self.run_sql(
            ref,
            f"select decrypted_secret from vault.decrypted_secrets "
            f"where name = {_pg_str(name)} limit 1;",
            read_only=True,
        )
        try:
            return rows[0].get("decrypted_secret")
        except (AttributeError, IndexError, TypeError):
            return None

    def set_function_secrets(self, ref, mapping):
        """POST /secrets — bulk set edge-function env vars (idempotent upsert)."""
        payload = [{"name": k, "value": v} for k, v in mapping.items() if v is not None and v != ""]
        if not payload:
            return []
        return self._req("POST", f"/v1/projects/{ref}/secrets", json_body=payload, ok=(200, 201))

    def get_pooler(self, ref):
        return self._req("GET", f"/v1/projects/{ref}/config/database/pooler")

    def pooler_db_url(self, ref, db_password):
        """Build a psql-usable Session Pooler URI (IPv4, works off local nets)."""
        cfg = self.get_pooler(ref)
        host = cfg.get("db_host")
        port = cfg.get("db_port") or 5432
        user = cfg.get("db_user") or f"postgres.{ref}"
        dbname = cfg.get("db_name") or "postgres"
        if not host:
            raise StandupError(f"Pooler config for {ref} did not include db_host: {cfg}")
        pw = urllib.parse.quote(db_password, safe="")
        return f"postgresql://{user}:{pw}@{host}:{port}/{dbname}"

    def deploy_function(self, ref, function_dir, *, slug=DEFAULT_FUNCTION_SLUG,
                        entrypoint="index.ts", verify_jwt=False):
        """Deploy an edge function via the multipart /functions/deploy upsert.

        Supabase bundles server-side, so no local Deno/CLI is needed.

        verify_jwt defaults to False on purpose. The only caller is the DB
        AFTER-INSERT trigger, which authenticates with the project's browser key
        as `Authorization: Bearer <key>`. On projects created since Nov 2025 that
        key is a *publishable* key (`sb_publishable_…`), NOT a JWT — so a
        gateway JWT check (verify_jwt=True) would 401 the trigger's fire-and-forget
        call and silently kill lead emails. The function does its own fail-closed
        `X-Webhook-Secret` check, which is the real gate; the key is public anyway.
        """
        if not os.path.isdir(function_dir):
            raise StandupError(f"Function directory not found: {function_dir}")
        entry_path = os.path.join(function_dir, entrypoint)
        if not os.path.isfile(entry_path):
            raise StandupError(f"Entrypoint {entrypoint} not found in {function_dir}")
        metadata = {"entrypoint_path": entrypoint, "name": slug, "verify_jwt": verify_jwt}
        files = [("metadata", (None, json.dumps(metadata), "application/json"))]
        # Attach every .ts/.js/.json file in the function dir (single-file today,
        # but this keeps import_map or helpers working if added later).
        opened = []
        try:
            for fn in sorted(os.listdir(function_dir)):
                fp = os.path.join(function_dir, fn)
                if os.path.isfile(fp) and os.path.splitext(fn)[1] in (".ts", ".js", ".json", ".tsx"):
                    fh = open(fp, "rb")
                    opened.append(fh)
                    files.append(("file", (fn, fh, "application/typescript")))
            # requests sets multipart automatically; drop the JSON default header.
            return self._req(
                "POST", f"/v1/projects/{ref}/functions/deploy",
                params={"slug": slug}, files=files,
                headers={"Content-Type": None}, ok=(200, 201),
            )
        finally:
            for fh in opened:
                fh.close()


# --------------------------------------------------------------------------- #
# Vercel client (REST for project/env; CLI for the build/deploy)
# --------------------------------------------------------------------------- #

class Vercel:
    def __init__(self, token: str, team_id: str = "", timeout: int = 60):
        self.token = _require(token, "Vercel token", "VERCEL_TOKEN")
        self.team_id = team_id
        self.timeout = timeout
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {self.token}"})

    def _params(self, extra=None):
        p = {}
        if self.team_id:
            p["teamId"] = self.team_id
        if extra:
            p.update(extra)
        return p

    def _req(self, method, path, *, json_body=None, params=None, ok=(200, 201)):
        resp = self.s.request(
            method, VERCEL_API + path, json=json_body,
            params=self._params(params), timeout=self.timeout,
        )
        if resp.status_code not in ok:
            raise StandupError(
                f"Vercel API {method} {path} -> {resp.status_code}: {resp.text[:800]}"
            )
        return resp.json() if resp.text else {}

    def get_project(self, name_or_id):
        """Return the project, or None only for a genuine 404. Any other error
        (403 team-scope mismatch, 429, 5xx) is raised — treating those as
        'not found' would wrongly try to create and then 409, or duplicate."""
        resp = self.s.request(
            "GET", VERCEL_API + f"/v9/projects/{name_or_id}",
            params=self._params(), timeout=self.timeout,
        )
        if resp.status_code == 404:
            return None
        if resp.status_code not in (200, 201):
            raise StandupError(
                f"Vercel API GET /v9/projects/{name_or_id} -> "
                f"{resp.status_code}: {resp.text[:800]}"
            )
        return resp.json() if resp.text else None

    def create_or_get_project(self, name, *, framework="nextjs", env=None):
        """Create the project (with env vars inline), or return the existing one."""
        existing = self.get_project(name)
        if existing:
            if env:
                self.upsert_env(existing["id"], env)
            return existing, False
        body = {"name": name, "framework": framework}
        if env:
            body["environmentVariables"] = [
                {
                    "key": k,
                    "value": v,
                    "type": "encrypted",
                    "target": ["production", "preview", "development"],
                }
                for k, v in env.items()
            ]
        return self._req("POST", "/v11/projects", json_body=body), True

    def upsert_env(self, project_id, env):
        for k, v in env.items():
            self._req(
                "POST", f"/v10/projects/{project_id}/env",
                params={"upsert": "true"},
                json_body={
                    "key": k, "value": v, "type": "encrypted",
                    "target": ["production", "preview", "development"],
                },
                ok=(200, 201),
            )

    def write_link(self, target_path, project_id, org_id):
        """Write .vercel/project.json so the CLI deploys to this exact project."""
        d = os.path.join(target_path, ".vercel")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "project.json"), "w", encoding="utf-8") as f:
            json.dump({"projectId": project_id, "orgId": org_id}, f)

    def deploy_cli(self, target_path, *, prod=True, timeout_s=900):
        """Deploy via the Vercel CLI (cloud build; no local node_modules needed)."""
        cli = shutil.which("vercel")
        if not cli:
            raise StandupError(
                "The `vercel` CLI is required to deploy but was not found on PATH. "
                "Install it with `npm i -g vercel`, or create the project + env via "
                "REST and deploy from a git push instead."
            )
        # Pass the token via the child env, not argv (argv is visible in `ps`).
        env = dict(os.environ, VERCEL_TOKEN=self.token)
        cmd = [cli, "deploy", "--yes", "--cwd", target_path]
        if prod:
            cmd.append("--prod")
        if self.team_id:
            cmd += ["--scope", self.team_id]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=timeout_s)
        except subprocess.TimeoutExpired as e:
            raise StandupError(
                f"vercel deploy timed out after {timeout_s}s (cloud build stalled)."
            ) from e
        if proc.returncode != 0:
            raise StandupError(
                f"vercel deploy failed (exit {proc.returncode}):\n{proc.stderr[-1500:]}"
            )
        url = ""
        for line in reversed(proc.stdout.splitlines()):
            line = line.strip()
            if line.startswith("https://"):
                url = line
                break
        return {"url": url, "stdout_tail": proc.stdout[-800:]}


# --------------------------------------------------------------------------- #
# High-level orchestration (what the MCP tools call)
# --------------------------------------------------------------------------- #

def scaffold_pro(target_path, config_inputs, *, supabase_url="", supabase_anon_key="",
                 supabase_db_url="", force=False):
    """Copy the template + generate site.ts (+ .env.local if creds provided)."""
    target_path = os.path.abspath(os.path.expanduser(target_path))
    # Generated sites must live OUTSIDE the (public) factory repo. Use commonpath
    # so a sibling like "…-distribution-backup" isn't mistaken for being inside.
    repo_root = os.path.realpath(FACTORY_ROOT)
    rt = os.path.realpath(target_path)
    if rt == repo_root or os.path.commonpath([rt, repo_root]) == repo_root:
        raise StandupError(
            "target_path must be OUTSIDE the corrupt-factory repo — generated "
            "client sites never live in the (public) repo."
        )
    copy_template(target_path, force=force)
    site_ts = generate_site_config(**config_inputs)
    cfg_path = os.path.join(target_path, "src", "config", "site.ts")
    with open(cfg_path, "w", encoding="utf-8") as f:
        f.write(site_ts)
    env_path = ""
    if supabase_url or supabase_anon_key or supabase_db_url:
        env_path = write_env_local(
            target_path, supabase_url=supabase_url,
            supabase_anon_key=supabase_anon_key, db_url=supabase_db_url,
        )
    return {
        "status": "success",
        "target_path": target_path,
        "site_config": cfg_path,
        "env_local": env_path,
    }


def provision_supabase(
    *,
    access_token="",
    project_name,
    super_admin_email,
    existing_ref="",
    db_password="",
    region="us-east-1",
    organization_id="",
    organization_slug="",
    plan="",
    instance_size="",
    migration_path=DEFAULT_MIGRATION,
    resend_api_key="",
    webhook_secret="",
    notification_to_emails="",
    notification_sender_email="",
    notification_brand_name="",
    target_path="",
    log=None,
):
    """Create/verify the Supabase project and bring it to a working state.

    The baseline schema is applied at most once, gated by the authorized_admins
    marker — it is a one-shot "apply to an empty project" script, not idempotent
    DDL, so there is no force-reapply (re-running it errors on "already exists").
    Re-running against an existing_ref safely re-seeds the admin and re-sets
    secrets without touching the schema.
    """
    log = log or (lambda *_: None)
    sb = SupabaseAdmin(access_token)

    with open(migration_path, "r", encoding="utf-8") as f:
        migration_sql = f.read()

    created = False
    if existing_ref:
        ref = existing_ref
        log(f"Using existing project {ref}")
    else:
        db_password = db_password or gen_password()
        org_id, org_slug = sb.resolve_org(organization_id, organization_slug)
        log(f"Creating project {project_name!r} in org {org_slug or org_id} ({region})")
        proj = sb.create_project(
            name=project_name, db_pass=db_password,
            organization_id=org_id, organization_slug=org_slug,
            region=region, plan=plan, instance_size=instance_size,
        )
        ref = proj["ref"]
        created = True
        log(f"  created ref={ref}")

    # Everything past creation is wrapped so a failure never loses the ref —
    # otherwise a paid project is orphaned and a blind re-run makes a duplicate.
    try:
        sb.wait_ready(ref, log=log)
        project_url = f"https://{ref}.supabase.co"
        anon_key, key_kind = sb.get_anon_key(ref)
        log(f"Fetched {key_kind} key; project URL {project_url}")

        # Reuse the existing webhook secret when re-provisioning so a re-run
        # doesn't silently rotate it out from under the operator.
        if not webhook_secret:
            existing = sb.read_vault_secret(ref, VAULT_WEBHOOK_SECRET) if existing_ref else None
            webhook_secret = existing or gen_secret()

        if sb.schema_applied(ref):
            log("Schema already present (authorized_admins exists) — skipping apply.")
            schema_action = "skipped (already applied)"
        else:
            log("Applying 0001_initial_schema.sql ...")
            sb.apply_migration(ref, migration_sql)   # raises with PG error text on failure
            schema_action = "applied"

        log(f"Seeding super admin {super_admin_email}")
        sb.seed_super_admin(ref, super_admin_email)

        log("Setting the three Vault secrets (project_url, project_anon_key, webhook secret)")
        sb.upsert_vault_secret(ref, VAULT_PROJECT_URL, project_url)
        sb.upsert_vault_secret(ref, VAULT_ANON_KEY, anon_key)
        sb.upsert_vault_secret(ref, VAULT_WEBHOOK_SECRET, webhook_secret)

        fn_secrets = {
            "WEBHOOK_SECRET": webhook_secret,
            "RESEND_API_KEY": resend_api_key,
            "NOTIFICATION_TO_EMAILS": notification_to_emails,
            "NOTIFICATION_SENDER_EMAIL": notification_sender_email,
            "NOTIFICATION_BRAND_NAME": notification_brand_name,
        }
        set_names = [k for k, v in fn_secrets.items() if v]
        log(f"Setting edge-function secrets: {', '.join(set_names) or '(none)'}")
        sb.set_function_secrets(ref, fn_secrets)

        db_url = ""
        if db_password:
            try:
                db_url = sb.pooler_db_url(ref, db_password)
            except StandupError as e:
                log(f"  (pooler URL unavailable: {e})")

        if target_path:
            write_env_local(
                target_path, supabase_url=project_url,
                supabase_anon_key=anon_key, db_url=db_url,
            )
    except Exception as e:
        raise StandupError(
            f"Provisioning failed after the project was "
            f"{'created' if created else 'selected'} (ref={ref}). Re-run with "
            f"existing_ref='{ref}' to continue without creating a duplicate. "
            f"Cause: {e}"
        ) from e

    return {
        "status": "success",
        "ref": ref,
        "created": created,
        "project_url": project_url,
        "anon_key": anon_key,
        "anon_key_kind": key_kind,
        "db_password": db_password,          # record this — Supabase won't show it again
        "supabase_db_url": db_url,
        "webhook_secret": webhook_secret,    # shared by the Vault secret + WEBHOOK_SECRET
        "schema": schema_action,
        "super_admin": super_admin_email,
        "function_secrets_set": set_names,
        "resend_configured": bool(resend_api_key),
        "dashboard": f"https://supabase.com/dashboard/project/{ref}",
    }


def deploy_function(*, access_token="", ref, function_dir=DEFAULT_FUNCTION_DIR,
                    slug=DEFAULT_FUNCTION_SLUG, verify_jwt=False, log=None):
    log = log or (lambda *_: None)
    sb = SupabaseAdmin(access_token)
    log(f"Deploying edge function {slug} to {ref}")
    resp = sb.deploy_function(ref, function_dir, slug=slug, verify_jwt=verify_jwt)
    return {
        "status": "success",
        "ref": ref,
        "slug": slug,
        "verify_jwt": verify_jwt,
        "endpoint": f"https://{ref}.supabase.co/functions/v1/{slug}",
        "response": resp,
    }


def deploy_vercel(*, vercel_token="", target_path, project_name="", team_id="",
                  supabase_url, supabase_anon_key, prod=True, log=None):
    log = log or (lambda *_: None)
    target_path = os.path.abspath(os.path.expanduser(target_path))
    if not os.path.isdir(target_path):
        raise StandupError(f"target_path does not exist: {target_path}")
    name = project_slug(project_name or os.path.basename(target_path.rstrip("/")))
    vc = Vercel(vercel_token, team_id=team_id)
    env = {
        "NEXT_PUBLIC_SUPABASE_URL": supabase_url,
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": supabase_anon_key,
    }
    log(f"Creating/looking up Vercel project {name!r}")
    proj, created = vc.create_or_get_project(name, env=env)
    project_id = proj["id"]
    org_id = team_id or proj.get("accountId") or ""
    vc.write_link(target_path, project_id, org_id)
    log(f"  project {'created' if created else 'exists'} id={project_id}; deploying ...")
    result = vc.deploy_cli(target_path, prod=prod)
    return {
        "status": "success",
        "project": name,
        "project_id": project_id,
        "created": created,
        "url": result.get("url"),
        # Personal-account project URLs are under the username (not derivable from
        # the token here), so only build a team dashboard link when we know the team.
        "dashboard": (f"https://vercel.com/{team_id}/{name}" if team_id
                      else "https://vercel.com/dashboard"),
    }


def verify(*, access_token="", ref, db_password="", supabase_db_url="", target_path,
           admin_email="rls-regression-admin@corrupt.invalid",
           super_email="rls-regression-super@corrupt.invalid", log=None):
    """Run supabase/tests/rls_regression.sh against the project.

    Seeds two throwaway admin identities (one ordinary, one super) so the suite's
    admin/super assertions have identities to check, runs the script, then removes
    them — the client's authorized_admins list is left exactly as it was.
    """
    log = log or (lambda *_: None)
    script = os.path.join(os.path.abspath(os.path.expanduser(target_path)), RLS_REGRESSION_REL)
    if not os.path.isfile(script):
        raise StandupError(f"rls_regression.sh not found at {script}")
    if not shutil.which("psql"):
        raise StandupError("psql is required to run rls_regression.sh but is not on PATH.")

    sb = SupabaseAdmin(access_token)
    db_url = supabase_db_url or (sb.pooler_db_url(ref, db_password) if db_password else "")
    if not db_url:
        raise StandupError("Need supabase_db_url or db_password to reach the database.")

    log("Seeding throwaway RLS test identities")
    # RETURNING + `do nothing` means we learn which rows we ACTUALLY inserted, so
    # cleanup only deletes those — never a pre-existing (possibly real) admin the
    # operator pointed the test at via admin_email/super_email.
    seeded = sb.run_sql(ref,
        "insert into public.authorized_admins (email, is_super_admin) values "
        f"({_pg_str(admin_email)}, false), ({_pg_str(super_email)}, true) "
        "on conflict (email) do nothing returning email;")
    inserted = [r["email"] for r in (seeded or []) if isinstance(r, dict) and r.get("email")]
    try:
        env = dict(os.environ)
        env.update({
            "SUPABASE_DB_URL": db_url,
            "RLS_TEST_ADMIN_EMAIL": admin_email,
            "RLS_TEST_SUPER_EMAIL": super_email,
        })
        log("Running rls_regression.sh ...")
        proc = subprocess.run(
            ["bash", script], capture_output=True, text=True, env=env, timeout=600,
            cwd=os.path.dirname(os.path.dirname(os.path.dirname(script))),
        )
    except subprocess.TimeoutExpired as e:
        raise StandupError("rls_regression.sh timed out after 600s.") from e
    finally:
        if inserted:
            log("Removing throwaway RLS test identities")
            vals = ", ".join(_pg_str(e) for e in inserted)
            sb.run_sql(ref, f"delete from public.authorized_admins where email in ({vals});")

    out = proc.stdout + ("\n" + proc.stderr if proc.stderr else "")
    m = re.search(r"(\d+)\s+passed,\s+(\d+)\s+failed", out)
    passed = int(m.group(1)) if m else None
    failed = int(m.group(2)) if m else None
    return {
        "status": "pass" if proc.returncode == 0 else "fail",
        "returncode": proc.returncode,
        "passed": passed,
        "failed": failed,
        "output": out[-4000:],
    }


def standup(*, config_inputs, target_path, supabase_access_token="", vercel_token="",
            project_name="", super_admin_email, region="us-east-1",
            organization_slug="", organization_id="", plan="", instance_size="",
            resend_api_key="", notification_to_emails="", notification_sender_email="",
            notification_brand_name="", team_id="", force=False, run_verify=True,
            log=None):
    """Full pipeline: scaffold -> provision -> deploy function -> deploy Vercel -> verify."""
    log = log or (lambda *_: None)
    steps = {}
    name = project_name or config_inputs.get("brand_name", "dealership")

    log("== 1/5 scaffold ==")
    steps["scaffold"] = scaffold_pro(target_path, config_inputs, force=force)
    target_path = steps["scaffold"]["target_path"]

    log("== 2/5 provision Supabase ==")
    prov = provision_supabase(
        access_token=supabase_access_token, project_name=project_slug(name),
        super_admin_email=super_admin_email, region=region,
        organization_slug=organization_slug, organization_id=organization_id,
        plan=plan, instance_size=instance_size, resend_api_key=resend_api_key,
        notification_to_emails=notification_to_emails,
        notification_sender_email=notification_sender_email,
        notification_brand_name=notification_brand_name or config_inputs.get("brand_name", ""),
        target_path=target_path, log=log,
    )
    steps["provision"] = prov

    log("== 3/5 deploy edge function ==")
    steps["function"] = deploy_function(
        access_token=supabase_access_token, ref=prov["ref"], log=log)

    log("== 4/5 deploy to Vercel ==")
    steps["vercel"] = deploy_vercel(
        vercel_token=vercel_token, target_path=target_path, project_name=project_slug(name),
        team_id=team_id, supabase_url=prov["project_url"],
        supabase_anon_key=prov["anon_key"], log=log)

    if run_verify:
        log("== 5/5 verify (rls_regression.sh) ==")
        steps["verify"] = verify(
            access_token=supabase_access_token, ref=prov["ref"],
            db_password=prov["db_password"], supabase_db_url=prov["supabase_db_url"],
            target_path=target_path, log=log)
        if steps["verify"]["status"] != "pass":
            steps["status"] = "verify_failed"
            return steps

    steps["status"] = "success"
    steps["summary"] = {
        "site_url": steps["vercel"].get("url"),
        "supabase_ref": prov["ref"],
        "db_password": prov["db_password"],
        "webhook_secret": prov["webhook_secret"],
    }
    return steps
