"""
Offline tests for the Pro-tier stand-up logic (corrupt-mcp/dealership_pro.py).

No network and no real tokens: the HTTP layer is mocked, so these lock down
request construction, idempotency, and the pipeline wiring — the parts that are
easy to get subtly wrong and expensive to debug against live infrastructure.

Run:  python3 -m unittest discover -s corrupt-mcp/tests
"""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import dealership_pro as dp


class FakeResp:
    def __init__(self, status=200, payload=None, text=None, content_type="application/json"):
        self.status_code = status
        self._payload = payload
        self.text = text if text is not None else (json.dumps(payload) if payload is not None else "")
        self.headers = {"content-type": content_type}

    def json(self):
        return self._payload


class RecordingSession:
    """Stands in for requests.Session; scripts responses by (METHOD, path-substr)."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []
        self.headers = {}

    def request(self, method, url, **kw):
        self.calls.append({"method": method, "url": url, **kw})
        for (m, needle), resp in self.routes.items():
            if m == method and needle in url:
                return resp() if callable(resp) else resp
        raise AssertionError(f"unexpected request: {method} {url}")


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #

class TestConfigGeneration(unittest.TestCase):
    def test_site_ts_shape_and_escaping(self):
        ts = dp.generate_site_config(
            brand_name='Ace "Best" Motors', contact_phone="5755551234",
            contact_email="a@b.com", address_street="1 Rd", address_city="Town",
            address_state="NM", address_zip="88001", domain="ace.com",
            locations=[{"id": "main", "label": "Main"}, {"id": "north", "label": "North"}],
        )
        self.assertIn("export const siteConfig", ts)
        self.assertIn("as const;", ts)
        self.assertIn("as DealershipLocation[]", ts)
        self.assertIn('raw: "5755551234"', ts)
        self.assertIn('display: "(575) 555-1234"', ts)
        self.assertIn('id: "north"', ts)
        # embedded double-quotes must be JSON-escaped, not break the literal
        self.assertIn('\\"Best\\"', ts)

    def test_bad_location_id_rejected(self):
        with self.assertRaises(dp.StandupError):
            dp.generate_site_config(
                brand_name="X", contact_phone="5555555555", contact_email="a@b.com",
                address_street="1", address_city="c", address_state="ST",
                address_zip="1", domain="x.com", locations=[{"id": "Bad Id", "label": "x"}])

    def test_pg_str_escapes_quotes(self):
        self.assertEqual(dp._pg_str("O'Brien"), "'O''Brien'")
        self.assertEqual(dp._pg_str(None), "null")

    def test_gen_password_complexity(self):
        for _ in range(20):
            pw = dp.gen_password()
            self.assertTrue(any(c.isupper() for c in pw))
            self.assertTrue(any(c.islower() for c in pw))
            self.assertTrue(any(c.isdigit() for c in pw))


class TestScaffold(unittest.TestCase):
    def test_scaffold_excludes_cruft_and_writes_config(self):
        with tempfile.TemporaryDirectory() as d:
            target = os.path.join(d, "site")
            res = dp.scaffold_pro(
                target,
                dict(brand_name="Ace Motors", contact_phone="5755551234",
                     contact_email="a@b.com", address_street="1 Rd", address_city="Town",
                     address_state="NM", address_zip="88001", domain="ace.com"),
                supabase_url="https://ref.supabase.co", supabase_anon_key="anon",
            )
            self.assertEqual(res["status"], "success")
            self.assertTrue(os.path.isfile(os.path.join(target, "src/config/site.ts")))
            self.assertTrue(os.path.isfile(os.path.join(target, ".env.local")))
            self.assertFalse(os.path.exists(os.path.join(target, "node_modules")))
            self.assertFalse(os.path.exists(os.path.join(target, ".git")))
            with open(os.path.join(target, ".vercelignore")) as f:
                self.assertIn(".env.local", f.read())

    def test_scaffold_refuses_inside_repo(self):
        with self.assertRaises(dp.StandupError):
            dp.scaffold_pro(os.path.join(dp.TEMPLATE_PRO, "x"), dict(
                brand_name="X", contact_phone="5555555555", contact_email="a@b.com",
                address_street="1", address_city="c", address_state="ST",
                address_zip="1", domain="x.com"))


# --------------------------------------------------------------------------- #
# Supabase client
# --------------------------------------------------------------------------- #

class TestSupabaseAdmin(unittest.TestCase):
    def _admin(self, routes):
        sb = dp.SupabaseAdmin("sbp_faketoken")
        sb.s = RecordingSession(routes)
        sb.s.headers = {"Authorization": "Bearer sbp_faketoken", "Content-Type": "application/json"}
        return sb

    def test_get_anon_key_prefers_anon_then_publishable(self):
        sb = self._admin({("GET", "/api-keys"): FakeResp(payload=[
            {"name": "service_role", "type": "secret", "api_key": "sr"},
            {"name": "anon", "type": "legacy", "api_key": "ANON"},
            {"name": "default", "type": "publishable", "api_key": "PUB"},
        ])})
        key, kind = sb.get_anon_key("ref")
        self.assertEqual(key, "ANON")
        self.assertEqual(kind, "anon")

        sb2 = self._admin({("GET", "/api-keys"): FakeResp(payload=[
            {"name": "service_role", "type": "secret", "api_key": "sr"},
            {"name": "default", "type": "publishable", "api_key": "PUB"},
        ])})
        key2, _ = sb2.get_anon_key("ref")
        self.assertEqual(key2, "PUB")

    def test_schema_applied_true_false(self):
        sb = self._admin({("POST", "/database/query"): FakeResp(payload=[{"t": "authorized_admins"}])})
        self.assertTrue(sb.schema_applied("ref"))
        sb2 = self._admin({("POST", "/database/query"): FakeResp(payload=[{"t": None}])})
        self.assertFalse(sb2.schema_applied("ref"))

    def test_resolve_org_variants(self):
        two = FakeResp(payload=[{"id": "a", "slug": "acme"}, {"id": "b", "slug": "beta"}])
        sb = self._admin({("GET", "/organizations"): two})
        self.assertEqual(sb.resolve_org(organization_slug="beta"), ("b", "beta"))
        with self.assertRaises(dp.StandupError):
            sb.resolve_org()  # ambiguous
        one = FakeResp(payload=[{"id": "a", "slug": "acme"}])
        sb2 = self._admin({("GET", "/organizations"): one})
        self.assertEqual(sb2.resolve_org(), ("a", "acme"))

    def test_error_surfaces_status_and_body(self):
        sb = self._admin({("POST", "/database/query"): FakeResp(status=400, text="syntax error at or near")})
        with self.assertRaises(dp.StandupError) as cm:
            sb.run_sql("ref", "bad sql")
        self.assertIn("400", str(cm.exception))
        self.assertIn("syntax error", str(cm.exception))

    def test_deploy_function_multipart(self):
        captured = {}

        def cap():
            return FakeResp(payload={"id": "fn"})

        sb = self._admin({("POST", "/functions/deploy"): cap})
        # wrap request to capture the multipart files/params
        orig = sb.s.request

        def spy(method, url, **kw):
            captured.update(kw)
            return orig(method, url, **kw)

        sb.s.request = spy
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "index.ts"), "w") as f:
                f.write("Deno.serve(() => new Response('ok'))")
            sb.deploy_function("ref", d, slug="send-credit-app-notification", verify_jwt=True)
        self.assertEqual(captured["params"], {"slug": "send-credit-app-notification"})
        parts = captured["files"]
        names = [p[0] for p in parts]
        self.assertIn("metadata", names)
        self.assertIn("file", names)
        meta = json.loads([p for p in parts if p[0] == "metadata"][0][1][1])
        self.assertEqual(meta["entrypoint_path"], "index.ts")
        self.assertTrue(meta["verify_jwt"])
        # multipart must NOT carry the JSON default content-type
        self.assertEqual(captured["headers"]["Content-Type"], None)


# --------------------------------------------------------------------------- #
# Provisioning pipeline (all Supabase calls mocked)
# --------------------------------------------------------------------------- #

class TestProvision(unittest.TestCase):
    def test_happy_path_idempotent_secrets_and_shared_webhook(self):
        sb = mock.MagicMock()
        sb.resolve_org.return_value = ("orgid", "orgslug")
        sb.create_project.return_value = {"ref": "newref123"}
        sb.wait_ready.return_value = {"status": "ACTIVE_HEALTHY"}
        sb.get_anon_key.return_value = ("ANONKEY", "anon")
        sb.schema_applied.return_value = False
        sb.pooler_db_url.return_value = "postgresql://postgres.newref123:pw@host:5432/postgres"

        with mock.patch.object(dp, "SupabaseAdmin", return_value=sb):
            res = dp.provision_supabase(
                access_token="sbp_x", project_name="ace", super_admin_email="boss@ace.com",
                resend_api_key="re_123", notification_to_emails="boss@ace.com",
            )

        self.assertEqual(res["ref"], "newref123")
        self.assertEqual(res["project_url"], "https://newref123.supabase.co")
        self.assertEqual(res["anon_key"], "ANONKEY")
        self.assertEqual(res["schema"], "applied")
        self.assertTrue(res["db_password"])          # generated + returned
        self.assertTrue(res["webhook_secret"])

        sb.apply_migration.assert_called_once()
        sb.seed_super_admin.assert_called_once_with("newref123", "boss@ace.com")

        # The three Vault secrets by name, and the webhook secret shared with the
        # edge-function WEBHOOK_SECRET (the coordination the manual runbook makes
        # you do by hand).
        vault_names = {c.args[1]: c.args[2] for c in sb.upsert_vault_secret.call_args_list}
        self.assertEqual(set(vault_names), {dp.VAULT_PROJECT_URL, dp.VAULT_ANON_KEY, dp.VAULT_WEBHOOK_SECRET})
        self.assertEqual(vault_names[dp.VAULT_ANON_KEY], "ANONKEY")
        fn_secrets = sb.set_function_secrets.call_args.args[1]
        self.assertEqual(fn_secrets["WEBHOOK_SECRET"], vault_names[dp.VAULT_WEBHOOK_SECRET])
        self.assertEqual(fn_secrets["RESEND_API_KEY"], "re_123")

    def test_existing_ref_skips_create_and_reapply(self):
        sb = mock.MagicMock()
        sb.get_anon_key.return_value = ("K", "anon")
        sb.schema_applied.return_value = True   # already applied
        sb.pooler_db_url.side_effect = dp.StandupError("no pw")

        with mock.patch.object(dp, "SupabaseAdmin", return_value=sb):
            res = dp.provision_supabase(
                access_token="sbp_x", project_name="ace", super_admin_email="boss@ace.com",
                existing_ref="existingref",
            )
        sb.create_project.assert_not_called()
        sb.apply_migration.assert_not_called()      # skipped: already applied
        self.assertIn("skipped", res["schema"])
        self.assertEqual(res["ref"], "existingref")


class TestVercel(unittest.TestCase):
    def test_create_new_project_with_env(self):
        vc = dp.Vercel("vt_token")
        vc.s = RecordingSession({
            ("GET", "/v9/projects/ace"): FakeResp(status=404, text="not found"),
            ("POST", "/v11/projects"): FakeResp(payload={"id": "prj_1", "accountId": "acc_1"}),
        })
        vc.s.headers = {"Authorization": "Bearer vt_token"}
        proj, created = vc.create_or_get_project("ace", env={"NEXT_PUBLIC_SUPABASE_URL": "u"})
        self.assertTrue(created)
        self.assertEqual(proj["id"], "prj_1")
        post = [c for c in vc.s.calls if c["method"] == "POST"][0]
        ev = post["json"]["environmentVariables"][0]
        self.assertEqual(ev["key"], "NEXT_PUBLIC_SUPABASE_URL")
        self.assertIn("production", ev["target"])

    def test_existing_project_upserts_env(self):
        vc = dp.Vercel("vt_token")
        vc.s = RecordingSession({
            ("GET", "/v9/projects/ace"): FakeResp(payload={"id": "prj_9", "accountId": "acc"}),
            ("POST", "/v10/projects/prj_9/env"): FakeResp(payload={"created": True}),
        })
        vc.s.headers = {"Authorization": "Bearer vt_token"}
        proj, created = vc.create_or_get_project("ace", env={"NEXT_PUBLIC_SUPABASE_URL": "u"})
        self.assertFalse(created)
        self.assertEqual(proj["id"], "prj_9")
        self.assertTrue(any("/env" in c["url"] for c in vc.s.calls))

    def test_write_link(self):
        vc = dp.Vercel("vt_token")
        with tempfile.TemporaryDirectory() as d:
            vc.write_link(d, "prj_1", "acc_1")
            with open(os.path.join(d, ".vercel", "project.json")) as f:
                link = json.load(f)
            self.assertEqual(link, {"projectId": "prj_1", "orgId": "acc_1"})


if __name__ == "__main__":
    unittest.main()
