# Deploy on the existing Nginx VPS

Target: `learnbyquiz.spiritedrobot.in` on `162.35.172.158`, using Linux Docker
Compose and the host's existing Nginx. Keep one app replica.

| Component | Binding |
| --- | --- |
| Existing host Nginx | Existing ports 80/443, selected by hostname |
| LearnByQuiz on the host | **127.0.0.1:13001**, accessible locally only |
| Node inside the app container | 3001, unpublished directly |
| Dedicated Docker gateway | 172.30.0.1 on 172.30.0.0/24 |

Port 13001 was absent from the supplied `ss -lntu` snapshot. The snapshot is not
a live reservation: run the preflight on the VPS immediately before installation.
The deployment does not claim host ports 3002, 4000, 4100, 8080, 14000 or 18080.
Compose starts only the app; it does not start Caddy or another public proxy.
Existing services and firewall rules remain under the VPS operator's control.

## 1. Inspect the host

From the project checkout on the VPS, with Docker access:

```sh
sudo ss -lntup
sudo nginx -t
sudo nginx -T 2>&1 | grep -n 'server_name.*learnbyquiz.spiritedrobot.in'
python3 deploy/check-vps.py
```

The grep command returns no matches for a new hostname. If there is an existing
exact virtual host for this domain, locate and back up that file, then update
that domain's block; do not enable a second block for the same domain. Keep the
existing default and other domains' virtual hosts. Confirm Nginx is the process
owning 80/443; the listener snapshot alone does not identify the process.

The read-only preflight refuses occupied TCP 13001, Docker NAT port reservations,
and conflicting Docker subnets or host routes. It never stops a process or
changes a network. If the subnet conflicts, choose an unused subnet and update
Compose's subnet, gateway, `TRUST_PROXY`, and the preflight constants together.
If the port becomes occupied, update Compose's host binding, both Nginx upstreams
and the preflight constant together. Recheck immediately before starting Docker;
Docker's port allocation is the final conflict check.

## 2. Prepare configuration and start the app

Install Docker Engine, its Compose plugin, Python 3 and Certbot using your VPS
OS's package manager. Nginx is already running; preserve its installation and
configuration. Copy the project checkout and configure its ignored `.env`:

```dotenv
DOMAIN=learnbyquiz.spiritedrobot.in
APP_IMAGE=learnbyquiz:release-2026-11-01
GOOGLE_APPLICATION_CREDENTIALS=/etc/learnbyquiz/firebase-admin.json
```

Include the existing public Firebase build values and backend Firebase/Qloo/LLM
settings described in `.env.example`. Restrict `.env` to the deployment operator.
The credential path is the host path. Compose mounts it read-only for the app at
`/run/secrets/firebase_admin`. The container runs as UID/GID 1000; install a
separate credential copy readable by UID 1000 (owner 1000:1000, mode 0400).
Compose file secrets preserve host permissions. Keep credentials outside the
checkout and image. Do not display resolved Compose configuration without
`--quiet`, because it contains runtime secrets.

```sh
docker compose config --quiet
python3 deploy/check-vps.py
docker compose build --pull
docker compose run --rm app node scripts/migrate.js
docker compose up -d --wait --wait-timeout 120
docker compose ps
curl --fail http://127.0.0.1:13001/api/health
```

The preflight is for first installation; an existing app instance correctly
occupies 13001. For subsequent releases, verify `docker compose ps` owns that
binding, then use `docker compose build --pull` and `docker compose up -d --wait
--wait-timeout 120`. No port scan can guarantee availability during a later race.
Never terminate an unrelated process to make this port available.

## 3. Bootstrap the domain's HTTP virtual host

DNS A must point to `162.35.172.158`. Any AAAA record must point to a working IPv6
address on this VPS. Ports 80/443 already serve Nginx; add a named virtual host
inside that existing service. The supplied files are for inclusion in Nginx's
`http` context, using the usual Debian/Ubuntu `sites-enabled` layout below. On
other layouts use its existing include directory. Do not replace `nginx.conf`.

Back up an existing dedicated LearnByQuiz config before replacing it. For a new
site, enable **only** the HTTP bootstrap config first; the TLS config references
certificate files that do not exist until issuance:

