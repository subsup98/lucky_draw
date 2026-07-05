# Local Web Recovery Note - 2026-06-23

## Context

The user wanted to view the cloned web project in the browser, not the mobile app.

Current visible web URL:

- `http://localhost:3000/v2`
- Detail page example: `http://localhost:3000/v2/kujis/demo-kuji-2026`

## What Is Running

- Docker Desktop is installed.
- `docker compose up -d postgres redis` was run successfully.
- `apps/user` Next.js web is running on `localhost:3000`.
- A temporary mock API is running on `localhost:4000` so the web can be previewed.

## Important: Mock API Is Temporary

The real backend API is not currently healthy.

Expected real backend:

- `@lucky/backend`
- `http://localhost:4000/api`

Temporary preview API:

- `.codex-tooling/mock-api-fixed.cjs`

The mock currently provides:

- `GET /api/health`
- `GET /api/kujis`
- `GET /api/kujis/:id`
- `GET /api/kujis/:id/tickets`
- `POST /api/kujis/:id/tickets/reserve`
- `GET /api/banners`
- `GET /api/site-config/public`

## Why This Situation Happened

The web frontend came up, but the real backend API failed during startup at Prisma database connection.

Observed backend error:

```text
PrismaClientInitializationError: Authentication failed against database server at localhost / 127.0.0.1
```

Also observed:

```text
prisma migrate dev
prisma db push
Error: Schema engine error
```

Likely causes after moving to a different PC:

- Docker volume / Postgres auth state is different from the old PC.
- Root `.env` had an invalid first line for Docker env parsing. It was changed to `# Root .env`.
- Node runtime is Node 24.x, while the project uses Prisma 5.22.0. Compatibility should be checked.
- Old PC may already have had migrated and seeded DB state that does not exist on this PC.
- Backend `.env`, root `.env`, Docker Postgres credentials, and Prisma runtime may not all be aligned yet.

## Runtime Error That Was Fixed For Preview

The first mock API only returned list-level kuji fields. The detail page expected `kuji.prizeTiers`.

Browser error:

```text
TypeError: Cannot read properties of undefined (reading '0')
```

Source:

```text
apps/user/app/(v2)/v2/kujis/[id]/page.tsx
const tiers = kuji.prizeTiers;
const first = tiers[0];
```

Temporary fix:

- Added `.codex-tooling/mock-api-fixed.cjs`.
- Mock detail response now includes `prizeTiers`.
- Mock ticket response now includes ticket rows.
- Detail page refresh confirmed normal rendering with prize tiers and seat selection.

## Next Real Fix

To restore the project properly, do this next:

1. Stop the temporary mock API.
2. Start the real backend on `localhost:4000`.
3. Verify `apps/backend/.env`, root `.env`, Docker Postgres user/password/database, and Redis config.
4. Check Prisma 5.22.0 compatibility with Node 24.x. If needed, use a supported Node version for this project.
5. Run real DB migration and seed.
6. Confirm these URLs return valid responses:

```text
http://localhost:4000/api/health
http://localhost:4000/api/kujis
http://localhost:3000/v2
```

Until the real backend is fixed, the current browser preview is using mock data.
