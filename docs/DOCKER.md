# Running GymPal with Docker

This guide runs GymPal and its PostgreSQL database in containers, first on your own machine and then on a server with HTTPS.

## What's in the repo

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build. The final image holds only Next.js's standalone server (about 85 MB of app files on `node:22-bookworm-slim`) and runs as the unprivileged `node` user. |
| `docker-compose.yml` | Three services: `db` (PostgreSQL 17), `migrate` (applies migrations and seeds exercises, then exits) and `app`. |
| `.dockerignore` | Keeps `.env`, `node_modules`, build output and tests out of the build context. Secrets are never baked into the image. |
| `src/app/api/health/route.ts` | `GET /api/health` returns `{"ok":true}` when the app can reach the database. The image's `HEALTHCHECK` uses it. |

How the stages fit together:

```
deps ──► source ──┬──► migrate   (prisma migrate deploy && prisma db seed)
                  └──► build ──► runner   (node server.js on :3000)
```

`next.config.ts` switches to `output: "standalone"` only when `NEXT_OUTPUT=standalone` is set, which the `build` stage does. `npm run dev`, `npm start` and the e2e tests are unchanged.

## 1. Prerequisites

- **Docker Desktop** (Windows/macOS) or Docker Engine with the Compose plugin (Linux).
- **On Windows with WSL:** Docker Desktop → Settings → Resources → **WSL integration** → turn on your distro (e.g. Ubuntu) → Apply & restart. Check from WSL:

  ```bash
  docker info --format '{{.ServerVersion}}'   # prints a version, not an error
  ```

## 2. Configure `.env`

Compose reads `.env` in the project folder. Add or check these values:

```bash
# Database password for the bundled Postgres (pick a long random value)
POSTGRES_PASSWORD="$(openssl rand -hex 24)"     # paste the output, not this command

# Auth: keep your existing secret, or generate one with: openssl rand -base64 32
BETTER_AUTH_SECRET="..."
# The exact URL people open in the browser (scheme + host + port)
BETTER_AUTH_URL="http://localhost:3000"

# AI provider: same values as for `npm run dev` (see README)
OPENAI_API_KEY="..."
OPENAI_BASE_URL="https://api.deepseek.com"
OPENAI_MODEL="deepseek-flash"
OPENAI_SMART_MODEL="deepseek-v4-pro"
OPENAI_PLAN_MODEL="deepseek-flash"
OPENAI_REASONING_EFFORT="low"
AI_MOCK="0"

# Optional: host port (default 3000)
# APP_PORT="3001"
```

You don't need to change `DATABASE_URL` in `.env`. Compose gives the containers their own connection string to the `db` service, and `npm run dev` keeps using yours.

## 3. Start it

```bash
docker compose up -d --build
docker compose logs -f migrate app      # Ctrl+C to stop following
```

The first build takes a few minutes. Compose starts `db`, waits until it's healthy, then runs `migrate`. When that finishes successfully it starts `app`. Open <http://localhost:3000> and create an account.

> `npm run dev` also uses port 3000. Stop it first, or set `APP_PORT="3001"` **and** `BETTER_AUTH_URL="http://localhost:3001"`. Better Auth rejects sign-ins from any other origin with "Invalid origin".

Check health:

```bash
docker compose ps                        # app should show "healthy"
curl http://localhost:3000/api/health    # {"ok":true}
```

## 4. Everyday commands

| Task | Command |
|---|---|
| Stop (keeps data) | `docker compose down` |
| Update after `git pull` | `docker compose up -d --build` (runs new migrations automatically) |
| App logs | `docker compose logs -f app` |
| Database shell | `docker compose exec db psql -U gympal gympal` |
| Back up the database | `docker compose exec -T db pg_dump -U gympal -Fc gympal > gympal-$(date +%F).dump` |
| Restore a backup | `docker compose exec -T db pg_restore -U gympal -d gympal --clean --if-exists < gympal-2026-10-20.dump` |
| Re-run migrations and seed | `docker compose run --rm migrate` |
| **Delete everything, data included** | `docker compose down -v` |

Data lives in the `pgdata` volume, so it survives `down`, rebuilds and restarts. Only `down -v` removes it.

## 5. Put it on a server with HTTPS

