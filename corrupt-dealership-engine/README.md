# CORRUPT DEALERSHIP ENGINE (CDE) v1.0.0
### High-Performance Headless Showroom & Inventory Sales Funnel

This repository is a decoupled, plug-and-play dealership template and automated rendering engine. It was built as a generic local-service template but engineered from the ground up for strict multi-tenant modularity, allowing fast deployment for any automotive, heavy-machinery, or offroad vehicle distributor under the **CorruptCLI** SaaS ecosystem.

---

## 📂 PROJECT STRUCTURE
```text
corrupt-dealership-engine/
├── config.example.json   # Base configuration (Branding, Colors, Auth, Metadata)
├── inventory.json        # Live vehicle inventory database array
├── template.html         # Parameterized HTML/JS master source mockup
├── render.py             # Compiler script (processes template -> dist/index.html)
├── schema.sql            # Supabase Postgres schema with triggers, whitelists, & RLS
└── dist/
    └── index.html        # Compiled, production-ready, ultra-optimized static page
```

---

## 🛠️ ARCHITECTURAL COMPONENTS

### 1. The Configuration Layer (`config.example.json`)
Allows instant rebranding by changing clean JSON variables:
*   **branding**: Tailwind hex colors (`primary_color`, `primary_color_hover`) injected directly into CSS custom variables.
*   **dealership**: Addresses, raw/formatted phone numbers, map queries, Facebook URLs, and language toggles (`se_habla_espanol`).
*   **auth**: Access lists of authorized admins (`whitelisted_emails`) to drive zero-trust portal security.

### 2. The Data Layer (`inventory.json`)
Structured array of vehicle cards capturing status (`available`, `pending`, `sold`), prices, mileage, specs, custom promo badges, high-res photos, and multi-bullet features.

### 3. The PostgreSQL Schema (`schema.sql`)
A complete Supabase schema blueprint optimized for low-friction hosting:
*   `vehicles`: Holds physical asset specs. Integrates with daily outbound DMS FTP feeds.
*   `leads`: Tracks incoming digital pre-approvals (name, phone, income range, preferred car type) without hard credit pulls.
*   `whitelisted_admins`: Zero-trust email access controls matching edge-function auth structures.
*   **Security Policies (RLS)**: Public select access for inventory; strict whitelisted admin access for configuration mutation and leads extraction.

### 4. The Compiler (`render.py`)
A standalone Python script that reads the configuration and inventory parameters, dynamically compiles grid structures, formats currencies and grayscale "sold" states, replaces template interpolation tags, and compiles the production layout to `dist/index.html`.

---

## 🚀 HOW TO DEPLOY / RUN
To generate a brand new compiled site after updating configurations or inventory:

1. Copy `config.example.json` to `config.json` and adjust the variables for the target dealer.
2. Update the `inventory.json` with the dealer's active stock.
3. Run the compiler script:
   ```bash
   python3 render.py
   ```
4. Find the production static page inside `dist/index.html`. This self-contained file can be served via Cloudflare Pages or Vercel for **$0/month upkeep cost**.

---

## 🔗 INTEGRATION WITH CORRUPTCLI
This project is fully ready to be integrated into `meta-consulting` as part of the `CorruptCLI` automated web scaffolding framework.

*   **For Future Agents**: If instructed to integrate CDE into CorruptCLI, write a CLI command hook inside CorruptCLI that reads `config.json` input from a prompt, spawns a new directory, copies these template assets, runs `render.py`, and deploys the build folder to Cloudflare Pages automatically.
