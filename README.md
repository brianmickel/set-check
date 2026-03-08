# set-check

[Partially built with Cursor]

Monorepo: frontend (React + Vite), backend (Node + Express), and API worker (Cloudflare Workers).

- **Frontend** is deployed to [GitHub Pages](https://brianmickel.github.io/set-check).
- **API (Worker)** provides session, upload, and analyze (OpenAI Vision). Deploy to Cloudflare Workers. See `docs/BACKEND_PLAN.md`.
- **Backend (Express)** is optional; the Worker is the primary API for the upload/analyze flow.

## Structure

```
set-check/
├── frontend/     # React + Vite app (upload photo → see cards / Has Set?)
├── backend/      # Express API (TypeScript)
├── worker/       # Cloudflare Worker (session, upload, analyze)
├── docs/         # Plan and notes
└── package.json  # Root workspaces
```

## Setup

From the repo root:

```bash
npm install
```

This installs dependencies for the root and all workspaces.

## Running locally

Everything needed to run locally is in place:

| Piece | What you need |
|-------|----------------|
| **Frontend** | `npm run dev:frontend` — no env. Vite serves on port 5173 and proxies `/api` to the worker. |
| **Worker** | `npm run dev:worker` — needs `worker/.dev.vars` with `OPENAI_API_KEY`, `JWT_SECRET`, and `LOCAL_DEV=true` (skips rate limits locally). Copy from `worker/.dev.vars.example`. KV and R2 are **local** in `wrangler dev` (no Cloudflare account required). |
| **Backend (optional)** | `npm run dev:backend` — needs `backend/.env` (e.g. copy from `backend/.env.example`) with `PORT`; dotenv loads it. |

**Upload/analyze flow (frontend + worker):**

1. **One-time:** Copy `worker/.dev.vars.example` → `worker/.dev.vars` and set:
   - `LOCAL_DEV=true` (skips rate limits so you don’t get 429 locally)
   - `OPENAI_API_KEY` (from OpenAI)
   - `JWT_SECRET` (any string, e.g. 32+ chars)
2. **Worker:** Create a KV namespace for production deploy later: `cd worker && npx wrangler kv namespace create RATE_LIMIT` and put the returned `id` in `wrangler.toml` under `[[kv_namespaces]]`. For **local only**, `wrangler dev` uses local KV/R2; the placeholder id in `wrangler.toml` is only used when deploying.
3. **Run:** From repo root, in two terminals:
   - `npm run dev:worker` (starts on port 8787)
   - `npm run dev:frontend` (starts on port 5173)
4. Open **http://localhost:5173/set-check/** (or the URL Vite prints). Choose a photo → analyzing… → cards / Has Set?

No Cloudflare account is required for local worker dev: KV and R2 are simulated locally (Miniflare). The placeholder `id` in `wrangler.toml` for `RATE_LIMIT` is only replaced with a real namespace id when you deploy; for `wrangler dev` it is ignored and local KV is used.

## Development

**Upload/analyze flow (Worker):**

```bash
# Terminal 1: Worker (session, upload, analyze) — default port 8787
npm run dev:worker

# Terminal 2: Frontend (Vite) — http://localhost:5173
npm run dev:frontend
```

Set Worker secrets for local dev (in `worker/`): either use `wrangler secret put` or copy `worker/.dev.vars.example` to `worker/.dev.vars` and set `OPENAI_API_KEY`, `JWT_SECRET` (and optional R2 keys). Wrangler loads `.dev.vars` in `wrangler dev`. For production deploy, set the Worker **var** `ALLOWED_ORIGINS` to your frontend origin (e.g. `https://your-user.github.io`) so CORS allows the deployed app.

Create KV namespace and R2 bucket, then set `wrangler.toml`:

```bash
npx wrangler kv namespace create RATE_LIMIT
# Put the id in wrangler.toml [[kv_namespaces]].id
npx wrangler r2 bucket create set-check-uploads
```

The frontend proxies `/api` to `http://127.0.0.1:8787` in dev. Session is fetched silently on load; user flow is: choose photo → analyzing… → cards / Has Set?

**Express backend (optional):**

Copy `backend/.env.example` to `backend/.env` and set `PORT` (default 3000), optionally `FRONTEND_ORIGIN`. The backend loads `.env` via dotenv.

```bash
npm run dev:backend   # port 3000
```

To point the frontend at Express instead, change the proxy target in `frontend/vite.config.ts` to `http://localhost:3000`.

## Build

```bash
npm run build:frontend   # frontend/dist
npm run build:backend    # backend/dist
```

The Worker is deployed with Wrangler (no separate build step).

## Deploy

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for full steps: accounts (GitHub, Cloudflare, OpenAI), environment variables, secrets (no secrets in the repo), and one-time setup.

- **Frontend:** Push to `main` → GitHub Actions deploys to GitHub Pages. Set the `VITE_API_URL` repo secret to your Worker URL so the built app calls your API.
- **Worker:** Push to `main` runs the Deploy Worker workflow (set `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `KV_NAMESPACE_ID` in repo Secrets). Set `OPENAI_API_KEY` and `JWT_SECRET` in Cloudflare (Dashboard or `wrangler secret put`)—never in the repo. **Production:** Set the Worker **var** `ALLOWED_ORIGINS` to your frontend origin(s) (e.g. `https://your-user.github.io`). The default in `wrangler.toml` is a placeholder that only allows localhost; if you leave it, browser requests from your deployed frontend will get 403 Forbidden.

## API (Worker)

- `GET /api/health` — status and which vision providers are configured (no auth).
- `POST /api/session` — returns `{ token }` (JWT); frontend calls silently. Rate limited by IP.
- `POST /api/presign-upload` — returns presigned R2 PUT URL and key (Bearer).
- `POST /api/upload` — `multipart/form-data` with `file` (image). Returns `{ uploadKey }`. Bearer.
- `GET /api/uploads` — list current session’s upload keys. Bearer.
- `GET /api/image?key=...` — serve uploaded image by key (no auth; key is UUID).
- `DELETE /api/image?key=...` — delete upload by key after ownership check. Bearer.
- `POST /api/analyze` — body `{ uploadKey }` and optional `{ provider }`. Returns `{ cards }` (and `fromCache` when from cache). Bearer.
- `POST /api/analyze/confirm` — body `{ uploadKey, cards, provider? }`. Caches result for this image. Bearer.
- `POST /api/analyze/invalidate` — body `{ uploadKey }`. Clears cached analysis for this image. Bearer.

Session and auth are invisible to the user; errors surface as friendly messages (e.g. “Something went wrong — try again later”).
