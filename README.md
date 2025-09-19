# 401k Tracker

A lightweight interface for managing 401k snapshots with GitHub as persistent storage.

## Security & Env

- Set `API_SHARED_TOKEN` and `CORS_ORIGIN` in your environment (`.env.local` for local dev, real secrets via Vercel/Vault in production). The same value must be exposed to the client as `VITE_401K_TOKEN` (or `NEXT_PUBLIC_401K_TOKEN` when rendering server-side) if the browser will call the APIs directly.
- Both `/api/push` and `/api/snapshot` require the `X-401K-Token` header. Adjust frontend calls to include it, for example:

  ```js
  fetch('/api/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-401K-Token': import.meta.env.VITE_401K_TOKEN ?? 'dev-only-token',
    },
    body: JSON.stringify(snapshot),
  });
  ```

- For local testing only, you can temporarily bypass snapshot auth with `DISABLE_SNAPSHOT_AUTH=1`. Never enable this in production.
- CORS is restricted to the single origin defined in `CORS_ORIGIN`; unset defaults to `http://localhost:3000` when `NODE_ENV !== 'production'` and `'null'` otherwise.
- API responses set `Cache-Control: no-store` and avoid logging secrets; validation errors report only minimal context.

### Example curl checks

```bash
# Missing token is rejected
curl -i -X POST https://<host>/api/push -H "Content-Type: application/json" -d '{}' 

# Correct token reaches validation
curl -i -X POST https://<host>/api/push \
  -H "X-401K-Token: <token>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Snapshot requires the shared token unless DISABLE_SNAPSHOT_AUTH=1
curl -i -X GET https://<host>/api/snapshot -H "X-401K-Token: <token>"
```

Remember to provision the existing GitHub-related environment variables (`GITHUB_PAT`, `GITHUB_USERNAME`, `GITHUB_REPO`, `GITHUB_BRANCH`, `GITHUB_DATA_PATH`) so commits continue to succeed.

### Local development API

- The Vite dev server now mounts the serverless functions so `/api/snapshot` and `/api/push` work during `npm run dev`.
- Provide the required secrets in `.env.local` (not checked in):

  ```bash
  API_SHARED_TOKEN=...
  VITE_401K_TOKEN=... # must match API_SHARED_TOKEN
  GITHUB_PAT=...
  GITHUB_USERNAME=...
  GITHUB_REPO=...
  GITHUB_BRANCH=main
  GITHUB_DATA_PATH=data/401k-data.json
  ```

- If you use a different dev origin, set `CORS_ORIGIN` accordingly so the API responses include the right header.
