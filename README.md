# University Fair Lead Capture

Internet-facing lead capture system for university fairs.
The app supports Arabic (RTL) and English (LTR), QR scanning from mobile, live lead handling on dashboard/receiver, secure image handling, and Excel/PDF exports.

## Tech Stack

- `Next.js 16` (App Router + one `pages/api` route for Socket.IO bootstrap)
- `TypeScript`
- `Prisma ORM`
- `MySQL` (works with TiDB-compatible MySQL endpoint)
- `Socket.IO` (real-time lead events)
- `Tailwind CSS` + `Radix UI`
- `Zod` (request/input validation)
- `Puppeteer` + `ExcelJS` (PDF/Excel exports)
- `Sharp` (image processing)

## Main Features

- QR lead capture from camera or uploaded photo
- Real-time lead opening on `/dashboard` and `/receiver`
- Duplicate scan handling with `scan_count` tracking
- Lead workflow: draft, done, cancelled, needs-review
- Evidence image upload and protected image serving
- Admin settings:
- Expo settings and logos
- Select options management (qualification, major, etc.)
- Export controls (scope + filters)
- Admin-only exports (Excel/PDF)
- Security hardening:
- Session + CSRF protection
- Origin/host validation
- Role-based authorization
- Rate limiting and login lockout
- Security headers + CSP

## Project Structure

- `app/`: Next.js App Router pages + route handlers
- `pages/api/socketio.ts`: Socket.IO server bootstrap
- `components/`: UI and feature components
- `lib/`: auth, security, validation, utilities
- `prisma/`: schema and migrations
- `scripts/`: admin creation and seed scripts
- `tests/`: security-focused tests (Vitest)

## Prerequisites

- `Node.js 20+` (Node 22 recommended)
- `npm`
- `MySQL 8+` (or TiDB MySQL endpoint)

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Fill all required variables.
3. Do not commit `.env`.

Important variables:

- `DATABASE_URL`
- `APP_SECRET` (strong random value, at least 32 chars)
- `ALLOWED_ORIGINS`
- `ALLOWED_HOSTS`
- `SESSION_TTL_MINUTES`
- `UPLOAD_MAX_BYTES`
- `LOGO_MAX_BYTES`

## Local Development

```bash
npm install
npx prisma validate
npx prisma migrate dev
npm run dev
```

Open `http://localhost:3000`.

## Production Build/Run

```bash
npm install
npx prisma validate
npx prisma migrate deploy
npm run build
npm run start
```

If `3000` is busy:

```bash
npx next start -p 3001
```

## Database Setup

### Option A: Existing MySQL/TiDB

1. Set `DATABASE_URL` in `.env`.
2. Run:

```bash
npx prisma migrate deploy
```

### Option B: Docker Compose (local MySQL)

```bash
docker compose up -d
npx prisma migrate deploy
```

## Create Admin User

Use `tsx` (recommended):

```bash
npx tsx scripts/create-admin.ts --email admin@example.com --password "StrongPass123!" --name "Admin"
```

Password policy:

- minimum 12 chars
- uppercase + lowercase + number + symbol

## Seed Select Options

```bash
npx tsx scripts/seed-options.ts
```

## Quality Gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Security Notes

- App fails closed when required env vars are invalid/missing.
- Sessions are cookie-based with secure settings.
- CSRF checks exist on state-changing endpoints.
- Origin and host allowlists are enforced.
- Admin and operator permissions are separated server-side.
- Image uploads are validated and stored outside `public/`.
- Never commit real credentials or secrets.

## GitHub Publishing Checklist

- Confirm `.env` is not committed.
- Confirm only `.env.example` is committed.
- Rotate any secret that was ever exposed before publishing.
- Run:

```bash
npm run lint
npm run typecheck
npm run build
```

## Suggested Repository Name

- `university-fair-lead-capture`

Alternative names:

- `unedu-lead-capture`
- `fair-scan-lead-manager`

## Suggested GitHub Description

`Secure QR-based lead capture platform for university fairs built with Next.js, TypeScript, Prisma, MySQL, and Socket.IO.`

## Suggested Topics (GitHub Tags)

- `nextjs`
- `typescript`
- `prisma`
- `mysql`
- `socket-io`
- `qr-scanner`
- `lead-management`
- `tailwindcss`
- `zod`

## License

This project is proprietary and closed-source. See `LICENSE`.


العربية: هذا المشروع ملكية خاصة (Proprietary) وغير مفتوح المصدر.