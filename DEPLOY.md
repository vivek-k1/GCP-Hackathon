# Deploy CivicSync (FastAPI + Vite)

Architecture: **API** on [Render](https://render.com) (or any Python host) and **static UI** on [Vercel](https://vercel.com). The browser calls the API using `VITE_API_URL` (see `civicsync-ui/src/lib/api.ts`).

For a **single-container** deploy (API + UI together), see [§5 Hugging Face Spaces](#5-deploy-on-hugging-face-spaces-docker--api--ui-in-one-container).

## 1. Deploy the API (Render)

1. Push this repo to GitHub (if it is not already).
2. In [Render](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect the repository; select the branch (e.g. `main`). Render will read `render.yaml` in the project root.
4. When asked for **environment variables**, set at least:
   - **`ANTHROPIC_API_KEY`** — required for summarization and agents.
   - **`VOYAGEAI_API_KEY`** — optional; if omitted, retrieval uses BM25 only (still works for demos).
5. Deploy and wait until the service is **Live**. Copy the public URL, e.g. `https://civicsync-api.onrender.com` (no trailing slash).

**Health check:** `GET /health` should return JSON with `"status": "ok"`.

**Cold starts:** The free tier may spin down after inactivity; the first request can take 30–60s.

**Bill PDFs:** Ensure `bills/` in the repo contains the PDF/TXT files referenced in `app/pdf_parser.py` (`BILL_PATHS`). If a file is missing, that bill is skipped on startup (see server logs).

## 2. Deploy the frontend (Vercel)

1. [Vercel](https://vercel.com) → **Add New** → **Project** → import the same GitHub repo.
2. **Root Directory:** set to `civicsync-ui` (this folder has `package.json` and `vite.config.ts`).
3. **Build command:** `npm run build` (default).
4. **Output directory:** `dist` (default for Vite).
5. **Environment variables** (Production):
   - **`VITE_API_URL`** = your Render API origin, e.g. `https://civicsync-api.onrender.com`  
     (no trailing slash, no path).
6. Deploy. Open the Vercel URL; the app will call `VITE_API_URL/health`, `/bills`, etc.

## 3. CORS

The API already allows all origins in `app/main.py`. No change needed for a separate Vercel domain.

## 4. Local dev vs production

- **Local:** Vite proxies `/api` → `http://127.0.0.1:8005` and you usually do not set `VITE_API_URL`.
- **Production (split deploy):** The built JS uses `VITE_API_URL` as the full API base; it does **not** go through the Vite proxy.
- **Production (Docker / HF):** Leave `VITE_API_URL` unset at build time; the UI calls same-origin `/api/*` and FastAPI strips the prefix (`CIVICSYNC_STRIP_API_PREFIX=1`).

## 5. Deploy on Hugging Face Spaces (Docker — API + UI in one container)

This repo ships a **`Dockerfile`** that builds `civicsync-ui` and serves it from FastAPI on port **7860** (HF default). The UI calls **`/api/*`**; the server strips that prefix (same behaviour as the Vite dev proxy).

### Prerequisites

- [Hugging Face account](https://huggingface.co/join)
- [HF CLI](https://huggingface.co/docs/huggingface_hub/guides/cli): `pip install -U huggingface_hub`
- Log in: `hf auth login` (token needs **write** scope)

### 5.1 Create the Space

```bash
hf repos create YOUR_USERNAME/civicsync --type space --space-sdk docker --public --exist-ok
```

Or create via [huggingface.co/new-space](https://huggingface.co/new-space) and choose **Docker** as the SDK.

The root **`README.md`** already includes the required YAML frontmatter (`sdk: docker`, `app_port: 7860`).

### 5.2 Set Space secrets

In the Space → **Settings** → **Variables and secrets**, add (at minimum):

| Secret | Required |
|--------|----------|
| `ANTHROPIC_API_KEY` | **Yes** — summaries and agents |
| `VOYAGEAI_API_KEY` | No — BM25-only fallback works |
| `GEMINI_API_KEY` | For Live Courtroom |
| `KIBANA_URL`, `ELASTIC_API_KEY` | For Elastic MCP search |
| `INDIAN_KANOON_API_TOKEN` | For Kanoon precedent retrieval |
| `BHASHINI_USER_ID`, `BHASHINI_API_KEY` | Optional Hindi translation |

Never commit `.env` — HF injects secrets at container runtime.

### 5.3 Push the repo to the Space

**Option A — git remote (recommended)**

```bash
git remote add space https://huggingface.co/spaces/YOUR_USERNAME/civicsync
git push space main
```

**Option B — upload without full git history**

```bash
hf upload YOUR_USERNAME/civicsync . --repo-type space --exclude ".git/*" --exclude "node_modules/*"
```

HF rebuilds the Docker image on every push. First build may take several minutes (npm + pip).

### 5.4 Verify

- **UI:** `https://huggingface.co/spaces/YOUR_USERNAME/civicsync`
- **Health:** `https://YOUR_USERNAME-civicsync.hf.space/api/health`

```bash
hf spaces logs YOUR_USERNAME/civicsync --tail 100
```

Look for `[OK] Retriever ready for …` and `[OK] Serving static UI from …`.

### 5.5 Bill PDFs and data

Add the four central-act PDFs under **`bills/`** (see `app/pdf_parser.py`) before deploying if you want the full demo set. Missing files are skipped at startup.

Optional: place **`data/bills_states.csv`** for the State Bills browser.

### 5.6 Local Docker smoke test

```bash
docker build -t civicsync .
docker run --rm -p 7860:7860 --env-file .env civicsync
```

Open `http://localhost:7860` (UI) and `http://localhost:7860/api/health` (API).

### HF troubleshooting

| Issue | What to check |
|--------|----------------|
| Build fails on `npm ci` | `civicsync-ui/package-lock.json` committed; run `npm install` locally and commit lockfile. |
| UI loads but API 404 | `CIVICSYNC_STRIP_API_PREFIX=1` set in Dockerfile; calls must use `/api/…`. |
| Blank page / 502 on first load | Cold start while bills index; check `hf spaces logs`. |
| AI features error | `ANTHROPIC_API_KEY` set as a **secret** in Space settings. |
| Live Courtroom disabled | Add `GEMINI_API_KEY`, `KIBANA_URL`, `ELASTIC_API_KEY`. |

---

## 6. Troubleshooting (Render + Vercel)

| Issue | What to check |
|--------|----------------|
| UI shows “Failed to fetch” | `VITE_API_URL` set on Vercel for **Production**; redeploy after changing env. |
| API 502 / timeout on first hit | Free Render cold start; retry after ~1 minute. |
| No bills in `/bills` | PDFs missing from `bills/` in the deployed branch; check Render logs. |
| Embeddings slow or missing | Add `VOYAGEAI_API_KEY` on Render; or rely on BM25-only. |
