# set-check

Monorepo: frontend (React + Vite) and backend (Node + Express).

- **Frontend** is deployed to [GitHub Pages](https://brianmickel.github.io/set-check).
- **Backend** can be deployed to Railway, Render, Fly.io, etc. See `docs/BACKEND_AND_MONOREPO_PLAN.md`.

## Structure

```
set-check/
├── frontend/     # React + Vite app
├── backend/      # Express API (TypeScript)
├── docs/         # Plan and notes
└── package.json  # Root workspaces
```

## Setup

From the repo root:

```bash
npm install
```

This installs dependencies for the root and both workspaces.

## Development

From the repo root:

```bash
# Frontend (Vite dev server, typically http://localhost:5173)
npm run dev:frontend

# Backend (Express on http://localhost:3000)
npm run dev:backend
```

Run both in separate terminals. The frontend proxies `/api` to the backend in dev, so you can call `fetch('/api/health')` without CORS.

## Build

```bash
npm run build:frontend   # Output: frontend/dist
npm run build:backend   # Output: backend/dist
```

## Deploy

- **Frontend:** Pushing to `main` runs the GitHub Actions workflow and deploys `frontend/dist` to GitHub Pages. The workflow runs `npm ci` and `npm run build:frontend` at the root.
- **Backend:** Deploy the `backend/` folder to your chosen host. Set `PORT` and optionally `FRONTEND_ORIGIN` (e.g. `https://brianmickel.github.io`). For production, set `VITE_API_URL` to your backend URL when building the frontend so the app calls the deployed API.

## API base URL

- In **development**, the frontend uses relative `/api` (Vite proxy to the local backend).
- In **production**, set `VITE_API_URL` to your deployed backend URL (e.g. `https://your-api.example.com`) when building the frontend so the built app uses that API. Use the helpers in `frontend/src/api.ts` (`getApiBaseUrl()`, `apiUrl(path)`).
