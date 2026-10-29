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
| `PERFORMANCE_LOGS` | Set `true` temporarily to log HTTP/socket action time, database time/query count, transaction pool wait and Firebase verification time. Turn off after diagnosis to reduce log volume. |

On Railway public HTTP ingress, the application detects Railway's project/environment variables and uses the documented `X-Real-IP` header for the network rate-limit key, including IPv6 subnet grouping. It does not trust client-supplied `X-Forwarded-For` chains. You do not need to guess `TRUST_PROXY_HOPS` to fix rate limiting there. This assumes traffic reaches the service through Railway's HTTP edge; do not expose the same application through a raw TCP proxy or an untrusted private ingress. Self-hosted Nginx deployments still require the correct `TRUST_PROXY_HOPS`. See [Railway request headers](https://docs.railway.com/networking/public-networking/specs-and-limits).

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

### Avoiding unnecessary hosting work

- Railway: keep Root Directory `/backend` and select **Config File `/railway.json`**. The tracked configuration watches only backend runtime/build files; frontend-only, documentation and test changes do not need a backend deployment. Confirm the configuration source in Railway Settings; a custom existing config path must be updated to use this file. No replica, region, billing or secret settings are changed by this file. [Railway watch paths](https://docs.railway.com/builds/build-configuration)
- Vercel: the tracked `ignoreCommand` compares frontend deployment inputs against the **last successful deployment** using `VERCEL_GIT_PREVIOUS_SHA`. Backend-only and preview/test/documentation changes are skipped. Missing history, first deployments and same-commit redeploys build normally. For configuration changes or an intentional rebuild, redeploy the same commit or temporarily set `FORCE_FRONTEND_BUILD=true`. Keep system environment variables exposed to the build. A skipped deployment may still incur platform queue/check overhead; it avoids the dependency installation and Vite build. [Vercel build configuration](https://vercel.com/docs/project-configuration/vercel-json#ignorecommand)
- GitHub CI: backend and frontend checks run only for their own changed paths; superseded runs are cancelled. Tests remain in Git, not in the production backend image.
- Backend image: explicitly copies only runtime folders, migration files and the administrator CLI. Benchmarks, proxy probes, tests, local credentials and reports stay outside the image.
- Supabase: public readiness probes share one in-flight database check. Successful results are reused for at most 5 seconds and failures for 1 second. This bounds health-query traffic; a database outage can take up to 5 seconds to appear in readiness. `/health/live` never touches the database. User/organisation authorization is not cached by this mechanism.
- `POST /api/doubts` was a retired HTTP submission route with no frontend callers; it now returns 404. Supported question creation uses the authenticated `newDoubt` socket event. Report access routes and retained session data are preserved.
- Keep `PERFORMANCE_LOGS` unset or `false` during ordinary operation; enable temporarily for diagnosis. Do not run migrations or load tests on every startup. Nothing in this cleanup deletes stored sessions or changes cloud plans.

## 7. Diagnosing latency

### Room interaction changes

The join form opens the room directly; socket authorization supplies access, role, topic and questions. Initial joins authorize once and combine membership recording with the first question page. Shared room locks allow simultaneous joins and actions while preserving closure and organisation revocation checks. Reconnecting within one minute does not rewrite the same history timestamp.

Questions, votes and replies acknowledge after the database commit, before audience lookup/delivery. Delivery still checks current permissions. A delivery error requests a fresh authorized snapshot instead of reporting a committed write as failed. Repeated recovery signals share an in-progress join. No polling loop, permission cache or new service is introduced.

For an active personal room, database round trips on the acknowledgement path (including BEGIN/COMMIT, excluding authentication and socket handshake) change as follows:

| Action | Before | After |
| --- | ---: | ---: |
| Initial socket join | 6 | 4 |
| Submit question | 5 | 4 |
| Vote | 6 plus batching delay | 5 |
| Reply | 6 | 4 |

Broadcast audience queries still happen after confirmation; they have not been removed. Votes preview immediately and roll back on rejection; question/reply previews explicitly say they are sending. Only committed state is shared with other users. These are code-path reductions, not measured production latency guarantees. No database migration or new environment variable is required.

Local verification (29 October 2026): 54 backend tests including Nginx transport delivery, 74 frontend tests, lint and production build passed. A bounded 50-client loopback/PGlite workload had no failures and every client received the final vote count; repeated submissions saved one row. Its acknowledgement p95 was 90 ms for connect/join, 167 ms for submission and 81 ms for voting. These local numbers exclude real Firebase verification, WAN latency and Supabase concurrency; they are not production benchmarks. Participants can also show/hide the room QR from Session options without receiving host controls.

The obsolete static theme prototype and unused exit-animation code were deleted. Local cleanup also removed empty legacy `backend/models`, `backend/utils`, `frontend/src/assets` folders and the unused MongoDB test binary cache (77,552,189 bytes). Those untracked local leftovers are not part of a deployment. Current tests, operational scripts, credentials and historical data are retained.

Live room pages obtain permissions from the authenticated socket join along with room data, without a separate HTTP host check. First visits show a neutral loading state until the server explicitly confirms `canManage`; an unknown role never renders participant controls. During transient reconnects, the last verified layout and reply drafts remain visible with mutations disabled. An explicit access disconnect or denial clears the layout, and a newly confirmed role replaces it. Admin/organisation/report pages retain their separate access gates. Both old `/host/:id` and `/room/:id` links remain supported; the URL does not grant a role.

Keep the backend and database geographically close. The reported deployment uses Railway Singapore and Supabase Mumbai; every serial database round trip crosses regions. Vercel serves this application's static frontend; moving a Vercel function region does not shorten the browser's direct requests to Railway. Review both providers' available regions and migration/backup procedures before moving an existing database.

Enable `PERFORMANCE_LOGS=true` on Railway for a short observation window. Compare `totalMs`, `dbMs`, `dbQueries`, `authMs`, and `poolMs` for a room join, question and vote. `dbMs` includes database network/lock time, and for non-transaction queries also pool waiting. It is not pure SQL execution time. Batched broadcast queries are attributed to the event that schedules the batch; other waiting votes include that wait in total time. HTTP finish times exclude browser/edge transit; comparing these with browser Network timings separates server work from network delay. Logs omit user IDs, room IDs, tokens and question contents. Firebase revocation checks remain enabled; concurrent checks of the identical token share work only until completion.

The client tries WebSockets first and falls back to polling. This avoids initial polling round trips when WebSockets work; a network that silently blocks WebSockets can take longer to detect failure. Confirm the active transport in browser DevTools. A multi-minute socket entry is a connection lifetime, not necessarily a multi-minute request computation. Status `0` does not identify a cause; inspect disconnect reasons. A `499` commonly means the client/proxy abandoned a request and is not enough by itself to prove backend failure.

The API caches successful CORS preflight permission for ten minutes. Every actual request still enforces the allowed origin, Firebase verification and current access rights. Question/vote writes remain transactional; closed-room and organisation permissions are checked in the database, not cached client-side. Performance tests use isolated PGlite; production latency and independent PostgreSQL connection lock contention must still be measured on staging.

Verified optimization comparison (isolated database, one personal-room participant, including transaction BEGIN/COMMIT and delivery permission lookup): a new question fell from 8 to 5 database round trips; a changed vote from 9 to 6. These counts are not a measured percentage improvement in production response time. Ordinary question actions now take shared room locks and lock the individual question when necessary; closing the session and changing its topic retain exclusive room locks.
