# Deployment: Railway backend and Vercel frontend

Both services deploy from this repository. Configure their root directories separately. The responsive preview on port 3199 is a test fixture, not the application.

## 1. Prepare the database and identity provider

- Use the same Firebase project for backend verification and frontend Google sign-in. Enable the Google sign-in provider and add your production frontend hostname under Authentication > Settings > Authorized domains.
- Obtain the PostgreSQL connection URI from Supabase Connect. Use the Session pooler if your host requires IPv4. This is not the Supabase HTTPS project URL. URL-encode special characters in the database password.
- Keep certificate verification enabled. If a CA is required, download the correct certificate from your Supabase project; supply its PEM contents or a file mounted on the deployment host.
- Rotate any credentials previously committed to Git or shown in old screenshots. Removing `.env` from the current tree does not remove secrets from Git history. Do not reuse exposed MongoDB credentials.

## 2. Railway backend

Connect the repository, choose branch `main`, and set **Root Directory `/backend`**. Use the included Dockerfile (Node 22); it installs production dependencies and starts `node app.js` as a non-root user. Use **one replica**, health check **`/health/ready`**, and generate a public HTTPS domain. Railway supplies `PORT`; do not hard-code a different target port. See [Railway monorepos](https://docs.railway.com/deployments/monorepo) and [health checks](https://docs.railway.com/deployments/healthchecks).

Add these variables in Railway, replacing all placeholders:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
WEB_CONCURRENCY=1
SUPABASE_DB_URL=postgresql://<user>:<encoded-password>@<host>:<port>/postgres
FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_SERVICE_ACCOUNT_JSON=<complete-service-account-JSON>
ALLOWED_ORIGINS=https://<your-frontend-domain>
ALLOWED_EMAIL_DOMAINS=
ALLOW_PERSONAL_ROOMS=true
```

`FIREBASE_SERVICE_ACCOUNT_JSON` must be the entire private service-account JSON from that Firebase project, stored as a secret variable. Paste JSON directly into the dashboard value, without surrounding shell quotes. Do not put it in any `VITE_` variable. Alternatively use `GOOGLE_APPLICATION_CREDENTIALS` pointing to a real private file on the deployment host, or Application Default Credentials where supported. Set only one credential method; a Windows path from your laptop will not work on Railway. See [Firebase Admin setup](https://firebase.google.com/docs/admin/setup).

Optional settings:

| Variable | When to set it |
| --- | --- |
| `SUPABASE_DB_CA_CERT` | Paste the entire PEM certificate if required for database TLS. Actual newlines or literal `\n` are accepted. |
| `SUPABASE_DB_CA_FILE` | Alternative to inline PEM: absolute path to a mounted certificate on the deployment host. Do not set both CA options. |
| `TRUST_PROXY_HOPS` | Set only after verifying the proxy chain. Use `1` for exactly one trusted proxy with no shorter public route to the application. Incorrect values can break or weaken IP-based limits. |

An empty `ALLOWED_EMAIL_DOMAINS` permits any verified email, including the requested Gmail administrator accounts. To restrict access, use comma-separated domains and match the frontend setting. `ALLOWED_ORIGINS` is a comma-separated list of exact frontend origins, without paths or trailing slashes; do not use a wildcard. Set `ALLOW_PERSONAL_ROOMS=false` if all new sessions must belong to organisations.

Run `npm run db:migrate` **once per release that changes the schema**, with the target database variables available, before accepting traffic. Use a controlled deployment command or a trusted local checkout pointed at the target database. Migration is not automatically run by the application. Back up existing data first. `/health/ready` checks database readiness; it does not prove Firebase sign-in works.

## 3. Vercel frontend

Import the same repository with **Root Directory `frontend`**, framework **Vite**, Node **22.x**, install command **`npm ci`**, build command **`npm run build`**, and output directory **`dist`**. The included `vercel.json` handles direct navigation to application routes. See [Vercel Vite support](https://vercel.com/docs/frameworks/frontend/vite).

Add these variables to the Vercel **Production** environment:

```dotenv
VITE_API_BASE_URL=https://<your-railway-domain>/api
VITE_SOCKET_SERVER_URL=https://<your-railway-domain>
VITE_FRONTEND_URL=https://<your-frontend-domain>
VITE_FIREBASE_API_KEY=<firebase-web-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<firebase-project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<firebase-project-id>
VITE_FIREBASE_APP_ID=<firebase-web-app-id>
VITE_ALLOWED_EMAIL_DOMAINS=
```

Copy the web app values from Firebase Project settings. These web configuration values are public; database credentials and Firebase service-account keys are private and must remain backend-only. Vite embeds its variables at build time: redeploy after changing them. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

The socket URL must be the backend **origin only**, without `/api` or `/be`. Socket.IO uses `/socket.io/` as its transport path; adding `/be` to the connection URL selects a namespace instead of moving that transport path. This mismatch explains a likely failure in the old campus configuration. The screenshots alone cannot establish every historical cause.

For preview deployments, explicitly configure the preview frontend variables, Firebase authorized domain and backend origin allowlist. Prefer a separate test backend/database; previews should not silently receive production access.

## 4. Release acceptance checklist

1. Confirm both services use the intended Git commit and all required variables are set. Ensure the frontend domain is in both Firebase authorized domains and backend `ALLOWED_ORIGINS`.
2. Confirm `/health/live` and `/health/ready` on the backend return success. Railway deployment health checks are not a substitute for ongoing uptime monitoring.
3. From a trusted development checkout with backend dev dependencies installed, run:
   `npm run check:realtime -- https://<your-railway-domain> https://<your-frontend-domain>`
   This checks health plus polling and WebSocket transport handshakes without creating data. It does not prove authenticated event delivery.
4. Sign in using two real accounts in separate browsers. Create and join a room; submit, upvote and answer a doubt. Both clients must update without refresh. Close the room, verify retained history, and reply to an unfinished doubt as the host.
5. Background and reopen a room, then briefly disconnect/reconnect the network. Check recovery without duplicate notifications or votes. Leave the connection open several minutes to detect proxy idle timeouts.
6. Confirm ordinary users cannot use admin APIs, organisation managers cannot access another organisation, and expired temporary memberships lose access. Administrator privileges are stored server-side; no frontend variable grants them.
7. Review backend logs for authentication, TLS and connection errors without logging tokens or credentials. Configure uptime/error alerts and database backups. Rehearse restoring a backup before relying on it.

## 5. Campus deployment and scaling limits

Use `deploy/nginx/undoubt.conf` with `deploy/nginx/undoubt-locations.conf`, replacing its domain, TLS paths and filesystem paths for your server. Build the frontend and serve its static `dist` directory. Route both `/api/` and `/socket.io/` to the single backend; preserve HTTP/1.1 upgrade headers and adequate timeouts. Validate with `nginx -t` before reloading. `deploy/undoubt.service` is a single-process service template; adapt its paths and private environment file.

Keep the backend bound to `127.0.0.1` behind local Nginx. Do not deploy the Vite development server. Avoid port conflicts by assigning a dedicated backend port and matching the Nginx upstream. The automated Nginx tests cover polling, WebSocket upgrade, questions, votes, replies and reconnect snapshots.

This release supports one backend process. Multiple replicas or PM2 cluster workers need a shared Socket.IO adapter, shared rate-limit state, and correct load-balancer affinity when using polling. Adding replicas now can split room audiences and lose live notifications. Database persistence does not automatically distribute socket events. Benchmark against a staging Supabase database and realistic traffic before claiming production capacity; the embedded database tests are correctness checks, not a production throughput guarantee.

## 6. Local verification and rollback

- Backend: `npm ci`, `npm test`, `npm audit --omit=dev`. Set `NGINX_BIN` to the Nginx executable to include real proxy integration tests.
- Frontend: `npm ci`, `npm test`, `npm run lint`, `npm run build`, `npm audit --omit=dev`.
- Retain the last working deployment and its configuration. Roll back application releases through the hosting dashboard; review schema compatibility first. Do not undo database migrations by deleting production tables.
- Do not upload `.env`, private credential files, `node_modules`, or local `dist` output to Git. The hosts install dependencies and build from the lockfiles.
