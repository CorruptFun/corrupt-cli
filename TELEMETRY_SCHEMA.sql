-- Run this in your Supabase SQL Editor to create the Telemetry tracking table

CREATE TABLE IF NOT EXISTS cli_telemetry (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id TEXT NOT NULL,
    os_system TEXT,
    python_version TEXT,
    command_run TEXT,
    industry_target TEXT,
    city_target TEXT,
    state_target TEXT,
    duration_ms INTEGER,
    error_msg TEXT,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: Create an index for faster querying by command or status
CREATE INDEX IF NOT EXISTS idx_cli_telemetry_command ON cli_telemetry(command_run);
CREATE INDEX IF NOT EXISTS idx_cli_telemetry_status ON cli_telemetry(status);
CREATE INDEX IF NOT EXISTS idx_cli_telemetry_client ON cli_telemetry(client_id);
