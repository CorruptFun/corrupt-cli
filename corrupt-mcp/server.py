from mcp.server.fastmcp import FastMCP
import os
import shutil
import re
import json
import datetime

import dealership_pro as pro

# Create the MCP Server
mcp = FastMCP("CorruptCLI Engine")

# The engine paths relative to THIS file's location, allowing portability
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FACTORY_ROOT = os.path.dirname(BASE_DIR)
ENGINE_DIR_INVENTORY = os.path.join(FACTORY_ROOT, "corrupt-dealership-engine")
ENGINE_DIR_SAAS = os.path.join(FACTORY_ROOT, "CorruptCLI-Engine", "engine")

@mcp.tool()
def scaffold_inventory_site(
    target_path: str,
    biz_name: str,
    biz_phone: str,
    biz_email: str,
    biz_address: str,
    biz_city: str,
    biz_state: str,
    biz_zip: str,
    brand_color: str = "#dc2626",
    tagline: str = "",
    facebook_url: str = "",
    instagram_url: str = "",
    yelp_url: str = "",
    whatsapp_number: str = "",
    se_habla_espanol: bool = False,
    logo_url: str = "",
    about_us: str = "",
    bhph_enabled: bool = False,
    lead_endpoint: str = "",
    force_overwrite: bool = False
) -> str:
    """
    Scaffolds a static inventory/service dealership website.

    Args:
        target_path: The absolute path where the website should be generated.
        biz_name: Name of the business.
        biz_phone: Phone number.
        biz_email: Business email.
        biz_address: Street address.
        biz_city: City.
        biz_state: State (e.g. KS).
        biz_zip: Zip code.
        brand_color: Primary hex color.
        bhph_enabled: Only set True if the dealer genuinely finances in-house.
            Enables Buy-Here-Pay-Here messaging. Credit advertising is regulated
            (FTC / TILA Reg Z) — do not enable speculatively.
        lead_endpoint: URL accepting a JSON POST for financing leads (Formspree,
            Web3Forms, a serverless function). If empty, the form falls back to the
            visitor's mail client so leads are never silently dropped.
        force_overwrite: If True, deletes existing directory at target_path.
    """
    if os.path.exists(target_path):
        if force_overwrite:
            shutil.rmtree(target_path)
        else:
            return json.dumps({"status": "error", "message": f"Directory {target_path} already exists. Use force_overwrite=True to replace it."})
        
    os.makedirs(target_path)
    
    if not about_us:
        about_us = f"Welcome to {biz_name}, your trusted source for reliable vehicles in {biz_city}. We are committed to honest service and competitive pricing to get you behind the wheel today."
        
    # Config
    config_data = {
        "dealership": {
            "name": biz_name,
            "about_us": about_us,
            "suffix": "",
            "tagline": tagline if tagline else "QUALITY SERVICE. HONEST PRICING.",
            "sub_tagline": "The best local service provider in town.",
            "location": f"{biz_city}, {biz_state}",
            "address": f"{biz_address} {biz_city}, {biz_state} {biz_zip}",
            "phone": biz_phone,
            "phone_formatted": f"({biz_phone[:3]}) {biz_phone[3:6]}-{biz_phone[6:]}" if len(biz_phone) == 10 else biz_phone,
            "email": biz_email,
            "facebook_url": facebook_url,
            "instagram_url": instagram_url,
            "yelp_url": yelp_url,
            "whatsapp_number": whatsapp_number,
            "se_habla_espanol": se_habla_espanol,
            "map_query": f"{biz_address} {biz_city} {biz_state}"
        },
        "branding": {
            "primary_color": brand_color,
            "primary_color_hover": brand_color,
            "theme": "dark",
            "logo_url": logo_url
        },
        "financing": {
            "bhph_enabled": bhph_enabled
        },
        "leads": {
            "endpoint": lead_endpoint
        },
        "auth": {
            "whitelisted_emails": ["admin@local.com"]
        },
        "default_badges": ["New", "Featured"]
    }

    with open(os.path.join(target_path, "config.json"), "w") as f:
        json.dump(config_data, f, indent=4)

    inventory_data = [{
        "id": "1",
        "year": 2019,
        "make": "Example Make",
        "model": "Example Model",
        "trim": "LT",
        "price": 14900,
        "mileage": 78500,
        "status": "available",
        "main_image": "https://placehold.co/600x400/1a1a1a/444444?text=Add+Your+Photo",
        "description": "Replace with a short, honest description of this vehicle.",
        "specs_highlight": "4WD",
        "features": ["Feature 1", "Feature 2", "Feature 3"],
        "badges": ["Featured"]
    }]
    with open(os.path.join(target_path, "inventory.json"), "w") as f:
        json.dump(inventory_data, f, indent=4)
        
    shutil.copy2(os.path.join(ENGINE_DIR_INVENTORY, "template.html"), os.path.join(target_path, "template.html"))
    shutil.copy2(os.path.join(ENGINE_DIR_INVENTORY, "render.py"), os.path.join(target_path, "render.py"))
    
    # Run compile
    current_dir = os.getcwd()
    os.chdir(target_path)
    os.system("python3 render.py")
    os.chdir(current_dir)
    
    return json.dumps({
        "status": "success",
        "message": f"Inventory site generated successfully.",
        "project_path": target_path,
        "entrypoint": os.path.join(target_path, "dist", "index.html"),
        "next_commands": [f"cd {target_path}", "open dist/index.html"]
    })

