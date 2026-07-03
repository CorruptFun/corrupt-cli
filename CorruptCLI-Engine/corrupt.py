import os
import shutil
import re
import json
import uuid

TOKENS = {
    "{{CLIENT_NAME}}": "The display name of the business (e.g., 'Acme Fitness')",
    "{{ADMIN_EMAIL}}": "Primary admin email for login and notifications",
    "{{DEV_EMAIL}}": "Secondary developer/owner email for admin access",
    "{{SUPABASE_URL}}": "Supabase project URL (e.g., https://xxxx.supabase.co)",
    "{{SUPABASE_ANON_KEY}}": "Supabase public anon key",
    "{{SITE_URL}}": "Production site URL (e.g., https://www.example.com)",
    "{{TAGLINE}}": "Business tagline (e.g., 'Empowering the Human Body')",
    "{{SERVICE_TYPE}}": "Type of service offered (e.g., 'Pilates', 'Yoga', 'CrossFit')",
    "{{INSTAGRAM_URL}}": "Instagram profile URL",
    "{{FACEBOOK_URL}}": "Facebook page URL",
    "{{PRIMARY_COLOR}}": "Primary brand color hex code (e.g., '#D4AF37')",
    "{{YEAR}}": "Current year for copyright",
    "{{APP_PREFIX}}": "localStorage key prefix (lowercase, no spaces)",
}

from rich.console import Console
from rich.prompt import Prompt
from rich.panel import Panel
from rich.text import Text

console = Console()

def get_input(prompt_text, default=""):
    return Prompt.ask(f"[bold cyan]💠[/bold cyan] {prompt_text}", default=default, console=console)

