"""Exercise the actual vhost in an isolated Nginx, using temporary high ports."""
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
DOMAIN = "learnbyquiz.spiritedrobot.in"


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class Backend(BaseHTTPRequestHandler):
    def do_GET(self):
        self.respond("")

    def do_POST(self):
        self.respond(self.rfile.read(int(self.headers.get("Content-Length", 0))).decode())

    def respond(self, body):
        payload = json.dumps({"path": self.path, "headers": dict(self.headers), "body": body}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        pass


class NginxDeployment(unittest.TestCase):
    def test_real_vhost_and_existing_site(self):
        nginx = os.environ.get("NGINX_BINARY") or shutil.which("nginx")
        self.assertTrue(nginx, "Install Nginx or set NGINX_BINARY; this validation never skips")
        backend = ThreadingHTTPServer(("127.0.0.1", 0), Backend)
        thread = threading.Thread(target=backend.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="learnbyquiz-nginx-") as folder:
                temp = Path(folder)
                (temp / "logs").mkdir()
                webroot = temp / "www"
                challenge = webroot / ".well-known/acme-challenge"
                challenge.mkdir(parents=True)
                (challenge / "probe").write_text("acme-ok")
                cert, key = temp / "cert.pem", temp / "key.pem"
                subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", f"/CN={DOMAIN}", "-addext", f"subjectAltName=DNS:{DOMAIN}", "-keyout", str(key), "-out", str(cert)], check=True, capture_output=True)
                http_port, tls_port = free_port(), free_port()
                while tls_port == http_port:
                    tls_port = free_port()

                def transformed(name):
                    return (ROOT / "deploy/nginx" / name).read_text().replace("listen 80;", f"listen 127.0.0.1:{http_port};").replace("listen [::]:80;", "").replace("listen 443 ssl;", f"listen 127.0.0.1:{tls_port} ssl;").replace("listen [::]:443 ssl;", "").replace(f"/etc/letsencrypt/live/{DOMAIN}/fullchain.pem", str(cert)).replace(f"/etc/letsencrypt/live/{DOMAIN}/privkey.pem", str(key)).replace("/var/log/nginx/", f"{temp}/logs/").replace("/var/www/letsencrypt", str(webroot)).replace("127.0.0.1:13001", f"127.0.0.1:{backend.server_port}")

                config = temp / "nginx.conf"
                wrapper = 'pid logs/nginx.pid; error_log logs/error.log; events {} http { access_log off; %s }'
                config.write_text(wrapper % transformed("learnbyquiz-http.conf"))
                subprocess.run([nginx, "-p", folder, "-c", str(config), "-t"], check=True, capture_output=True)
                existing = f'server {{ listen 127.0.0.1:{http_port}; server_name existing.example; return 200 "existing-site"; }}'
                config.write_text(wrapper % (existing + transformed("learnbyquiz.conf")))
                subprocess.run([nginx, "-p", folder, "-c", str(config), "-t"], check=True, capture_output=True)
                process = subprocess.Popen([nginx, "-p", folder, "-c", str(config), "-g", "daemon off;"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                try:
                    for _ in range(100):
                        try:
                            with socket.create_connection(("127.0.0.1", http_port), timeout=.1):
                                break
                        except OSError:
                            time.sleep(.05)
                    connection = http.client.HTTPConnection("127.0.0.1", http_port, timeout=5)
                    connection.request("GET", "/", headers={"Host": "existing.example"})
                    response = connection.getresponse()
                    self.assertEqual(response.read(), b"existing-site")
                    connection.request("GET", "/journey?q=1", headers={"Host": DOMAIN})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 301)
                    self.assertEqual(response.getheader("Location"), f"https://{DOMAIN}/journey?q=1")
                    response.read()
                    connection.request("GET", "/.well-known/acme-challenge/probe", headers={"Host": DOMAIN})
                    self.assertEqual(connection.getresponse().read(), b"acme-ok")
                    connection.close()
                    context = ssl.create_default_context(cafile=str(cert))
                    connection = http.client.HTTPConnection("127.0.0.1", tls_port, timeout=5)
                    connection.sock = context.wrap_socket(socket.create_connection(("127.0.0.1", tls_port)), server_hostname=DOMAIN)
                    connection.request("GET", "/api/agents/executions?q=1", headers={"Host": DOMAIN, "Authorization": "Bearer fixture-token", "X-Forwarded-For": "203.0.113.99", "X-Forwarded-Proto": "http"})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.getheader("Cache-Control"), "no-store")
                    result = json.loads(response.read())
                    self.assertEqual(result["path"], "/api/agents/executions?q=1")
                    self.assertEqual(result["headers"]["Authorization"], "Bearer fixture-token")
                    self.assertEqual(result["headers"]["X-Forwarded-For"], "127.0.0.1")
                    self.assertEqual(result["headers"]["X-Forwarded-Proto"], "https")
                    connection.request("GET", "/journey", headers={"Host": DOMAIN})
                    self.assertEqual(json.loads(connection.getresponse().read())["path"], "/journey")
                    body = '{"difficulty":"medium","format":"multiple"}'
                    connection.request("POST", "/api/agents/generate-quiz", body=body, headers={"Host": DOMAIN, "Content-Type": "application/json"})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 200)
                    self.assertEqual(json.loads(response.read())["body"], body)
                    connection.request("POST", "/api/taste/profile", body="x" * 40000, headers={"Host": DOMAIN})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 413)
                    response.read()
                    connection.close()
                finally:
                    process.terminate()
                    process.communicate(timeout=10)
        finally:
            backend.shutdown()
            backend.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