You need HTTPS for the phone camera (barcode scanning, meal photos), for installing the app to the home screen, and for secure cookies. One way is a small VPS (1 vCPU, 1–2 GB RAM is enough) with a domain pointing at it, plus [Caddy](https://caddyserver.com), which gets certificates automatically.

1. On the server, install Docker, then clone the repo and create `.env` as in step 2, with:

   ```bash
   BETTER_AUTH_URL="https://gym.example.com"
   ```

2. Create `docker-compose.override.yml` next to `docker-compose.yml`. Compose merges it in automatically. `!reset` needs Compose 2.24 or newer (`docker compose version`).

   ```yaml
   services:
     app:
       ports: !reset []          # don't expose the app directly; Caddy fronts it
     caddy:
       image: caddy:2
       restart: unless-stopped
       ports:
         - "80:80"
         - "443:443"
       volumes:
         - ./Caddyfile:/etc/caddy/Caddyfile:ro
         - caddy_data:/data
       depends_on:
         - app

   volumes:
     caddy_data:
   ```

3. Create `Caddyfile`:

   ```
   gym.example.com {
       encode zstd gzip
       reverse_proxy app:3000
   }
   ```

4. Start it: `docker compose up -d --build`. Caddy fetches a certificate on the first request to the domain.

5. Firewall: allow only ports 22, 80 and 443. The database port is never published, so Postgres is reachable only from the other containers.

**Back up** with the `pg_dump` command above on a schedule (e.g. a daily cron job) and copy the files off the server.

## 6. Hosted Postgres or a container platform

To use a managed database (Neon, Supabase, RDS) or a platform that runs one container from a Dockerfile (Railway, Render, Fly.io, Cloud Run):

```bash
# Build the two images
docker build --target runner  -t gympal-app .
docker build --target migrate -t gympal-migrate .

# Apply migrations + seed (run on every deploy, before the new app starts)
docker run --rm -e DATABASE_URL="postgres://USER:PASS@HOST:5432/DB?sslmode=require" gympal-migrate

# Run the app
docker run -d -p 3000:3000 \
  -e DATABASE_URL="postgres://USER:PASS@HOST:5432/DB?sslmode=require" \
  -e DATABASE_POOL_MAX=10 \
  -e BETTER_AUTH_SECRET=... -e BETTER_AUTH_URL=https://gym.example.com \
  -e OPENAI_API_KEY=... -e OPENAI_BASE_URL=https://api.deepseek.com \
  -e OPENAI_MODEL=deepseek-flash -e OPENAI_SMART_MODEL=deepseek-v4-pro -e OPENAI_PLAN_MODEL=deepseek-flash \
  gympal-app
```

On platforms with a "release command" or "pre-deploy job", use the `migrate` target for it. Set the health check path to `/api/health`.

**Request timeouts:** the AI coach streams its answer, but with `deepseek-v4-pro` a reply that uses several tools has taken over 4 minutes. Platforms that cut off requests after 30–60 s will interrupt it. Raise the timeout, or set `OPENAI_SMART_MODEL="deepseek-flash"`.

**More than one app container:** run copies of the *same* image. Next.js generates the Server Actions encryption key at build time and embeds it, so containers from one image agree. If you build the image separately on each server, pass the same key to every build, otherwise form actions fail with "Failed to find Server Action". To do that, add `ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to the `build` stage and pass `--build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(openssl rand -base64 32)"`, using one saved value everywhere.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Set POSTGRES_PASSWORD in .env` / `Set BETTER_AUTH_SECRET in .env` | Add the value to `.env` (step 2). |
| Sign-in fails with "Invalid origin" | `BETTER_AUTH_URL` must match the address in the browser exactly, including `https` and port. Restart with `docker compose up -d`. |
| `migrate` exits with an error, `app` never starts | `docker compose logs migrate`. Usually a wrong password after changing `POSTGRES_PASSWORD`: the volume keeps the original password. Change it back, or reset with `down -v` (deletes data). |
| `app` is "unhealthy" | `curl localhost:3000/api/health`. A 503 means the database is unreachable; check `docker compose ps db`. |
| Barcode camera says it isn't available | The page isn't on HTTPS (or `localhost`). Use step 5, or type the number. |
| AI answers are fixtures ("Mock coach…") | `AI_MOCK` is `1` or `OPENAI_API_KEY` is empty in `.env`. |
| Port 3000 already in use | Stop `npm run dev`, or use `APP_PORT` (step 3). |
| `docker` works in PowerShell but not WSL | Turn on WSL integration (step 1). |
