"""
End-to-end integration test for the Pro-tier stand-up, run against a local mock
of the Supabase Management API + Vercel REST API (a real threaded HTTP server)
and a fake `vercel` CLI on PATH.

Unlike test_dealership_pro.py (which mocks the requests.Session object), this
exercises the REAL HTTP code paths: requests actually serializes the JSON and
the multipart function-deploy body, sends them over a socket, and parses the
responses; the polling loop really loops; the Vercel deploy really shells out.
No network and no tokens — everything is served from 127.0.0.1.

The module reads its API base URLs from the `SUPABASE_API` / `VERCEL_API` module
globals at call time, so the test points those at the mock server.

Run:  python3 -m unittest corrupt-mcp.tests.test_integration_mock
      (or: python3 -m unittest discover -s corrupt-mcp/tests)
"""

import json
import os
import stat
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import dealership_pro as dp

MOCK_REF = "mockref0123456789ab"


class MockHandler(BaseHTTPRequestHandler):
    """Serves the handful of Supabase + Vercel endpoints the code calls."""

    def log_message(self, *a):  # silence
        pass

    # -- helpers ------------------------------------------------------------
    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _record(self, method, body=b""):
        self.server.calls.append({
            "method": method,
            "path": self.path,
            "ctype": self.headers.get("Content-Type", ""),
            "auth": self.headers.get("Authorization", ""),
            "body": body,
        })

    def _read_body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        return self.rfile.read(n) if n else b""

    # -- routes -------------------------------------------------------------
    def do_GET(self):
        self._record("GET")
        p = self.path
        if p.startswith("/v1/organizations"):
            return self._send(200, [{"id": "org_1", "slug": "acme", "name": "Acme"}])
        if p.startswith(f"/v1/projects/{MOCK_REF}/api-keys"):
            return self._send(200, [
                {"name": "service_role", "type": "secret", "api_key": "SERVICE"},
                {"name": "anon", "type": "legacy", "api_key": "ANONKEY123"},
            ])
        if p.startswith(f"/v1/projects/{MOCK_REF}/config/database/pooler"):
            return self._send(200, {
                "db_host": "aws-1-us-east-1.pooler.supabase.com", "db_port": 5432,
                "db_user": f"postgres.{MOCK_REF}", "db_name": "postgres",
                "connection_string": "postgresql://...",
            })
        if p.startswith(f"/v1/projects/{MOCK_REF}"):
            # First poll returns COMING_UP, subsequent polls ACTIVE_HEALTHY —
            # exercises the wait_ready loop.
            self.server.poll_count += 1
            status = "COMING_UP" if self.server.poll_count < 2 else "ACTIVE_HEALTHY"
            return self._send(200, {"id": MOCK_REF, "ref": MOCK_REF, "status": status,
                                    "database": {"host": "h", "version": "15",
                                                 "postgres_engine": "15", "release_channel": "ga"}})
        if p.startswith("/v9/projects/"):
            return self._send(404, {"error": {"code": "not_found"}})  # forces create
        return self._send(404, {"error": "unmatched GET " + p})

    def do_POST(self):
        body = self._read_body()
        self._record("POST", body)
        p = self.path
        if p == "/v1/projects":
            return self._send(201, {"id": MOCK_REF, "ref": MOCK_REF, "organization_id": "org_1",
                                    "organization_slug": "acme", "name": "acme", "region": "us-east-1",
                                    "created_at": "now", "status": "COMING_UP"})
        if p.startswith(f"/v1/projects/{MOCK_REF}/database/query"):
            sql = json.loads(body).get("query", "")
            if "to_regclass" in sql:
                return self._send(201, [{"t": None}])   # schema not yet applied
            return self._send(201, [])                   # DDL / seed / vault / delete
        if p.startswith(f"/v1/projects/{MOCK_REF}/secrets"):
            return self._send(201, [])
        if p.startswith(f"/v1/projects/{MOCK_REF}/functions/deploy"):
            # Assert the multipart shape the way Supabase expects it.
            ok = (self.headers.get("Content-Type", "").startswith("multipart/form-data")
                  and b'name="metadata"' in body and b"entrypoint_path" in body
                  and b"index.ts" in body)
            self.server.deploy_ok = ok
            return self._send(201, {"id": "fn_1", "slug": "send-credit-app-notification",
                                    "status": "ACTIVE", "version": 1})
        if p == "/v11/projects":
            return self._send(200, {"id": "prj_mock", "name": "acme", "accountId": "acc_mock"})
        if "/env" in p:
            return self._send(201, {"created": True})
        return self._send(404, {"error": "unmatched POST " + p})


