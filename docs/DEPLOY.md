# Deploying Vellam Map (optional)

The repository is meant to be **run locally with your own Meta API key** (see the README). Hosting it is
optional, and worth thinking about first: every report and every question spends credits on the key the
server holds, so a public instance lets anyone spend them. The built-in per-client limits
(`REPORTS_PER_HOUR`, `ASKS_PER_HOUR`) slow a casual abuser down; they do not stop a determined one.

If you still want a public demo, the configuration is ready:

| Part | Where | Config |
|---|---|---|
| API | Render (Docker) | `render.yaml`, `backend/Dockerfile` |
| Frontend | Vercel | `frontend/vercel.json`, root directory `frontend` |

1. **API on Render:** New → Blueprint → select the repo. Set the secret `META_API_KEY`. Keep the free plan
   for a demo: there is no persistent disk, so data resets on restart, and `SEED_DEMO=1` refills the map with
   labelled demo reports. For real use, take a paid plan and uncomment the `disk` block.
2. **Frontend on Vercel:** import the repo, root directory `frontend`. Set `VITE_API_BASE` to the Render URL
   (no trailing slash), and optionally `VITE_TOMTOM_KEY`. The production domain feeds the link-preview tags
   automatically; elsewhere set `VITE_SITE_URL`.
3. **Close the loop:** set `CORS_ORIGINS` on Render to the Vercel URL. Restrict the TomTom key to that domain.
4. **Limit exposure:** lower `REPORTS_PER_HOUR` and `ASKS_PER_HOUR`, set a spending cap on your Meta account
   if it offers one, and set `ADMIN_TOKEN` so you can remove abusive reports.

Free instances sleep after about 15 minutes idle; the first request afterwards takes around a minute.