@mcp.tool()
def scaffold_saas_platform(
    target_path: str,
    client_name: str,
    tagline: str,
    service_type: str,
    domain: str,
    primary_color: str,
    admin_email: str,
    supabase_url: str,
    supabase_anon: str,
    include_waiver: bool = False,
    dev_email: str = "",
    instagram: str = "",
    facebook: str = "",
    force_overwrite: bool = False
) -> str:
    """
    Scaffolds a Next.js + Supabase SaaS booking and membership platform.
    
    Args:
        target_path: Absolute path for the target output folder.
        client_name: Name of the business.
        tagline: Business tagline.
        service_type: E.g., 'Fitness', 'Pilates', 'Salon'.
        domain: Target production domain.
        primary_color: Hex code.
        admin_email: Root administrator email.
        supabase_url: https://your-project.supabase.co
        supabase_anon: anon public key
        force_overwrite: If True, deletes existing directory at target_path.
    """
    
    if os.path.exists(target_path):
        if force_overwrite:
            shutil.rmtree(target_path)
        else:
            return json.dumps({"status": "error", "message": f"Directory {target_path} already exists. Use force_overwrite=True."})
        
    if not os.path.exists(ENGINE_DIR_SAAS):
        return json.dumps({"status": "error", "message": f"Engine directory not found at {ENGINE_DIR_SAAS}"})
        
    shutil.copytree(ENGINE_DIR_SAAS, target_path)
    
    app_prefix = re.sub(r'[^a-z0-9]', '', client_name.lower())
    
    replacements = {
        "{{CLIENT_NAME}}": client_name,
        "{{ADMIN_EMAIL}}": admin_email,
        "{{DEV_EMAIL}}": dev_email or admin_email,
        "{{SUPABASE_URL}}": supabase_url,
        "{{SUPABASE_ANON_KEY}}": supabase_anon,
        "{{SITE_URL}}": f"https://www.{domain}",
        "{{TAGLINE}}": tagline,
        "{{SERVICE_TYPE}}": service_type,
        "{{INSTAGRAM_URL}}": instagram or f"https://www.instagram.com/{domain}",
        "{{FACEBOOK_URL}}": facebook or "#",
        "{{PRIMARY_COLOR}}": primary_color,
        "{{YEAR}}": str(datetime.datetime.now().year),
        "{{APP_PREFIX}}": app_prefix,
    }
    
    if not include_waiver:
        waiver_files = [
            os.path.join(target_path, "frontend", "waiver.html"),
            os.path.join(target_path, "frontend", "js", "waiver.js"),
            os.path.join(target_path, "frontend", "js", "waiver-pdf.js"),
            os.path.join(target_path, "backend", "supabase", "functions", "waiver-reminder"),
        ]
        for f in waiver_files:
            if os.path.isfile(f): os.remove(f)
            elif os.path.isdir(f): shutil.rmtree(f)
            
    text_extensions = {'.html', '.js', '.ts', '.json', '.sql', '.md', '.toml', '.txt', '.xml', '.css'}
    
    for root, dirs, files in os.walk(target_path):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for filename in files:
            filepath = os.path.join(root, filename)
            ext = os.path.splitext(filename)[1].lower()
            if ext not in text_extensions: continue
            try:
                with open(filepath, 'r', encoding='utf-8') as f: content = f.read()
                for token, value in replacements.items(): content = content.replace(token, value)
                with open(filepath, 'w', encoding='utf-8') as f: f.write(content)
            except: pass
            
    env_template = os.path.join(target_path, ".env.template")
    with open(env_template, 'w') as f:
        f.write(f"# {client_name} — Environment Variables\n")
        f.write(f"SUPABASE_URL={supabase_url}\n")
        f.write(f"SUPABASE_ANON_KEY={supabase_anon}\n")
        f.write(f"SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY\n")
        f.write(f"STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY\n")
        f.write(f"STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET\n")
        f.write(f"RESEND_API_KEY=YOUR_RESEND_API_KEY\n")
        f.write(f"ADMIN_EMAIL={admin_email}\n")
        f.write(f"SITE_URL=https://www.{domain}\n")
        
    return json.dumps({
        "status": "success",
        "message": f"SaaS platform generated successfully.",
        "project_path": target_path,
        "env_file": env_template,
        "next_commands": [
            f"cd {target_path}", 
            "cp .env.template .env.local", 
            "supabase db push", 
            "supabase functions deploy --all"
        ]
    })

