# Deploying set-check

Two independent GitHub Actions workflows deploy on pushes to `main`. Both can
also be run by hand from the Actions tab (`workflow_dispatch`).

| Piece | Workflow | Triggers on changes to | Target |
|---|---|---|---|
| Frontend (React/Vite) | `.github/workflows/deploy.yml` | `frontend/**`, the workflow file | GitHub Pages |
| API (Cloudflare Worker) | `.github/workflows/deploy-worker.yml` | `worker/**`, the workflow file | Cloudflare Workers (`set-check-api`) |

`.github/workflows/ci.yml` runs build, lint, and tests on pull requests and
pushes to `main`. It does not gate either deploy.

Both deploy workflows use the Node version in `.nvmrc`.

Never commit secret values. `.env`, `.env.*`, and `.dev.vars` are git-ignored;
only the `*.example` files are tracked.

## Frontend → GitHub Pages (`deploy.yml`)

What the workflow does:

1. Moves the root `package.json` / `package-lock.json` aside so `frontend/`
   installs on its own (keeps Rollup's platform-specific optional deps correct).
2. `npm ci` in `frontend/` using `frontend/package-lock.json`.
3. `npm run build` in `frontend/` (runs `generate-cards`, then `tsc -b && vite build`)
   with `VITE_API_URL` from secrets.
4. Restores the root package files, then uploads `frontend/dist` and deploys it
   with `actions/configure-pages`, `actions/upload-pages-artifact`, and
   `actions/deploy-pages` to the `github-pages` environment.

The app is built with `base: "/set-check/"` (see `frontend/vite.config.ts`),
so it is served at `https://<user>.github.io/set-check/`.

Repo settings required:

- **Settings → Pages → Build and deployment → Source: GitHub Actions.**
- Secret **`VITE_API_URL`**: the deployed Worker URL, e.g.
  `https://set-check-api.<subdomain>.workers.dev`. It is baked in at build time.
  If it is unset, the built app calls `/api/...` on its own origin (GitHub Pages),
  which has no API.

## API → Cloudflare Workers (`deploy-worker.yml`)

The job runs in the GitHub environment **`ci`**, so its secrets can be set as
environment secrets on `ci` or as repository secrets.

What the workflow does:

1. `npm ci` at the repo root (npm workspaces; `worker/` resolves through the
   root `package-lock.json`).
2. Requires the `ALLOWED_ORIGINS` secret and substitutes it for the
   `<SET_CHECK_ALLOWED_ORIGINS>` placeholder in `worker/wrangler.toml`
   (the job fails if it is unset).
3. `npm run deploy:worker` → `wrangler deploy` in `worker/`, authenticated by
   `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.

GitHub secrets used by this workflow:

| Secret | Used as | Notes |
|---|---|---|
| `CF_API_TOKEN` | `CLOUDFLARE_API_TOKEN` | Cloudflare API token, e.g. from the "Edit Cloudflare Workers" template |
| `CF_ACCOUNT_ID` | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `ALLOWED_ORIGINS` | `[vars] ALLOWED_ORIGINS` in `wrangler.toml` | Comma-separated CORS origins, e.g. `https://<user>.github.io` |

Bindings and vars committed in `worker/wrangler.toml`:

- `RATE_LIMIT`: KV namespace (rate limits and issued upload keys). The
  namespace id is committed directly; it is an identifier, not a credential.
  To use a different namespace, edit the `id` there.
- `UPLOADS`: R2 bucket `set-check-uploads` (temporary uploads).
- `R2_BUCKET_NAME = "set-check-uploads"`.

### Worker runtime secrets (set in Cloudflare, not GitHub)

Set these with `npx wrangler secret put <NAME> --name set-check-api` (from
`worker/`) or in the Cloudflare dashboard. The deploy workflow does not touch them.

| Name | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | yes | Signs session tokens (HS256) |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | at least one | Vision providers; auto-priority Gemini → Claude → OpenAI. The OpenAI key is only treated as configured if it starts with `sk-`. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | optional | Presigned R2 upload URLs |
| `ALLOWLISTED_IPS` | optional | Comma-separated IPs that bypass rate limiting |
| `INCLUDE_BOUNDING_BOXES` | optional | `false` to skip bounding boxes in analyze |

### One-time Cloudflare setup

`scripts/setup-cloudflare.sh` (needs `npx wrangler login` first) creates the
KV namespace and R2 bucket, sets the Worker secrets interactively, and prints
the values to save. If it creates a new KV namespace, put its id in
`worker/wrangler.toml`.

## Local development

```sh
npm ci                       # root: installs all workspaces
cp worker/.dev.vars.example worker/.dev.vars   # fill in JWT_SECRET and a provider key
npm run dev:worker           # wrangler dev on http://127.0.0.1:8787 (local KV/R2)
npm run dev:frontend         # Vite on http://localhost:5173/set-check/, proxies /api → :8787
```

In `.dev.vars`, `LOCAL_DEV=true` skips rate limits, and an empty
`ALLOWED_ORIGINS` allows only `localhost:5173`.

Checks (the same ones `ci.yml` runs):

```sh
npm run build -w set-check-frontend
npm run lint -w set-check-frontend
npm run test:run -w set-check-frontend
npm run test:run -w set-check-worker
npx tsc --noEmit -p worker
```

The Playwright e2e tests (`npm run e2e:run -w set-check-frontend`) start the
Vite dev server themselves. They need the Worker running for the model
selector to appear.

The `backend/` Express server (`npm run dev:backend`, port 3000) is a legacy
local API. Neither workflow deploys it.
