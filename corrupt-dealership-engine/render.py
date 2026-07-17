#!/usr/bin/env python3
import json
import os
import re
import sys

def apply_conditional(text, flag_name, enabled):
    """Keep or strip a {% if FLAG %}...{% endif %} block.

    Each flag is matched by name, so blocks stay independent of one another.
    """
    pattern = re.compile(
        r"\{%\s*if\s+" + re.escape(flag_name) + r"\s*%\}(.*?)\{%\s*endif\s*%\}",
        re.DOTALL,
    )
    return pattern.sub((lambda m: m.group(1)) if enabled else "", text)

def main():
    # Directories
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Files
    config_path = os.path.join(base_dir, 'config.json')
    if not os.path.exists(config_path):
        config_path = os.path.join(base_dir, 'config.example.json')
        
    inventory_path = os.path.join(base_dir, 'inventory.json')
    template_path = os.path.join(base_dir, 'template.html')
    output_path = os.path.join(base_dir, 'dist', 'index.html')
    
    # Verify files
    if not os.path.exists(template_path):
        print(f"Error: template.html not found at {template_path}")
        sys.exit(1)
    if not os.path.exists(inventory_path):
        print(f"Error: inventory.json not found at {inventory_path}")
        sys.exit(1)
        
    # Create dist folder if it doesn't exist
    os.makedirs(os.path.join(base_dir, 'dist'), exist_ok=True)
    
    # Load config and inventory
    with open(config_path, 'r') as f:
        config = json.load(f)
        
    with open(inventory_path, 'r') as f:
        inventory = json.load(f)
        
    with open(template_path, 'r') as f:
        template = f.read()
        
    print(f"Compiling template using config: {config['dealership']['name']}")
    
    # Generate Inventory Cards HTML
    cards_html = []
    for car in inventory:
        is_sold = car.get("status") == "sold"
        price_val = car.get("price", 0)
        price_str = f"${price_val:,.0f}" if price_val > 0 else "---"
        
        # Build features bullets
        features_html = ""
        for f in car.get("features", []):
            features_html += f"                            <div>• {f}</div>\n"
            
        # Class stylings based on status
        sold_overlay = "filter grayscale-[40%]" if is_sold else ""
        sold_opacity = "opacity-60" if is_sold else ""
        # Accept either "badge" (string) or "badges" (list)
        badges = car.get("badges") or []
        listing_badge = car.get("badge") or (badges[0] if badges else "Great Value")
        sold_badge = "Just Sold" if is_sold else listing_badge
        badge_bg = "bg-zinc-800 text-zinc-400" if is_sold else "bg-primary badge-shadow"

        # Optional fields: omit the element entirely rather than printing "None"
        specs_highlight = car.get("specs_highlight") or ""
        specs_html = (
            f'<div class="absolute bottom-4 right-4 bg-black/80 backdrop-blur-sm text-primary '
            f'text-xs font-black px-3 py-1 rounded">{specs_highlight}</div>'
        ) if specs_highlight else ""

        description = car.get("description") or ""
        description_html = (
            f'<p class="text-zinc-400 text-sm mb-4">{description}</p>'
        ) if description else ""

        payment_est = car.get("payment_est") or ""
        payment_html = (
            f'<span class="block text-[10px] text-zinc-500 mt-0.5">{payment_est}</span>'
        ) if payment_est else ""
        
        if is_sold:
            action_button = '<button disabled class="text-xs font-bold bg-zinc-900 text-zinc-600 px-5 py-2.5 rounded-lg cursor-not-allowed uppercase tracking-wider">Sold</button>'
        else:
            action_button = f'<a href="tel:{config["dealership"]["phone"]}" class="text-xs font-bold bg-primary text-white px-5 py-2.5 rounded-lg hover:bg-primary-hover transition-colors uppercase tracking-wider">Inquire</a>'
            
        card_layout = f"""
            <!-- Dynamic Car Card: {car.get('year')} {car.get('make')} {car.get('model')} -->
            <div class="car-card bg-zinc-950 rounded-xl overflow-hidden flex flex-col justify-between {'opacity-80 border-dashed border-zinc-800' if is_sold else ''}">
                <div>
                    <div class="relative h-52 overflow-hidden bg-zinc-900">
                        <img src="{car.get('main_image')}" alt="{car.get('year')} {car.get('make')} {car.get('model')}" class="w-full h-full object-cover {sold_overlay}">
                        <div class="absolute top-4 left-4 {badge_bg} text-[10px] font-black px-3 py-1 rounded uppercase tracking-wider">{sold_badge}</div>
                        {specs_html}
                    </div>
                    <div class="p-6 {sold_opacity}">
                        <div class="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1">{car.get('mileage', 0):,} Miles • {car.get('trim', '')}</div>
                        <h3 class="text-xl font-bold text-white mb-2">{car.get('year')} {car.get('make')} {car.get('model')}</h3>
                        {description_html}
                        <div class="grid grid-cols-2 gap-2 text-[11px] text-zinc-500 border-t border-zinc-900 pt-4 mb-4">
{features_html}                        </div>
                    </div>
                </div>
                <div class="p-6 pt-0 border-t border-zinc-900/40">
                    <div class="flex justify-between items-baseline pt-4">
                        <div>
                            <span class="text-2xl font-black text-white">{price_str}</span>
                            {payment_html}
                        </div>
                        {action_button}
                    </div>
                </div>
            </div>"""
        cards_html.append(card_layout)
        
    combined_cards = "\n".join(cards_html)
    
    # Create Badge Select Options for Admin Modal
    badge_options_html = ""
    for badge in config.get("default_badges", []):
        badge_options_html += f'                            <option value="{badge}">{badge}</option>\n'
        

    # Replace templates values
    rendered = template
    
    # Logo & Metadata Logic
    logo_url = config.get("branding", {}).get("logo_url", "")
    if logo_url:
        meta_html = f'<link rel="icon" href="{logo_url}">\n    <meta property="og:image" content="{logo_url}">'
        brand_html = f'<img src="{logo_url}" alt="{config["dealership"]["name"]} Logo" class="h-10 md:h-12 w-auto object-contain">'
    else:
        meta_html = ''
        brand_html = f'<div class="text-2xl md:text-3xl font-black italic tracking-tighter text-primary">{config["dealership"]["name"]}</div>'

    rendered = rendered.replace("<!-- FAVICON_AND_META_PLACEHOLDER -->", meta_html)
    rendered = rendered.replace("<!-- BRAND_LOGO_PLACEHOLDER -->", brand_html)
    
    rendered = rendered.replace("{{DEALERSHIP_NAME}}", config["dealership"]["name"])
    rendered = rendered.replace("{{DEALERSHIP_SUFFIX}}", config["dealership"].get("suffix", ""))
    rendered = rendered.replace("{{ABOUT_US}}", config["dealership"].get("about_us", f"Welcome to {config['dealership']['name']}."))
    rendered = rendered.replace("{{LOCATION}}", config["dealership"]["location"])
    rendered = rendered.replace("{{ADDRESS}}", config["dealership"]["address"])
    rendered = rendered.replace("{{PHONE_RAW}}", config["dealership"]["phone"])
    rendered = rendered.replace("{{PHONE_FORMATTED}}", config["dealership"]["phone_formatted"])
    rendered = rendered.replace("{{EMAIL}}", config["dealership"]["email"])
    # Where the financing form POSTs its leads. Empty => the form falls back to the
    # visitor's mail client rather than dropping the lead.
    rendered = rendered.replace("{{LEAD_ENDPOINT}}", config.get("leads", {}).get("endpoint", ""))
    rendered = rendered.replace("{{FACEBOOK_URL}}", config["dealership"]["facebook_url"])
    rendered = rendered.replace("{{MAP_QUERY}}", config["dealership"]["map_query"])
    rendered = rendered.replace("{{HERO_TITLE_1}}", config["dealership"]["tagline"].split(".")[0] + ".")
    rendered = rendered.replace("{{HERO_TITLE_2}}", config["dealership"]["tagline"].split(".")[1].strip() if len(config["dealership"]["tagline"].split(".")) > 1 else "")
    rendered = rendered.replace("{{HERO_SUBTITLE}}", config["dealership"]["sub_tagline"])
    
    # Branding
    rendered = rendered.replace("{{PRIMARY_COLOR}}", config["branding"]["primary_color"])
    rendered = rendered.replace("{{PRIMARY_COLOR_HOVER}}", config["branding"]["primary_color_hover"])
    
    # Conditional blocks.
    # bhph_enabled is opt-in: in-house/all-credit messaging only renders when the
    # dealer has explicitly confirmed it applies to them. Absolute claims
    # ("guaranteed approval", "no credit required") are never shipped in either mode,
    # and specific credit terms are avoided — they are triggering terms under
    # Reg Z 1026.24(d) and would require disclosures this template does not make.
    bhph = bool(config.get("financing", {}).get("bhph_enabled", False))
    rendered = apply_conditional(rendered, "SE_HABLA_ESPANOL", config["dealership"].get("se_habla_espanol", False))
    rendered = apply_conditional(rendered, "BHPH", bhph)
    rendered = apply_conditional(rendered, "STANDARD_FINANCING", not bhph)
        
    # Array variables
    whitelisted_emails_js = json.dumps(config["auth"]["whitelisted_emails"])
    rendered = rendered.replace("{{WHITELISTED_ADMINS_JS}}", whitelisted_emails_js)
    
    # Placeholders
    rendered = rendered.replace("<!-- INVENTORY_CARDS_PLACEHOLDER -->", combined_cards)
    rendered = rendered.replace("<!-- BADGE_OPTIONS_PLACEHOLDER -->", badge_options_html)
    
    # Write output index.html
    with open(output_path, 'w') as f:
        f.write(rendered)
        
    print(f"Showroom Compiled Successfully! Saved to {output_path}")

if __name__ == '__main__':
    main()