# ===========================================================================
# Pro dealership tier (corrupt-dealership-pro) — full end-to-end automation.
#
# Unlike the two scaffolders above, the Pro tier is a real Next.js + Supabase
# app, so it is configured by generating a config FILE (not {{TOKEN}} swaps) and
# stood up against live infrastructure via API tokens. Each tool below is one
# idempotent step; `standup_dealership_pro` runs them all in order.
#
# Tokens are read from arguments or the environment (SUPABASE_ACCESS_TOKEN,
# VERCEL_TOKEN) and are NEVER written into committed files. Generated secrets
# (DB password, webhook secret) are returned so the operator can record them.
# ===========================================================================


def _parse_locations(locations_json: str):
    if not locations_json:
        return None
    try:
        locs = json.loads(locations_json)
    except json.JSONDecodeError as e:
        raise ValueError(f"locations_json is not valid JSON: {e}")
    if not isinstance(locs, list):
        raise ValueError('locations_json must be a JSON array of {"id","label"} objects.')
    return locs


def _config_inputs(**kw):
    """Assemble the generate_site_config kwargs from flat tool arguments."""
    return dict(
        brand_name=kw["brand_name"],
        contact_phone=kw["contact_phone"],
        contact_email=kw["contact_email"],
        address_street=kw["address_street"],
        address_city=kw["address_city"],
        address_state=kw["address_state"],
        address_zip=kw["address_zip"],
        domain=kw["domain"],
        legal_suffix=kw.get("legal_suffix", "LLC"),
        legal_name=kw.get("legal_name", ""),
        tagline=kw.get("tagline", "Premium Showroom & Flexible Financing"),
        founded_year=kw.get("founded_year", 0),
        site_url=kw.get("site_url", ""),
        phone_display=kw.get("phone_display", ""),
        facebook_url=kw.get("facebook_url", ""),
        locations=_parse_locations(kw.get("locations_json", "")),
    )


@mcp.tool()
def scaffold_dealership_pro(
    target_path: str,
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
    locations_json: str = "",
    supabase_url: str = "",
    supabase_anon_key: str = "",
    supabase_db_url: str = "",
    force: bool = False,
) -> str:
    """
    Copy the Pro dealership template to target_path (outside the repo) and
    generate src/config/site.ts from these inputs. No infrastructure is touched.

    Args:
        target_path: Absolute path OUTSIDE this repo for the generated site.
        brand_name: Display brand (e.g. "Acme Motors").
        contact_phone: Phone; digits are extracted for tel: links.
        domain: Bare domain, no protocol (e.g. "example.com").
        locations_json: JSON array of lots, e.g.
            '[{"id":"main","label":"Main Lot"},{"id":"north","label":"North Valley"}]'.
            Location ids must be lowercase/hyphen/underscore. Defaults to a
            single "main" lot.
        supabase_url / supabase_anon_key / supabase_db_url: If provided, written
            to .env.local. Usually you provision Supabase first and let that step
            write these instead.
        force: If True, replaces an existing non-empty target_path.
    """
    try:
        inputs = _config_inputs(
            brand_name=brand_name, contact_phone=contact_phone, contact_email=contact_email,
            address_street=address_street, address_city=address_city, address_state=address_state,
            address_zip=address_zip, domain=domain, legal_suffix=legal_suffix, legal_name=legal_name,
            tagline=tagline, founded_year=founded_year, site_url=site_url,
            phone_display=phone_display, facebook_url=facebook_url, locations_json=locations_json,
        )
        result = pro.scaffold_pro(
            target_path, inputs, supabase_url=supabase_url,
            supabase_anon_key=supabase_anon_key, supabase_db_url=supabase_db_url, force=force,
        )
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


