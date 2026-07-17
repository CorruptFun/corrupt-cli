from mcp.server.fastmcp import FastMCP
import os
import shutil
import re
import json
import datetime

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

if __name__ == "__main__":
    mcp.run()