# set-check

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

Set Worker secrets for local dev (in `worker/`): either use `wrangler secret put` or copy `worker/.dev.vars.example` to `worker/.dev.vars` and set `OPENAI_API_KEY`, `JWT_SECRET` (and optional R2 keys). Wrangler loads `.dev.vars` in `wrangler dev`.

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

- **Frontend:** Push to `main` → GitHub Actions deploys `frontend/dist` to GitHub Pages.
- **Worker:** From root, `npm run deploy:worker` (or `cd worker && npx wrangler deploy`). Set secrets in Cloudflare dashboard or `wrangler secret put`. Set `VITE_API_URL` to your Worker URL when building the frontend for production.
- **API base URL:** In production, set `VITE_API_URL` to your Worker URL (e.g. `https://set-check-api.<your-subdomain>.workers.dev`) so the app calls the deployed API.

## API (Worker)

- `GET /api/health` — ok
- `POST /api/session` — returns `{ token }` (JWT); frontend calls silently.
- `POST /api/upload` — `multipart/form-data` with `file` (image). Returns `{ uploadKey }`.
- `POST /api/analyze` — body `{ uploadKey }`. Returns `{ cards: string[] }`.

Session and auth are invisible to the user; errors surface as friendly messages (e.g. “Something went wrong — try again later”).
