# Plan: Add Backend & Monorepo Structure

This document outlines the plan to add a backend, restructure the repo into `frontend/` and `backend/` at the top level, and keep GitHub Pages + backend deployment working without CORS issues.

---

## 1. Target Repository Structure

```
set-check/
├── .github/
│   └── workflows/
│       ├── deploy.yml          # GitHub Pages (frontend)
│       └── deploy-backend.yml  # (optional) Backend deploy
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── eslint.config.js
│   ├── public/
│   │   └── vite.svg
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── App.css
│       ├── index.css
│       ├── MultiSelect.tsx
│       └── assets/
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   └── index.ts
│   └── (framework-specific files)
├── docs/
│   └── BACKEND_AND_MONOREPO_PLAN.md
├── README.md
└── .gitignore
```

---

## 2. Moving Existing Frontend into `frontend/`

### 2.1 Files to move

- **Root → `frontend/`:**  
  `index.html`, `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `public/`, `src/`, `index.html`

### 2.2 Config updates inside `frontend/`

- **`frontend/vite.config.ts`**  
  - Keep `base: "/set-check/"` so GitHub Pages (repo name as path) still works.
- **`frontend/package.json`**  
  - Update `"name": "set-check-frontend"` (optional).  
  - Keep scripts; no path changes needed if all paths are relative within `frontend/`.
- **`frontend/tsconfig.app.json`**  
  - `"include": ["src"]` remains correct (paths relative to `frontend/`).
- **Root `tsconfig.json`**  
  - Either remove (if you no longer build from root) or turn into a minimal root that references `frontend/` and `backend/` for IDE/workspace support (see 2.4).

### 2.3 Root after move

- Root keeps: `.github/`, `README.md`, `.gitignore`, `docs/`, and optionally a root `package.json` with workspaces or convenience scripts (e.g. `npm run build --workspace=frontend`).

### 2.4 Optional root `package.json` (workspaces)

```json
{
  "name": "set-check",
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev:frontend": "npm run dev -w frontend",
    "dev:backend": "npm run dev -w backend",
    "build:frontend": "npm run build -w frontend",
    "build:backend": "npm run build -w backend"
  }
}
```

If you use this, run `npm install` from root after creating `frontend/` and `backend/` so `node_modules` are hoisted and workspaces linked.

---

## 3. GitHub Pages Workflow (Keep It Working)

Current workflow: checkout → `npm ci` → `npm run build` → upload `./dist` → deploy.

After moving the app into `frontend/`:

- **Install and build must run in `frontend/`.**  
  - Either `cd frontend && npm ci && npm run build`, or use a root workspace and run the frontend build from root (e.g. `npm run build:frontend`).
- **Artifact path must be the frontend build output.**  
  - If building in `frontend/`, set `path` to `./frontend/dist`.

### Example updated `.github/workflows/deploy.yml`

```yaml
# ... (permissions, concurrency, on: unchanged)

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5
      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          node-version: lts/*
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
      - name: Install dependencies
        run: npm ci
        working-directory: frontend
      - name: Build
        run: npm run build
        working-directory: frontend
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: "./frontend/dist"
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

If you use a root workspace and `npm ci` at root:

- Use `cache-dependency-path: package-lock.json` and run `npm run build:frontend` (or `npm run build -w frontend`) at root; artifact stays `./frontend/dist`.

---

## 4. Backend Stack and Layout

### 4.1 Suggested stack

- **Runtime:** Node.js (LTS).
- **Language:** TypeScript.
- **Framework:** Express (or Fastify) for a simple REST API; minimal setup and easy to add CORS and health routes.

### 4.2 Backend layout (Express + TS example)

```
backend/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── routes/
│   │   └── api.ts
│   └── middleware/
│       └── cors.ts
```

- **`src/index.ts`**  
  - Create app, use CORS middleware, mount routes (e.g. `/api`), start server; read `PORT` from env.
- **CORS**  
  - Allow origin `https://brianmickel.github.io` (and optionally `http://localhost:5173` for dev).  
  - In production, set `Access-Control-Allow-Origin` to the exact Pages origin or use a small allowlist to avoid CORS errors.

### 4.3 Frontend ↔ Backend in development

- **Vite proxy (frontend):**  
  In `frontend/vite.config.ts`, add:

  ```ts
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  ```

  Then the frontend can call `fetch("/api/...")` in dev; Vite forwards to the backend. No CORS needed in dev if both run locally and only the browser talks to Vite.

- **Production:**  
  Frontend (on GitHub Pages) will call the **backend’s public URL** (e.g. `https://your-backend.up.railway.app/api/...`). The backend must allow that Pages origin in CORS (see below).

---

## 5. Deploying the Backend So the API Works (No CORS Issues)

### 5.1 Why CORS appears

- GitHub Pages serves the frontend from `https://brianmickel.github.io/set-check/`.
- The browser loads that page, then JavaScript runs and calls your backend (e.g. on Railway/Render).
- That’s a **cross-origin** request. The backend must respond with `Access-Control-Allow-Origin: https://brianmickel.github.io` (or the exact origin you use) for the browser to allow the response. Otherwise you get CORS errors.

### 5.2 Backend: set CORS correctly

- **Allow your Pages origin:**  
  `https://brianmickel.github.io`  
  (and in dev, `http://localhost:5173` or whatever Vite uses).
- **Do not use `*` for credentialed requests** if you add cookies/auth later; use an explicit allowlist.
- Example (Express):

  ```ts
  import cors from "cors";

  const allowedOrigins = [
    "https://brianmickel.github.io",
    "http://localhost:5173",
  ];
  app.use(cors({ origin: allowedOrigins }));
  ```

- Deploy the backend with an env var like `FRONTEND_ORIGIN=https://brianmickel.github.io` and build `allowedOrigins` from it so you can change it without code changes.

### 5.3 Where to host the backend

- **Railway / Render / Fly.io:**  
  - Good for a single Node server.  
  - Deploy from `backend/` (or from root with build command running in `backend/`).  
  - Set `PORT` as provided by the platform; expose one public URL (e.g. `https://set-check-api.up.railway.app`).
- **Vercel / Netlify (serverless):**  
  - Use serverless functions under `/api`.  
  - Configure CORS in the function response (e.g. same `Access-Control-Allow-Origin` header).  
  - Repo layout can stay “frontend + backend”; backend becomes a set of serverless handlers.

Choose one and stick to it so the workflow (and CORS) is consistent.

### 5.4 Frontend: use the right API base URL

- **Development:**  
  Use relative URLs like `/api/...` so Vite’s proxy sends requests to your local backend (no CORS).
- **Production:**  
  Use an env-driven base URL for the API, e.g.:

  - Vite: `import.meta.env.VITE_API_URL` (e.g. `https://set-check-api.up.railway.app`).
  - Build the frontend with `VITE_API_URL=https://your-backend-url` so the built app calls the deployed backend.
  - GitHub Pages doesn’t inject env at runtime; the URL is baked in at build time. So either:
    - Set `VITE_API_URL` in the GitHub Actions “Build” step (env or vars), or  
    - Default in code to your production API URL and override only for local dev.

### 5.5 Summary: no CORS issues

1. **Backend:** Enable CORS and allow `https://brianmickel.github.io` (and dev origin).
2. **Frontend:** In production, call the deployed backend URL (via `VITE_API_URL`); in dev, use `/api` and Vite proxy.
3. **Deploy backend** to one host (Railway/Render/Fly/Vercel/Netlify), expose one HTTPS URL, and point the frontend at it.

---

## 6. Implementation Order

1. **Create `frontend/` and move code**  
   Move all current app files into `frontend/`, fix any path references, and ensure `npm run build` and `npm run dev` work from `frontend/`.

2. **Update GitHub Actions**  
   Point install/build to `frontend/` and artifact to `./frontend/dist`. Run the workflow and confirm the site still works on GitHub Pages.

3. **Scaffold `backend/`**  
   Add `backend/` with Node + TypeScript + Express (or chosen stack), health route, and CORS middleware allowing the Pages and local dev origins.

4. **Frontend API usage**  
   Add a small API client or `fetch` wrapper that uses `import.meta.env.VITE_API_URL` in production and `/api` (proxy) in dev; use it from the app.

5. **Deploy backend**  
   Deploy `backend/` to your chosen provider; set `VITE_API_URL` (or default) in the frontend build and redeploy the frontend so it points at the live API.

6. **(Optional) Root workspace**  
   Add root `package.json` with workspaces and scripts for `dev:frontend`, `dev:backend`, and build commands.

---

## 7. Checklist

- [ ] All frontend code lives under `frontend/` and builds from there.
- [ ] `frontend/vite.config.ts` keeps `base: "/set-check/"`.
- [ ] `.github/workflows/deploy.yml` uses `frontend/` for install/build and `./frontend/dist` for the artifact.
- [ ] Backend has CORS allowing `https://brianmickel.github.io` and local dev origin.
- [ ] Frontend uses env-based API URL (`VITE_API_URL`) and dev proxy for `/api`.
- [ ] Backend deployed to a single HTTPS host; frontend build uses that URL in production.
- [ ] README updated with how to run frontend and backend locally and how the app is deployed (Pages + backend host).

This structure keeps the repo clear, preserves GitHub Pages, and ensures the API works without CORS issues once the backend is deployed and CORS and `VITE_API_URL` are set correctly.
