#!/usr/bin/env python3
# Copyright (c) 2026 LEANEA GmbH and others.
# SPDX-License-Identifier: Apache-2.0
# Local HTTP compatibility checks; no cloud services are used.

import json
import os
import runpy
import stat
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import distribution, version
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit, unquote

import requests
from eu.xfsc.bdd.core.defaults import CONNECT_TIMEOUT_IN_SECONDS
from eu.xfsc.bdd.core.server._spring_boot_actuator import SpringBootActuator
from eu.xfsc.bdd.core.server.keycloak import KeycloakServer, BaseServiceKeycloak
from eu.xfsc.bdd.core.steps import rest


def _installed_source():
    metadata = distribution("eu-xfsc-bdd").read_text("direct_url.json")
    if not metadata:
        raise AssertionError("BDD installation has no source provenance.")
    url = urlsplit(json.loads(metadata)["url"])
    if url.scheme != "file" or url.netloc not in ("", "localhost"):
        raise AssertionError("Expected the prepared local official source.")
    source = Path(unquote(url.path))
    if not source.is_dir():
        raise AssertionError("Prepared BDD source is missing.")
    return source


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/actuator/health":
            self.reply(200, {"status": "UP"})
        elif path == "/realms/review":
            self.reply(200, {"realm": "review"})
        elif path == "/echo":
            self.reply(200, {
                "authorization": self.headers.get("Authorization"),
                "content_type": self.headers.get("Content-Type"),
            })
        else:
            self.reply(404, {"error": "not-found"})

    def do_POST(self):
        path = urlsplit(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        form = parse_qs(self.rfile.read(length).decode())
        expected = {
            "grant_type": ["client_credentials"],
            "client_secret": ["synthetic-local-secret"],
            "scope": ["openid"],
            "client_id": ["review-client"],
        }
        if (
            path == "/realms/review/protocol/openid-connect/token"
            and form == expected
        ):
            self.reply(200, {"access_token": "synthetic-local-token"})
        else:
            self.reply(400, {"error": "invalid-request"})


class ConcreteService(BaseServiceKeycloak):
    def is_up(self):
        return True


class Compatibility(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert version("requests") == "2.33.0"
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(
            target=cls.server.serve_forever, daemon=True
        )
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def keycloak(self, **overrides):
        fields = {
            "host": self.base + "/",
            "client_secret": "synthetic-local-secret",
            "scope": "openid",
            "client_id": "review-client",
            "realm": "review",
            "last_token": "synthetic-local-token",
        }
        fields.update(overrides)
        return KeycloakServer.model_construct(**fields)

    def test_01_health_response_and_cache(self):
        service = SpringBootActuator.model_construct(host=self.base + "/")
        with patch(
            "eu.xfsc.bdd.core.server._spring_boot_actuator.requests.get",
            wraps=requests.get,
        ) as get:
            self.assertTrue(service.is_up())
            self.assertIsInstance(service.health, requests.Response)
            self.assertEqual(service.health.json(), {"status": "UP"})
            get.assert_called_once_with(
                self.base + "/actuator/health",
                timeout=CONNECT_TIMEOUT_IN_SECONDS,
            )

    def test_02_connection_error_handling(self):
        service = SpringBootActuator.model_construct(host=self.base + "/")
        with patch(
            "eu.xfsc.bdd.core.server._spring_boot_actuator.requests.get",
            side_effect=requests.exceptions.ConnectionError("synthetic"),
        ):
            self.assertFalse(service.is_up())

    def test_03_keycloak_realm_checks(self):
        self.assertTrue(self.keycloak().is_up())
        self.assertFalse(self.keycloak(realm="missing").is_up())

    def test_04_keycloak_token_form(self):
        # A host without a trailing slash matches fetch_token's URL join.
        service = self.keycloak(host=self.base)
        self.assertEqual(service.fetch_token(), "synthetic-local-token")

    def test_05_authenticated_session_headers(self):
        with requests.Session() as session:
            session.trust_env = False
            service = ConcreteService.model_construct(
                http=session, keycloak=self.keycloak()
            )
            service._update_header("application/json")
            response = service.http.get(self.base + "/echo", timeout=5)
            self.assertEqual(response.json(), {
                "authorization": "Bearer synthetic-local-token",
                "content_type": "application/json",
            })
            service.keycloak.last_token = "synthetic-replacement-token"
            service._update_header()
            response = service.http.get(self.base + "/echo", timeout=5)
            self.assertEqual(
                response.json()["authorization"],
                "Bearer synthetic-replacement-token",
            )

    def test_06_rest_response_steps(self):
        response = requests.get(self.base + "/actuator/health", timeout=5)
        context = SimpleNamespace(
            requests_response=response, text=response.text, aliases={}
        )
        rest._200(context)
        rest.check_test_exact_match(context)
        context.text = r'"status"\s*:\s*"UP"'
        rest.regexp_match(context)

        context.requests_response = requests.get(
            self.base + "/missing", timeout=5
        )
        rest._404(context)
        with self.assertRaises(AssertionError):
            rest._200(context)

    def test_07_existing_native_script_test(self):
        path = (
            _installed_source()
            / "tests/test_client/trust_runner.py"
        )
        example = path.parents[2] / "examples/python_script.py"
        original_mode = stat.S_IMODE(example.stat().st_mode)
        try:
            example.chmod(original_mode | stat.S_IXUSR)
            namespace = runpy.run_path(str(path))
            namespace["test_native_script"]()
        finally:
            example.chmod(original_mode)
        self.assertEqual(stat.S_IMODE(example.stat().st_mode), original_mode)


if __name__ == "__main__":
    unittest.main(verbosity=2)