@mcp.tool()
def provision_supabase_dealership_pro(
    project_name: str,
    super_admin_email: str,
    access_token: str = "",
    existing_ref: str = "",
    db_password: str = "",
    region: str = "us-east-1",
    organization_slug: str = "",
    organization_id: str = "",
    plan: str = "",
    instance_size: str = "",
    resend_api_key: str = "",
    webhook_secret: str = "",
    notification_to_emails: str = "",
    notification_sender_email: str = "",
    notification_brand_name: str = "",
    target_path: str = "",
) -> str:
    """
    Create a Supabase project (or use existing_ref), apply the baseline schema,
    seed the first super admin, and set the Vault + edge-function secrets.

    Needs a Supabase personal access token (starts with `sbp_`) via access_token
    or $SUPABASE_ACCESS_TOKEN. Applying the schema against a fresh project is the
    real first test of the baseline — any Postgres error is surfaced verbatim.

    Idempotent: the schema is applied at most once (gated by a marker table), and
    re-running with existing_ref re-seeds the admin + secrets without touching it.
    If a step fails AFTER the project was created, the error names the ref and how
    to resume — re-run with existing_ref=<that ref> so no duplicate is created.

    Args:
        project_name: Name for the new Supabase project.
        super_admin_email: Seeded into authorized_admins with is_super_admin=true.
            Until this exists, no one can log into the admin portal.
        existing_ref: Reuse an existing project ref instead of creating one.
        db_password: DB password; generated (and returned) if omitted.
        region: Supabase region (default us-east-1).
        resend_api_key: Resend key for lead-notification email. If omitted, the
            site works but lead emails are skipped until you set it.
        webhook_secret: Shared secret used for BOTH the Vault secret the trigger
            sends and the edge function's WEBHOOK_SECRET. Generated if omitted;
            on an existing_ref re-run the current value is reused, not rotated.
        target_path: If given, .env.local in that scaffold is updated with the
            project URL, anon key, and pooler DB URL.

    Returns JSON including ref, project_url, anon_key, db_password,
    supabase_db_url, and webhook_secret — RECORD db_password and webhook_secret;
    Supabase cannot show them again.
    """
    lines = []
    try:
        result = pro.provision_supabase(
            access_token=access_token, project_name=project_name,
            super_admin_email=super_admin_email, existing_ref=existing_ref,
            db_password=db_password, region=region, organization_slug=organization_slug,
            organization_id=organization_id, plan=plan, instance_size=instance_size,
            resend_api_key=resend_api_key, webhook_secret=webhook_secret,
            notification_to_emails=notification_to_emails,
            notification_sender_email=notification_sender_email,
            notification_brand_name=notification_brand_name, target_path=target_path,
            log=lines.append,
        )
        result["log"] = lines
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e), "log": lines})


@mcp.tool()
def deploy_function_dealership_pro(
    ref: str,
    access_token: str = "",
    function_dir: str = "",
    slug: str = "send-credit-app-notification",
    verify_jwt: bool = False,
) -> str:
    """
    Deploy the lead-notification edge function to a Supabase project via the
    Management API (Supabase bundles server-side — no local Deno/CLI needed).

    The database webhook itself is the AFTER INSERT trigger built by the baseline
    schema, so nothing else needs wiring — just make the function live and ensure
    its secrets are set (done by provision_supabase_dealership_pro).

    Args:
        ref: Supabase project ref.
        function_dir: Source dir; defaults to the template's
            supabase/functions/send-credit-app-notification.
        verify_jwt: Whether the gateway JWT-verifies callers. Default False on
            purpose: the only caller is the DB trigger, which sends the project's
            browser key — and on projects created since Nov 2025 that key is a
            *publishable* key, not a JWT, so verify_jwt=True would 401 the
            trigger's fire-and-forget call and silently kill lead emails. The
            function's own fail-closed X-Webhook-Secret check is the real gate.
    """
    try:
        result = pro.deploy_function(
            access_token=access_token, ref=ref,
            function_dir=function_dir or pro.DEFAULT_FUNCTION_DIR,
            slug=slug, verify_jwt=verify_jwt,
        )
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


