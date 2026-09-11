# DayFlow

**DayFlow** is a personal life-management app — tasks, expenses, habits, notes, a daily planner, notifications, and a password manager, all in one place.

It's a full-stack project: a **Next.js** frontend and a separate **NestJS + MongoDB** backend that the frontend talks to over a REST API. The backend was built from scratch to replace an earlier Firebase-based version of this app (Firebase Auth, Firestore, Firebase Storage) — see [Migration notes](#migration-notes-from-firebase) below.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Overview](#api-overview)
- [Documentation](#documentation)
- [Known Limitations](#known-limitations)
- [Migration Notes (from Firebase)](#migration-notes-from-firebase)

## Features

- **Auth** — email/password sign-up & sign-in, guest (passwordless) accounts, forgot/reset password by email
- **Tasks** — a daily to-do list with priorities
- **Expenses** — income/expense tracking with categories and a monthly budget
- **Habits** — a habit tracker with a built-in Gym Tracker (workout plan, protein/food logging, progressive-overload tracking)
- **Notes** — text and checklist notes
- **Daily Planner** — a weekly schedule editor
- **Notifications** — in-app reminders, plus optional browser Web Push notifications
- **Password Manager** — stores login credentials per site/service
- **Profile & Settings** — username/avatar, theme, and account security

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS 11, TypeScript |
| Database | MongoDB (via Mongoose) |
| Auth | JWT (access + refresh tokens), bcrypt password hashing |
| Email | [Resend](https://resend.com) (password-reset emails) |
| Push | Web Push API (VAPID) |
| PWA | `@ducanh2912/next-pwa` |

## Architecture

```
Browser
  │
  ▼
Next.js frontend (src/app/**)
  │  calls
  ▼
src/lib/api-client.ts        — fetch wrapper, attaches JWT + refresh cookie
  │  REST calls (JSON) over HTTP
  ▼
NestJS backend (backend/src/**)
  │  Controllers → Services → Mongoose Models
  ▼
MongoDB Atlas
```

The frontend and backend are two independent Node.js projects/processes, each with its own `package.json`. The frontend never talks to MongoDB directly — everything goes through the backend's REST API.

## Project Structure

```
.
├── src/                      # Next.js frontend
│   ├── app/                  # Pages (App Router) — dashboard, expenses, habits, notes, planner, etc.
│   ├── components/           # Shared UI components (AppLayout, shadcn/ui components)
│   ├── hooks/                # use-auth.tsx, use-toast.ts
│   └── lib/                  # api-client.ts (backend REST client), utils
├── backend/                  # NestJS API server
│   └── src/
│       ├── modules/          # One module per feature: auth, users, tasks, expenses,
│       │                     # habits, planner, notes, credentials, notifications,
│       │                     # push, jobs, health
│       └── common/           # Guards, decorators, exception filters
└── docs/                     # Project documentation
    └── DayFlow_Backend_Implementation_Guide.pdf
```

## Getting Started

### Prerequisites

- Node.js and npm
- A MongoDB connection string (e.g. a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster)
- (Optional, for password-reset emails) A [Resend](https://resend.com) API key

### 1. Clone and install

```bash
git clone https://github.com/pranathisundara3/DayFlow-V2.git
cd DayFlow-V2
npm install
cd backend && npm install && cd ..
```

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env   # then fill in your own values
```

Create a `.env.local` in the project root:

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001/api
```

See [Environment Variables](#environment-variables) below for what each value is for.

### 3. Run the backend

```bash
cd backend
npm run build
npm run start
```

Verify it's up: `curl http://localhost:3001/api/health/database` should return `{"status":"ok", ...}`.

### 4. Run the frontend

```bash
npx next dev --port 9002 --webpack
```

> **Note:** plain `npm run dev` will fail on this project. Next.js 16 defaults to the Turbopack bundler, which conflicts with the webpack-based PWA plugin already configured in `next.config.mjs`. The `--webpack` flag forces the same bundler the production build already uses.

Open **http://localhost:9002**.

## Environment Variables

No real secret values are shown here — see `backend/.env.example` for the full list with placeholders.

### Backend (`backend/.env`)

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `FRONTEND_URL` | Used for CORS and to build password-reset links |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Sign/verify access and refresh tokens (must be different) |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token lifetimes (default `15m` / `30d`) |
| `CRON_SECRET` | Bearer secret required to call the `/api/jobs/*` endpoints |
| `RESEND_API_KEY` / `MAIL_FROM_ADDRESS` | Sending password-reset emails via Resend |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push delivery (optional — features degrade gracefully without them) |

### Frontend (`.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Base URL of the backend API |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Used when subscribing a browser to Web Push |

## API Overview

All backend routes are prefixed with `/api`. Every route except auth/health requires a JWT (`Authorization: Bearer <token>`), and every query is scoped to the authenticated user — one user can never read or modify another's data.

| Module | Base path | Examples |
|---|---|---|
| Auth | `/api/auth` | register, login, guest, refresh, logout, forgot-password, reset-password |
| Users | `/api/users` | `GET/PATCH /me` |
| Tasks | `/api/tasks` | full CRUD |
| Expenses | `/api/expenses` | transactions CRUD, budget get/set |
| Habits | `/api/habits` | habit list, gym tracker data |
| Planner | `/api/planner` | weekly schedule get/set |
| Notes | `/api/notes` | full CRUD |
| Credentials | `/api/credentials` | password manager entries CRUD |
| Notifications | `/api/notifications` | full CRUD |
| Push | `/api/push` | subscription management |
| Jobs | `/api/jobs` | cron-triggered reminder/hydration push (secret-protected, not JWT) |

## Documentation

A full technical write-up of the backend — architecture, every module, the JWT/refresh-token flow, password reset, all endpoints, security decisions, bugs found during migration, and known limitations — is in [`docs/DayFlow_Backend_Implementation_Guide.pdf`](docs/DayFlow_Backend_Implementation_Guide.pdf).

## Known Limitations

- **Password Manager entries are not encrypted** — stored as plain strings in MongoDB, only masked in the UI.
- **Push notifications require VAPID keys to be generated and set** — without them, subscribe/test/reminder jobs run successfully but deliver nothing.
- **Password-reset email delivery is sandboxed** on Resend until a custom sending domain is verified — it currently can only deliver to the developer's own verified address.
- **No automated test suite** — the backend was verified manually against a running instance during development.

See the PDF guide's final section for the complete list.

## Migration Notes (from Firebase)

This project originally used Firebase (Auth, Firestore, Storage, and Firebase Admin in a few Next.js API routes). It has since been fully migrated to the self-hosted NestJS + MongoDB backend in this repo — no Firebase SDKs, config, or dependencies remain. The full migration story (what was replaced, why, and the bugs found along the way) is covered in the [documentation PDF](docs/DayFlow_Backend_Implementation_Guide.pdf).
