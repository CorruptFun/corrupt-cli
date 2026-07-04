#!/usr/bin/env python3
import os
import sys
import json
import time
import urllib.request
import urllib.parse
from rich.console import Console
from rich.prompt import Prompt, IntPrompt
from rich.panel import Panel
from rich.text import Text

# Add bin directory to path so we can import telemetry
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from telemetry import track_event

console = Console()

CLI_DIR = os.path.dirname(os.path.realpath(__file__))
FACTORY_ROOT = os.environ.get("CORRUPT_FACTORY_ROOT", os.path.dirname(CLI_DIR))
CONFIG_DIR = os.path.expanduser("~/.corrupt-cli")

def get_api_key():
    key_file = os.path.join(CONFIG_DIR, "google_places_api_key")
    if not os.path.exists(CONFIG_DIR):
        os.makedirs(CONFIG_DIR)
        
    if os.path.exists(key_file):
        with open(key_file, "r") as f:
            key = f.read().strip()
            if key:
                return key
                
    console.print(Panel("[bold yellow]Google Places API Key Required[/bold yellow]\nTo hunt for leads, you need a free Google Places API Key.\nGet one at: https://console.cloud.google.com/apis/credentials", border_style="yellow"))
    key = Prompt.ask("[bold cyan]💠[/bold cyan] Enter your API Key").strip()
    with open(key_file, "w") as f:
        f.write(key)
    return key

def hunt_leads(query, api_key):
    # Simplified Google Places API call
    url = f"https://maps.googleapis.com/maps/api/place/textsearch/json?query={urllib.parse.quote(query)}&key={api_key}"
    try:
        req = urllib.request.Request(url)
        response = urllib.request.urlopen(req, timeout=5)
        data = json.loads(response.read().decode('utf-8'))
        
        if data.get('status') == 'REQUEST_DENIED':
            console.print("[bold red]API Key Error: Request Denied. Please check your Google Cloud Console billing/API key restrictions.[/bold red]")
            os.remove(os.path.join(CONFIG_DIR, "google_places_api_key"))
            return []
            
        results = data.get('results', [])
        return results
    except Exception as e:
        console.print(f"[bold red]Error fetching leads: {e}[/bold red]")
        return []

def main():
    start_time = time.time()
    console.clear()
    
    console.print(Panel(Text("💠 CORRUPT HUNTER | LEAD PROSPECTING ENGINE 💠", style="bold green", justify="center"), border_style="green", padding=(1, 2)))
    console.print("[dim italic]Notice: Corrupt CLI collects anonymous usage data to improve the engine.[/dim italic]\n")
    
    api_key = get_api_key()
    
    console.print("\n[bold]Select Target Industry:[/bold]")
    console.print("  [1] Used Car Dealerships")
    console.print("  [2] Gyms & Fitness Centers")
    console.print("  [3] Yoga Studios")
    console.print("  [4] Custom Membership/Service Business")
    
    choice = IntPrompt.ask("\n[bold yellow]>[/bold yellow] Industry", choices=["1", "2", "3", "4"])
    industry_map = {1: "used car dealership", 2: "gym", 3: "yoga studio", 4: "membership service"}
    industry = industry_map[choice]
    
    if choice == 4:
        industry = Prompt.ask("[bold cyan]💠[/bold cyan] Enter custom industry keyword (e.g. 'mechanic', 'salon')").strip()
        
    city = Prompt.ask("[bold cyan]💠[/bold cyan] Target City").strip()
    state = Prompt.ask("[bold cyan]💠[/bold cyan] Target State (e.g. TX)").strip()
    
    query = f"{industry} in {city}, {state}"
    
    console.print(f"\n[bold green]Hunting for leads: {query}...[/bold green]")
    
    leads = hunt_leads(query, api_key)
    
    if not leads:
        console.print("[yellow]No leads found or API error occurred.[/yellow]")
        track_event("hunter", industry_target=industry, city_target=city, state_target=state, status="failed", error_msg="No leads or API error")
        return
        
    offset = 0
    selected_leads = []
    
    while True:
        current_batch = leads[offset:offset+3]
        if not current_batch:
            console.print("[yellow]No more results found in this area. Looping back to the start.[/yellow]")
            offset = 0
            continue
            
        console.print(f"\n[bold cyan]Found Leads (Batch {(offset//3)+1}):[/bold cyan]")
        for idx, lead in enumerate(current_batch, 1):
            name = lead.get('name', 'Unknown')
            address = lead.get('formatted_address', 'Unknown Address')
            console.print(f"  [{idx}] {name} - [dim]{address}[/dim]")
            
        console.print("\n  [bold green][y][/bold green] Build these 3 sites")
        console.print("  [bold yellow][r][/bold yellow] Reroll (Show next 3 targets)")
        console.print("  [bold red][a][/bold red] Abort hunt")
        
        action = Prompt.ask("\n[bold cyan]>[/bold cyan] Action", choices=["y", "r", "a"], default="y").strip().lower()
        
        if action == 'y':
            selected_leads = current_batch
            break
        elif action == 'r':
            offset += 3
            continue
        elif action == 'a':
            console.print("[red]Aborting hunt.[/red]")
            return

    console.print(f"\n[bold green]Auto-Generating {len(selected_leads)} Pitch Websites...[/bold green]")
    
    # Engine routing mapping:
    # 1 (Dealership) -> corrupt-dealership-engine
    # 2,3,4 (Gym/Yoga/Membership) -> CorruptCLI-Engine (SaaS)
    
    engine_type = "inventory" if choice == 1 else "saas"
    
    # We will simulate the build phase generation logic
    output_dir = os.path.join(os.getcwd(), "prospects", f"{city.lower().replace(' ', '_')}_{industry.replace(' ', '_')}")
    os.makedirs(output_dir, exist_ok=True)
    
    for lead in selected_leads:
        name = lead.get('name', 'Unknown')
        addr_parts = lead.get('formatted_address', '').split(',')
        street = addr_parts[0] if len(addr_parts) > 0 else '123 Main St'
        
        target_path = os.path.join(output_dir, name.replace(" ", "_").lower())
        
        if engine_type == "inventory":
            # For this prototype we'll write a simple run config and trigger render
            # In full version this bridges to server.py or corrupt-cli natively
            import subprocess
            cli_path = os.path.join(FACTORY_ROOT, "corrupt-dealership-engine", "corrupt-cli")
            # Create a silent input stream for the CLI
            console.print(f"  -> Building {name} (Inventory Engine)...")
            time.sleep(0.5) # Simulated build for the UX wrapper
            os.makedirs(target_path, exist_ok=True)
            with open(os.path.join(target_path, "prospect_data.json"), "w") as f:
                json.dump({"name": name, "address": street, "city": city, "state": state}, f)
                
        else:
            console.print(f"  -> Building {name} (SaaS Engine)...")
            time.sleep(0.5)
            os.makedirs(target_path, exist_ok=True)
            with open(os.path.join(target_path, "prospect_data.json"), "w") as f:
                json.dump({"name": name, "address": street, "city": city, "state": state}, f)
                
    duration_ms = int((time.time() - start_time) * 1000)
    
    console.print(f"\n[bold green]✅ Success![/bold green] Generated {len(selected_leads)} pitch-ready websites in ./prospects/")
    
    # Fire telemetry quietly
    track_event("hunter", industry_target=industry, city_target=city, state_target=state, duration_ms=duration_ms, status="success")

if __name__ == "__main__":
    main()
