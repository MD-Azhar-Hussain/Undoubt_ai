# Undoubt

Real-time classroom Q&A: hosts create sessions, participants join with a code or QR, ask questions and upvote shared doubts. Hosts mark questions answered and review retained session reports.

Built with React 18, Vite, Firebase Authentication, Express, Socket.IO and Supabase PostgreSQL. The current question similarity hint uses string comparison; there is no AI answering model yet.

## Start here

- [Railway + Vercel setup, environment variables and deployment checklist](DEPLOYMENT.md)
- [Backend environment template](backend/.env.example) and [frontend environment template](frontend/.env.example)
- [Campus Nginx configuration](deploy/nginx/undoubt.conf)

Use Node.js 22+. Run `npm ci` in both `backend` and `frontend`. Merge the respective `.env.example` settings into local `.env` files, then run `npm run dev` in each directory. The frontend runs on port 3108 and proxies the backend on port 6108 by default.

Create a fresh Supabase project and Firebase project, then fill the local environment files. Run `npm run db:migrate` in `backend` to install the private PostgreSQL schema. Firebase handles authentication; Supabase stores the data. No Supabase client key is needed in the browser. See the setup guide for every required field.

## Included

- Verified identities for HTTP requests and socket connections.
- Server-enforced room ownership, validation and participant email privacy.
- Atomic voting with confirmed frontend state and reconnect handling.
- Retained closed sessions, host session history and host-only reports.
- Bounded question queries, payload limits and basic throttling.
- Readiness/liveness endpoints and graceful shutdown.
- Backend integration tests, frontend interaction tests and a CI workflow.

## Verification

In `backend`: `npm test`.

In `frontend`: `npm run lint`, `npm test`, `npm run build`.

In both: `npm audit --omit=dev`.

Integration tests use isolated embedded PostgreSQL (PGlite) and mock verified identities. They do not use your Supabase database or real Firebase accounts. Hosted connection/TLS and true multi-connection concurrency still require verification against your new Supabase project.

## Readiness

This is a single-process pilot foundation. Production credentials, real-account testing, legacy-data review, operational monitoring and load testing are still required. Multi-instance deployment needs shared Socket.IO infrastructure and shared rate limits.

The additive organisation schema has been applied to the configured Supabase database. No production application deployment or legacy MongoDB import is included.

## Author

MD Azhar Hussain — [GitHub](https://github.com/MD-Azhar-Hussain)

The original project declares the ISC license.