def corrupt_init():
    console.clear()
    title = Text("💠 CORRUPT SOLUTIONS | SAAS ENGINE INITIALIZER v2 💠", style="bold magenta", justify="center")
    console.print(Panel(title, border_style="magenta", padding=(1, 2)))
    
    # 1. Project Identity
    console.print("\n[bold magenta][1/5][/bold magenta] [bold]IDENTITY & BRANDING[/bold]")
    client_name = get_input("Client/Business Name", "Acme Fitness")
    tagline = get_input("Tagline", "Empowering the Human Body")
    service_type = get_input("Service Type (e.g., Pilates, Yoga, CrossFit)", "Fitness")
    domain = get_input("Production Domain (e.g., example.com)", "example.com")
    primary_color = get_input("Primary Brand Color (Hex)", "#D4AF37")
    app_prefix = re.sub(r'[^a-z0-9]', '', client_name.lower())
    
    # 2. Admin Access
    console.print("\n[bold magenta][2/5][/bold magenta] [bold]ADMIN ACCESS[/bold]")
    admin_email = get_input("Admin Email (for OTP login)", f"admin@{domain}")
    dev_email = get_input("Dev/Owner Email (secondary admin)", "")
    
    # 3. Social Media
    console.print("\n[bold magenta][3/5][/bold magenta] [bold]SOCIAL MEDIA[/bold] [dim](leave blank to skip)[/dim]")
    instagram = get_input("Instagram URL", "")
    facebook = get_input("Facebook URL", "")
    
    # 4. Infrastructure
    console.print("\n[bold magenta][4/5][/bold magenta] [bold]SUPABASE CONFIGURATION[/bold]")
    supabase_url = get_input("Supabase Project URL", "YOUR_SUPABASE_URL")
    supabase_anon = get_input("Supabase Anon Key", "YOUR_SUPABASE_ANON_KEY")
    
    # 5. Optional Features
    console.print("\n[bold magenta][5/5][/bold magenta] [bold]OPTIONAL FEATURES[/bold]")
    include_waiver = get_input("Include Liability Waiver system? (y/n)", "n").lower() == 'y'
    
    # Build replacement map
    import datetime
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
    
    # Scaffolding
    safe_name = re.sub(r'[^a-z0-9]', '-', client_name.lower())
    target_dir = f"projects/clients/{safe_name}"
    
    if os.path.exists(target_dir):
        confirm = Prompt.ask(f"[bold yellow]⚠️[/bold yellow] Directory {target_dir} already exists. Overwrite? (y/n)", default="n", console=console)
        if confirm.lower() != 'y':
            console.print("[bold red]Aborted.[/bold red]")
            return
        shutil.rmtree(target_dir)
    
    console.print(f"\n[bold cyan]🚀 Creating {target_dir}...[/bold cyan]")
    base_engine = "engine"
    
    if not os.path.exists(base_engine):
        console.print(f"[bold red]❌ Engine directory '{base_engine}' not found. Aborting.[/bold red]")
        return
    
    # Copy engine to target
    shutil.copytree(base_engine, target_dir)
    
    # Remove waiver files if not wanted
    if not include_waiver:
        waiver_files = [
            os.path.join(target_dir, "frontend", "waiver.html"),
            os.path.join(target_dir, "frontend", "js", "waiver.js"),
            os.path.join(target_dir, "frontend", "js", "waiver-pdf.js"),
            os.path.join(target_dir, "backend", "supabase", "functions", "waiver-reminder"),
        ]
        for f in waiver_files:
            if os.path.isfile(f):
                os.remove(f)
                console.print(f"   [yellow]🗑️[/yellow]  Removed optional: {os.path.basename(f)}")
            elif os.path.isdir(f):
                shutil.rmtree(f)
                console.print(f"   [yellow]🗑️[/yellow]  Removed optional: {os.path.basename(f)}/")
    
    # Find and replace all tokens
    replaced_count = 0
    file_count = 0
    text_extensions = {'.html', '.js', '.ts', '.json', '.sql', '.md', '.toml', '.txt', '.xml', '.css'}
    
    for root, dirs, files in os.walk(target_dir):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        
        for filename in files:
            filepath = os.path.join(root, filename)
            ext = os.path.splitext(filename)[1].lower()
            
            if ext not in text_extensions:
                continue
            
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original = content
                for token, value in replacements.items():
                    content = content.replace(token, value)
                
                if content != original:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(content)
                    replaced_count += content.count(client_name)  # rough count
                    file_count += 1
                    
            except (UnicodeDecodeError, IOError):
                continue
    
    # Generate .env.template
    env_template = os.path.join(target_dir, ".env.template")
    with open(env_template, 'w') as f:
        f.write(f"# {client_name} — Environment Variables\n")
        f.write(f"# Generated by CorruptCLI Engine\n\n")
        f.write(f"SUPABASE_URL={supabase_url}\n")
        f.write(f"SUPABASE_ANON_KEY={supabase_anon}\n")
        f.write(f"SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY\n")
        f.write(f"STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY\n")
        f.write(f"STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET\n")
        f.write(f"RESEND_API_KEY=YOUR_RESEND_API_KEY\n")
        f.write(f"ADMIN_EMAIL={admin_email}\n")
        f.write(f"SITE_URL=https://www.{domain}\n")
    
    # Summary
    console.print(f"\n[bold green]✅ PROJECT CREATED: {target_dir}[/bold green]")
    console.print(f"   [cyan]📁[/cyan] Files processed: {file_count}")
    console.print(f"   [cyan]🔄[/cyan] Tokens replaced across all files")
    console.print(f"   [cyan]📋[/cyan] .env.template generated")
    if not include_waiver:
        console.print(f"   [cyan]⚖️[/cyan]  Waiver system: [yellow]REMOVED[/yellow] (optional)")
    else:
        console.print(f"   [cyan]⚖️[/cyan]  Waiver system: [green]INCLUDED[/green] (add your legal text)")
    console.print(f"\n[bold yellow]💡 Next Steps:[/bold yellow]")
    console.print(f"   1. [bold]cd {target_dir}[/bold]")
    console.print(f"   2. Copy .env.template → .env.local and fill in secrets")
    console.print(f"   3. Run: [bold cyan]python3 ../../validate.py[/bold cyan]")
    console.print(f"   4. Deploy frontend to Vercel")
    console.print(f"   5. Deploy edge functions: [bold cyan]supabase functions deploy --all[/bold cyan]")
    console.print(f"   6. Push migrations: [bold cyan]supabase db push[/bold cyan]\n")

if __name__ == "__main__":
    corrupt_init()
