---
name: docker-compose-stack
description: Use when working with the ModestWear Docker setup: docker-compose.yml, docker-compose.prod.yml, Dockerfiles, run.sh, or any local-dev/prod container orchestration concern.
---

# Docker Compose Stack Skill

## Overview
ModestWear runs as 4 containers in dev:
- `postgres` (PostgreSQL 16, with healthcheck)
- `backend` (FastAPI on :8000)
- `frontend` (Next.js on :3000)
- `nginx` (reverse proxy on :80, optional in dev)

Production overlay (`docker-compose.prod.yml`) swaps the frontend image for a built/static one and tightens env. The orchestrator is `run.sh`.

## When to use this skill
- Editing `docker-compose.yml`, `docker-compose.prod.yml`
- Editing either `Dockerfile` (backend or frontend)
- Editing `run.sh`
- Debugging "container won't start" or "port already in use"
- Adding a new service (Redis, Meilisearch, etc.)
- Configuring volumes, networks, healthchecks

## The uncommitted `run.sh` PATH trick

The current uncommitted change to `run.sh` adds `export PATH="$HOME/.local/bin:$PATH"` before checking for `docker compose`. **This is the correct fix** for systems where the Compose plugin is installed via Homebrew, pipx, or the Docker Desktop CLI plugin path but not symlinked into `/usr/local/bin`. Keep it.

## Compose version: prefer `docker compose` (v2)

```yaml
# ✓ Correct
services:
  backend:
    ...

# ✗ Avoid (v1 is deprecated since 2023)
version: "3.9"
```

Omit the top-level `version:` key. Compose v2 ignores it; including it triggers a warning.

## Service ordering with healthchecks

Postgres must be healthy before backend starts. The pattern in the current compose file (use it):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER -d $POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 5
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-modestwear}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-modestwear}
      POSTGRES_DB: ${POSTGRES_DB:-modestwear}

  backend:
    build: ./backend
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
```

**`depends_on` with `condition: service_healthy` is mandatory** for Postgres. Without it, backend crashes on first connection.

## Environment variable handling

Three sources of env, in priority order:
1. Shell env (when running `docker compose up`)
2. `.env` in repo root (read by Compose)
3. `environment:` block in compose file (lowest priority, with `${VAR:-default}`)

The `setup_env()` function in `run.sh` creates `backend/.env` from `.env.example`. **Compose does NOT read `backend/.env` directly** — it reads the root `.env`. Either:
- Keep secrets in root `.env` and pass them via `${...}` interpolation
- Or mount `backend/.env` into the container: `volumes: ["./backend/.env:/app/.env:ro"]`

Pick one and document it. The current setup uses the second pattern (mount). If you switch to the first, remove the `volumes:` line.

## Backend Dockerfile (current pattern)

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Add a non-root user** before production:

```dockerfile
RUN adduser --disabled-password --gecos '' appuser
USER appuser
```

For dev, `--reload` is convenient; for prod, run multiple workers:

```dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

## Frontend Dockerfile

Dev: bind-mount source, run `npm run dev`. Prod: `npm run build` then `npm run start`, with standalone output mode for smaller images.

```dockerfile
# Multi-stage for prod
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Requires `next.config.ts` to have `output: "standalone"`.

## `run.sh` command matrix

| Command | Purpose |
|---|---|
| `./run.sh` (no args) | Print usage |
| `./run.sh docker` | `docker compose up -d` |
| `./run.sh docker-build` | `docker compose build --no-cache` |
| `./run.sh stop` | `docker compose down` |
| `./run.sh dev` | Print manual dev instructions |
| `./run.sh backend-dev` | Local venv + uvicorn (no Docker) |
| `./run.sh frontend-dev` | Local `npm run dev` (no Docker) |
| `./run.sh dev-tmux` | Backend + frontend in tmux sessions |
| `./run.sh prod` | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |
| `./run.sh setup` | Install deps only |

## Prod overlay pattern

`docker-compose.prod.yml` extends the dev file. Merge order matters: `-f base -f prod` means prod wins on conflicts.

```yaml
# docker-compose.prod.yml
services:
  frontend:
    build:
      target: runner  # uses the prod stage
    environment:
      NODE_ENV: production
  backend:
    command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

## Common issues

| Symptom | Cause | Fix |
|---|---|---|
| `bind: address already in use` on :3000 | Orphaned process from prior run | `lsof -i :3000` → `kill <pid>` or `./run.sh stop` |
| Backend "connection refused" to postgres | Race condition on startup | Already handled by `service_healthy` |
| `Cannot connect to Docker daemon` | Docker Desktop not running | Start it; `docker info` to verify |
| `docker-compose: command not found` | Only v2 plugin installed | The `run.sh` PATH fix handles this |
| `alembic` fails inside container | DB URL points to localhost | Use service name `postgres`, not `localhost` |
| Frontend can't reach backend (CORS) | Browser hitting :8000 directly | Frontend should call Next.js API routes, which proxy to backend; never expose :8000 to the browser in prod |
| Hot reload not working in dev | `volumes:` missing or `CHOKIDAR_USEPOLLING` not set | Add `--polling` flag in compose, or use `webpack` config in dev |

## Volumes

```yaml
volumes:
  postgres_data:  # named volume, persists across `docker compose down`
  node_modules:   # anonymous, but bind-mount preserves host's node_modules
```

**Never `docker compose down -v` in dev** — it deletes the named volume and wipes the database. Use `docker compose down` (no `-v`).

## Things to never do

- Never commit `.env` files with real secrets. Only `.env.example` with placeholders.
- Never use `latest` tag for production images. Pin versions: `postgres:16-alpine`, `python:3.12-slim`, `node:20-alpine`.
- Never run `docker system prune -a` in a shared environment without confirmation.
- Never bind-mount `node_modules` from host into container — it has wrong arch. Use anonymous volume: `volumes: ["/app/node_modules"]`.
- Never put `version: "3.x"` at the top of compose files. It's obsolete.
