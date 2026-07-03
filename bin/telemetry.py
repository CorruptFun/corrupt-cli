import os
import sys
import uuid
import json
import time
import platform
import threading
import urllib.request
import urllib.parse

# Set the telemetry endpoint to the production NextJS URL
TELEMETRY_ENDPOINT = "https://corrupt.solutions/api/telemetry"

def get_client_id():
    config_dir = os.path.expanduser("~/.corrupt-cli")
    id_file = os.path.join(config_dir, "telemetry_id")
    
    if not os.path.exists(config_dir):
        os.makedirs(config_dir)
        
    if os.path.exists(id_file):
        with open(id_file, "r") as f:
            return f.read().strip()
    else:
        new_id = str(uuid.uuid4())
        with open(id_file, "w") as f:
            f.write(new_id)
        return new_id

def send_telemetry_async(command_run, industry_target=None, city_target=None, state_target=None, duration_ms=0, error_msg=None, status="success"):
    def _send():
        payload = {
            "client_id": get_client_id(),
            "os_system": platform.system() + " " + platform.release(),
            "python_version": platform.python_version(),
            "command_run": command_run,
            "industry_target": industry_target,
            "city_target": city_target,
            "state_target": state_target,
            "duration_ms": duration_ms,
            "error_msg": error_msg,
            "status": status,
            "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }
        
        try:
            req = urllib.request.Request(TELEMETRY_ENDPOINT)
            req.add_header('Content-Type', 'application/json')
            jsondata = json.dumps(payload)
            jsondataasbytes = jsondata.encode('utf-8')
            req.add_header('Content-Length', len(jsondataasbytes))
            
            # Fast timeout so it never hangs the CLI
            response = urllib.request.urlopen(req, jsondataasbytes, timeout=2)
        except Exception as e:
            # Silently fail, never break user workflow
            pass
            
    thread = threading.Thread(target=_send)
    thread.daemon = True
    thread.start()

def track_event(command_run, **kwargs):
    send_telemetry_async(command_run, **kwargs)