@mcp.tool()
def deploy_vercel_dealership_pro(
    target_path: str,
    supabase_url: str,
    supabase_anon_key: str,
    vercel_token: str = "",
    project_name: str = "",
    team_id: str = "",
    prod: bool = True,
) -> str:
    """
    Create (or reuse) a Vercel project, wire the two NEXT_PUBLIC_SUPABASE_* env
    vars, and deploy the scaffolded site. Needs the `vercel` CLI on PATH and a
    token via vercel_token or $VERCEL_TOKEN.

    Args:
        target_path: The scaffolded site directory to deploy.
        supabase_url / supabase_anon_key: Wired as Vercel env vars (all envs).
        project_name: Vercel project name; defaults to the target dir basename.
        team_id: Vercel team/scope id (omit for a personal account).
    """
    try:
        result = pro.deploy_vercel(
            vercel_token=vercel_token, target_path=target_path, project_name=project_name,
            team_id=team_id, supabase_url=supabase_url, supabase_anon_key=supabase_anon_key,
            prod=prod,
        )
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


@mcp.tool()
def verify_dealership_pro(
    ref: str,
    target_path: str,
    access_token: str = "",
    db_password: str = "",
    supabase_db_url: str = "",
    admin_email: str = "rls-regression-admin@corrupt.invalid",
    super_email: str = "rls-regression-super@corrupt.invalid",
) -> str:
    """
    Run supabase/tests/rls_regression.sh against the project as the final
    security gate. Seeds two throwaway admin identities, runs the suite, then
    removes them (the client's admin list is left untouched). Needs psql + bash.

    Provide either supabase_db_url (a Session Pooler URI) or db_password (the
    pooler URI is then fetched + built for you).
    """
    try:
        result = pro.verify(
            access_token=access_token, ref=ref, db_password=db_password,
            supabase_db_url=supabase_db_url, target_path=target_path,
            admin_email=admin_email, super_email=super_email,
        )
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


@mcp.tool()
def standup_dealership_pro(
    target_path: str,
    brand_name: str,
    contact_phone: str,
    contact_email: str,
    address_street: str,
    address_city: str,
    address_state: str,
    address_zip: str,
    domain: str,
    super_admin_email: str,
    supabase_access_token: str = "",
    vercel_token: str = "",
    project_name: str = "",
    region: str = "us-east-1",
    organization_slug: str = "",
    organization_id: str = "",
    plan: str = "",
    instance_size: str = "",
    resend_api_key: str = "",
    notification_to_emails: str = "",
    notification_sender_email: str = "",
    notification_brand_name: str = "",
    team_id: str = "",
    legal_suffix: str = "LLC",
    legal_name: str = "",
    tagline: str = "Premium Showroom & Flexible Financing",
    founded_year: int = 0,
    facebook_url: str = "",
    locations_json: str = "",
    force: bool = False,
    run_verify: bool = True,
) -> str:
    """
    Full end-to-end Pro-tier stand-up from one call:
      scaffold -> provision Supabase -> deploy edge function -> deploy Vercel -> verify.

    Needs a Supabase PAT ($SUPABASE_ACCESS_TOKEN or supabase_access_token) and a
    Vercel token ($VERCEL_TOKEN or vercel_token). Returns each step's result plus
    a summary with the live site URL, the Supabase ref, and the generated
    db_password + webhook_secret (RECORD THESE — they can't be shown again).

    If run_verify is True and the RLS regression suite fails, the pipeline stops
    and returns status "verify_failed" with the suite output.
    """
    lines = []
    try:
        inputs = _config_inputs(
            brand_name=brand_name, contact_phone=contact_phone, contact_email=contact_email,
            address_street=address_street, address_city=address_city, address_state=address_state,
            address_zip=address_zip, domain=domain, legal_suffix=legal_suffix, legal_name=legal_name,
            tagline=tagline, founded_year=founded_year, facebook_url=facebook_url,
            locations_json=locations_json,
        )
        result = pro.standup(
            config_inputs=inputs, target_path=target_path,
            supabase_access_token=supabase_access_token, vercel_token=vercel_token,
            project_name=project_name, super_admin_email=super_admin_email, region=region,
            organization_slug=organization_slug, organization_id=organization_id, plan=plan,
            instance_size=instance_size, resend_api_key=resend_api_key,
            notification_to_emails=notification_to_emails,
            notification_sender_email=notification_sender_email,
            notification_brand_name=notification_brand_name, team_id=team_id,
            force=force, run_verify=run_verify, log=lines.append,
        )
        result["log"] = lines
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e), "log": lines})


if __name__ == "__main__":
    mcp.run()