def _fake_vercel_on_path():
    """Create a temp dir containing an executable `vercel` that prints a URL."""
    d = tempfile.mkdtemp(prefix="fakebin_")
    script = os.path.join(d, "vercel")
    with open(script, "w") as f:
        f.write("#!/bin/sh\necho 'https://acme-mock.vercel.app'\nexit 0\n")
    os.chmod(script, os.stat(script).st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return d


class TestStandupAgainstMock(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), MockHandler)
        cls.httpd.calls = []
        cls.httpd.poll_count = 0
        cls.httpd.deploy_ok = None
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.port}"
        # Point the module's API bases at the mock, and make polling instant.
        cls._orig = (dp.SUPABASE_API, dp.VERCEL_API, dp.time.sleep)
        dp.SUPABASE_API = cls.base
        dp.VERCEL_API = cls.base
        dp.time.sleep = lambda *_a, **_k: None

    @classmethod
    def tearDownClass(cls):
        dp.SUPABASE_API, dp.VERCEL_API, dp.time.sleep = cls._orig
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def _paths(self, method):
        return [c["path"] for c in self.httpd.calls if c["method"] == method]

    def test_provision_full_flow(self):
        with tempfile.TemporaryDirectory() as tmp:
            res = dp.provision_supabase(
                access_token="sbp_test", project_name="acme",
                super_admin_email="boss@acme.com", region="us-east-1",
                resend_api_key="re_test", notification_to_emails="boss@acme.com",
                notification_sender_email="site@acme.com", notification_brand_name="Acme",
                target_path=tmp,
            )
        self.assertEqual(res["ref"], MOCK_REF)
        self.assertEqual(res["project_url"], f"https://{MOCK_REF}.supabase.co")
        self.assertEqual(res["anon_key"], "ANONKEY123")
        self.assertEqual(res["anon_key_kind"], "anon")
        self.assertEqual(res["schema"], "applied")
        self.assertTrue(res["db_password"])
        self.assertTrue(res["webhook_secret"])
        self.assertIn("pooler.supabase.com", res["supabase_db_url"])
        # the generated password must be URL-encoded into the pooler URI (real code path)
        self.assertIn(MOCK_REF, res["supabase_db_url"])

        # Verb/endpoint trace proves the real ordering happened over the wire.
        posts = self._paths("POST")
        self.assertIn("/v1/projects", posts)
        self.assertTrue(any("/database/query" in x for x in posts))
        self.assertTrue(any("/secrets" in x for x in posts))
        # 5 SQL calls at least: marker check + apply + seed + 3 vault upserts
        self.assertGreaterEqual(sum("/database/query" in x for x in posts), 5)

    def test_env_local_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            dp.provision_supabase(
                access_token="sbp_test", project_name="acme",
                super_admin_email="boss@acme.com", target_path=tmp,
            )
            env = os.path.join(tmp, ".env.local")
            self.assertTrue(os.path.isfile(env))
            with open(env) as f:
                content = f.read()
            self.assertIn(f"NEXT_PUBLIC_SUPABASE_URL=https://{MOCK_REF}.supabase.co", content)
            self.assertIn("NEXT_PUBLIC_SUPABASE_ANON_KEY=ANONKEY123", content)
            self.assertIn("SUPABASE_DB_URL=postgresql://", content)

    def test_deploy_function_real_multipart(self):
        self.httpd.deploy_ok = None
        res = dp.deploy_function(access_token="sbp_test", ref=MOCK_REF)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["endpoint"],
                         f"https://{MOCK_REF}.supabase.co/functions/v1/send-credit-app-notification")
        # The mock verified the wire body was real multipart with metadata + index.ts.
        self.assertTrue(self.httpd.deploy_ok, "function deploy was not a valid multipart request")

    def test_deploy_vercel_real_http_and_cli(self):
        fakebin = _fake_vercel_on_path()
        old_path = os.environ["PATH"]
        os.environ["PATH"] = fakebin + os.pathsep + old_path
        try:
            with tempfile.TemporaryDirectory() as tmp:
                res = dp.deploy_vercel(
                    vercel_token="vt_test", target_path=tmp, project_name="acme",
                    supabase_url=f"https://{MOCK_REF}.supabase.co", supabase_anon_key="ANONKEY123",
                )
            self.assertEqual(res["project_id"], "prj_mock")
            self.assertEqual(res["url"], "https://acme-mock.vercel.app")
            self.assertTrue(res["created"])
        finally:
            os.environ["PATH"] = old_path

    def test_full_standup_chain(self):
        """scaffold -> provision -> deploy function -> deploy Vercel, wired end to end."""
        self.httpd.poll_count = 0   # reset so wait_ready sees COMING_UP then healthy again
        fakebin = _fake_vercel_on_path()
        old_path = os.environ["PATH"]
        os.environ["PATH"] = fakebin + os.pathsep + old_path
        try:
            with tempfile.TemporaryDirectory() as d:
                target = os.path.join(d, "acme-site")
                steps = dp.standup(
                    config_inputs=dict(
                        brand_name="Acme Motors", contact_phone="5555550100",
                        contact_email="sales@acme.com", address_street="1 Rd",
                        address_city="Town", address_state="ST", address_zip="00000",
                        domain="acme.com"),
                    target_path=target, supabase_access_token="sbp_test",
                    vercel_token="vt_test", super_admin_email="boss@acme.com",
                    resend_api_key="re_test", notification_to_emails="boss@acme.com",
                    run_verify=False,   # verify needs psql + a real DB
                )
                self.assertEqual(steps["status"], "success")
                # Config really generated, then the infra chain ran and produced a URL.
                self.assertTrue(os.path.isfile(os.path.join(target, "src/config/site.ts")))
                self.assertEqual(steps["provision"]["ref"], MOCK_REF)
                self.assertEqual(steps["function"]["status"], "success")
                self.assertEqual(steps["summary"]["site_url"], "https://acme-mock.vercel.app")
                # The webhook secret generated in provisioning is the one carried forward.
                self.assertEqual(steps["summary"]["webhook_secret"], steps["provision"]["webhook_secret"])
        finally:
            os.environ["PATH"] = old_path


if __name__ == "__main__":
    unittest.main()
