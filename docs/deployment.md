# Single-process deployment

The supported initial deployment is one Node process behind HTTPS, using the
configured Firebase, Qloo and NVIDIA services. Keep instance count at one until
rate-limit storage and generation locks are shared. The host must allow outgoing
HTTPS to the configured providers.

## Prepare and verify

Use Node 22.18 or newer. Supply public Firebase `VITE_*` settings at build time.
Store backend secrets in the host's secret manager, or an ignored `.env` readable
only by the service user. Use workload identity where available; otherwise keep
the Admin credential file outside this checkout and image.

```sh
npm ci
npm run build
npm run test:production
npm run audit:production
npm run verify:live
npm run migrate
npm start
```

Before releasing changes, run `npm run test:live:all` with the documented emulator
and browser prerequisites. It creates and cleans up isolated test accounts. CI
runs the local release gate on pushes and pull requests without cloud secrets.

## Configure the host

- Route the production HTTPS origin to the API's `PORT` (default 3001). Express
  serves both the SPA and API; preserve `Authorization` headers.
- Add that hostname to Firebase Authentication's authorized domains.
- Restrict direct ingress to the API when using a reverse proxy. Set
  `TRUST_PROXY` to the actual proxy IPs or CIDRs, comma-separated. For an Nginx
  proxy on the same host, use `TRUST_PROXY=loopback`. The proxy must overwrite
  forwarding headers. Leave this variable blank when clients connect directly.
- Set the proxy response timeout to at least 240 seconds and the process
  termination grace period to at least 250 seconds. Use a supervisor that
  restarts failed processes and sends SIGTERM for shutdown.
- Probe `GET /api/health` for process liveness. This endpoint does not make
  provider requests. Use `npm run verify:live` for explicit dependency checks.
- Collect stdout logs and alert on repeated 5xx responses, failed generation,
  provider quota exhaustion, and health-check failures. Enable Firestore backup
  retention appropriate to your deployment and verify a restore before launch.

Production startup rejects missing backend configuration, invalid ports,
emulator routing and missing built assets. Backend runtime does not require
the build-time `VITE_*` variables. API responses use `no-store`; HTML revalidates,
and hashed Vite assets use immutable caching.

## Container

`compose.yaml` builds the app and starts a Caddy HTTPS proxy. Only Caddy's ports
80/443 are published. Certificate state persists in named volumes, and the app
trusts only Caddy's fixed address on their dedicated Docker network. Do not attach
other containers to this network. If `172.30.0.0/24` conflicts with your server's
networks, update the subnet, Caddy address and `TRUST_PROXY` together.

On the server, install Docker Engine and the Compose plugin, copy the source and
lockfile, and provide an ignored `.env` containing your configuration. Add:

```dotenv
DOMAIN=learnbyquiz.spiritedrobot.in
APP_IMAGE=learnbyquiz:release-2026-11-01
GOOGLE_APPLICATION_CREDENTIALS=/etc/learnbyquiz/firebase-admin.json
```

Point the domain's DNS to the server and allow inbound ports 80 and 443. Add the
domain in Firebase Auth. The credential path above is the **host** path; Compose
mounts it read-only at `/run/secrets/firebase_admin` for the app alone. The
container runs as UID/GID 1000; that user needs read access to the source file.
Have the server administrator install a dedicated copy with owner 1000:1000 and
mode 0400. Compose file secrets preserve host permissions. Keep the host `.env`
restricted to the deployment operator. Do not print `docker compose config`
without `--quiet`, because resolved configuration contains secrets.

```sh
docker compose config --quiet
docker compose build --pull
docker compose run --rm app node scripts/migrate.js
docker compose up -d --wait --wait-timeout 120
docker compose ps
curl --fail https://learnbyquiz.spiritedrobot.in/api/health
```

Perform a browser sign-in and generate/submit a quiz through that HTTPS origin
before opening access to users. Inspect `docker compose logs --tail 100 app
proxy` when troubleshooting. The app has bounded logs, a read-only filesystem,
dropped capabilities, resource limits, automatic restarts and a 250-second stop
grace period. Keep exactly one app replica.

Only public Firebase values become build arguments. Provider secrets are
supplied at runtime. Do not copy `.env` or credentials into the image. Certificate
provisioning requires working DNS and public access to the challenge ports; see
the [official Caddy Docker instructions](https://caddyserver.com/docs/running#docker-compose)
and [reverse proxy reference](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

The Compose structure has been validated locally. Container execution still
requires a running Docker daemon; no image execution or public HTTPS endpoint
has been verified here.

## Rollback

Keep the previous release artifact/image and public build settings. Stop new
traffic, let requests drain, then restart the previous artifact with the same
runtime secrets. This release adds no destructive migration. Validate health,
sign-in and a saved quiz before reopening traffic.

The local release checks do not deploy infrastructure, configure a domain, issue
a TLS certificate or verify a public hostname. These require the chosen hosting
account and deployment target.
