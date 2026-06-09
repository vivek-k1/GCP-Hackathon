# Deploy CivicSync (FastAPI + Vite)

Architecture: **API** on [Render](https://render.com) (or any Python host) and **static UI** on [Vercel](https://vercel.com). The browser calls the API using `VITE_API_URL` (see `civicsync-ui/src/lib/api.ts`).

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
- **Production:** The built JS uses `VITE_API_URL` as the full API base; it does **not** go through the Vite proxy.

## 5. Troubleshooting

| Issue | What to check |
|--------|----------------|
| UI shows “Failed to fetch” | `VITE_API_URL` set on Vercel for **Production**; redeploy after changing env. |
| API 502 / timeout on first hit | Free Render cold start; retry after ~1 minute. |
| No bills in `/bills` | PDFs missing from `bills/` in the deployed branch; check Render logs. |
| Embeddings slow or missing | Add `VOYAGEAI_API_KEY` on Render; or rely on BM25-only. |