```sh
sudo install -d -m 0755 /var/www/letsencrypt/.well-known/acme-challenge
sudo install -m 0644 deploy/nginx/learnbyquiz-http.conf /etc/nginx/sites-available/learnbyquiz.conf
sudo ln -s /etc/nginx/sites-available/learnbyquiz.conf /etc/nginx/sites-enabled/learnbyquiz.conf
sudo nginx -t && sudo systemctl reload nginx
```

Reuse an existing symlink for this same site if present. Resolve all syntax or
conflicting-server-name warnings before reloading. Do not reload after a failed
`nginx -t`. This bootstrap serves only ACME challenges; other paths return 503
until HTTPS is ready. It adds no default server or wildcard domain.

## 4. Issue the certificate and enable HTTPS

Use Certbot's webroot authenticator with the running Nginx; it needs no extra
listener or service stop and does not rewrite other sites' configuration:

```sh
sudo certbot certonly --webroot -w /var/www/letsencrypt --cert-name learnbyquiz.spiritedrobot.in -d learnbyquiz.spiritedrobot.in
sudo install -m 0644 deploy/nginx/learnbyquiz.conf /etc/nginx/sites-available/learnbyquiz.conf
sudo nginx -t && sudo systemctl reload nginx
sudo install -d /etc/letsencrypt/renewal-hooks/deploy
sudo install -m 0755 deploy/nginx/renew-certificate.sh /etc/letsencrypt/renewal-hooks/deploy/learnbyquiz
sudo certbot renew --cert-name learnbyquiz.spiritedrobot.in --dry-run
```

Confirm the installed Certbot package's scheduled renewal is enabled. The deploy
hook reloads Nginx after successful renewal of this certificate only, and only
after a successful syntax check. Keep both ACME and HTTP-to-HTTPS routing active
for future renewals. Existing unrelated certificates are unaffected by the hook.

The HTTPS config preserves authorization, query strings and SPA paths. It
replaces spoofable forwarding headers, disables API caching/buffering and uses
240-second upstream read/send timeouts. Only the Docker gateway is trusted by
Express. Nginx's normal per-host routing reuses its existing public listeners.
See [Nginx virtual hosts](https://nginx.org/en/docs/http/server_names.html),
[proxy directives](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) and
[Certbot webroot](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot).

## 5. Verify the public site and existing sites

```sh
curl --fail http://127.0.0.1:13001/api/health
curl --fail https://learnbyquiz.spiritedrobot.in/api/health
curl -I http://learnbyquiz.spiritedrobot.in/
sudo ss -lntp 'sport = :13001'
docker compose logs --tail 100 app
```

The public health request must succeed without disabling certificate validation;
HTTP should redirect to HTTPS. Confirm the backend binds only 127.0.0.1, sign in
through the domain, generate/submit a quiz and review the dashboard. Verify each
existing domain still responds. Firebase authorization for this hostname has
already been verified; browser sign-in through the deployed origin remains a
required check. Set up log/health alerts and appropriate Firestore backups.

The app keeps its health check, resource limits, dropped capabilities, read-only
filesystem, bounded logs, automatic restarts and 250-second stop grace period.
Do not scale replicas until rate-limit/lock storage and execution jobs are shared.

## Validation and rollback

Run `npm run test:live:all` before release. Nginx/preflight regressions can be run
with `python3 -m unittest discover -s tests/deployment -v` when Nginx, OpenSSL and
Python 3 are installed. Set `NGINX_BINARY` if Nginx is outside PATH. The Nginx test
uses temporary high ports, a local test certificate and synthetic upstreams.
It does not modify the host's installed Nginx or contact providers.

Keep the previous image tag and this domain's previous config. To roll back,
restore that image/config, run `nginx -t`, then reload Nginx and verify health and
existing domains. Keep the loopback binding unchanged. Do not stop the shared
Nginx service or remove unrelated containers/networks.

Server execution remains pending: the attempted SSH connection as
`root@162.35.172.158` was denied. No VPS configuration was changed. Docker image
execution and the public certificate still require verification on the server.
