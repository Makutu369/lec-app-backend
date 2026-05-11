# LEC App Backend

A Cloudflare Workers backend for the LEC App, powered by **Hono**, **Drizzle ORM**, and **Neon** (serverless PostgreSQL).

---

## Tech Stack

| Layer        | Technology                              |
| ------------ | --------------------------------------- |
| Framework    | Hono 4.x                                |
| Runtime      | Cloudflare Workers                      |
| Language     | TypeScript                              |
| ORM          | Drizzle ORM                             |
| Database     | Neon (PostgreSQL)                       |
| Auth         | JWT (jose) + bcryptjs                   |
| Package Mgr  | pnpm                                   |

---

## Getting Started

### 1. Clone & Install

```bash
git clone <repo-url>
cd lec-app-backend
pnpm install
```

### 2. Configure Environment

Create a Neon project at [neon.tech](https://neon.tech) and get your connection string.

For local development with Wrangler:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add your credentials:

```env
DATABASE_URL=postgresql://username:password@ep-xxxxx.us-east-2.aws.neon.tech/dbname?sslmode=require
JWT_SECRET=your-secret-key-here
```

For production deployment:

```bash
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
```

### 3. Run in Development

```bash
pnpm dev
```

This starts the Vite dev server with hot reload.

### 4. Build for Production

```bash
pnpm build
```

### 5. Deploy to Cloudflare

```bash
pnpm deploy
```

---

## Project Structure

```
src/
├── db/
│   ├── schema.ts            # Drizzle schema definitions (7 tables)
│   ├── relations.ts         # Drizzle ORM relations
│   └── index.ts             # Database client factory
├── lib/
│   ├── jwt.ts               # JWT sign/verify (jose)
│   └── password.ts          # Password hash/compare (bcryptjs)
├── middleware/
│   └── auth.ts              # JWT Bearer auth guard
├── routes/
│   ├── auth.ts              # Auth routes (signin, signup, password reset)
│   ├── courses.ts           # Course CRUD + enrollment + progress
│   ├── sections.ts          # Section completion
│   └── mega-centers.ts      # Mega center listing
├── worker/
│   └── index.ts             # Cloudflare Worker entry point (Hono app)
└── react-app/               # React frontend (admin dashboard)
```

---

## Database Schema

| Table            | Description                        |
| ---------------- | ---------------------------------- |
| `users`          | User accounts with role & profile  |
| `courses`        | Course catalog                     |
| `sections`       | Lessons within a course            |
| `enrollments`    | User ↔ Course enrollment records   |
| `progress`       | User ↔ Section completion tracking |
| `mega_centers`   | Church mega center directory       |
| `password_resets` | Password reset codes (6-digit)    |

---

## API Endpoints

### Health Check

| Method | Route    | Auth | Description  |
| ------ | -------- | ---- | ------------ |
| GET    | `/api/`  | No   | Health check |

### Authentication

| Method | Route                        | Auth | Description              |
| ------ | ---------------------------- | ---- | ------------------------ |
| POST   | `/api/auth/signin`           | No   | Sign in with credentials |
| POST   | `/api/auth/signup`           | No   | Register a new account   |
| POST   | `/api/auth/forgot-password`  | No   | Request password reset   |
| POST   | `/api/auth/verify-reset-code`| No   | Verify 6-digit code      |
| POST   | `/api/auth/reset-password`   | No   | Set new password         |

### Courses

| Method | Route                              | Auth | Description                     |
| ------ | ---------------------------------- | ---- | ------------------------------- |
| GET    | `/api/courses`                     | No   | List all courses with sections  |
| GET    | `/api/courses/:courseId`           | No   | Get single course with sections |
| POST   | `/api/courses/:courseId/enroll`     | Yes  | Enroll in a course              |
| GET    | `/api/courses/:courseId/progress`   | Yes  | Get section-level progress      |

### Sections

| Method | Route                                | Auth | Description           |
| ------ | ------------------------------------ | ---- | --------------------- |
| PATCH  | `/api/sections/:sectionId/complete`  | Yes  | Mark section complete |

### Mega Centers

| Method | Route               | Auth | Description           |
| ------ | ------------------- | ---- | --------------------- |
| GET    | `/api/mega-centers` | No   | List all mega centers |

---

## Environment Variables

| Variable       | Description                         |
| -------------- | ----------------------------------- |
| `DATABASE_URL` | Neon PostgreSQL connection string   |
| `JWT_SECRET`   | Secret key for signing JWT tokens   |

---

## Database Management

### Generate Migrations

```bash
pnpm db:generate
```

### Push Schema to Database

```bash
pnpm db:push
```

### Open Drizzle Studio

```bash
pnpm db:studio
```

---

## Scripts

| Command              | Description                     |
| -------------------- | ------------------------------- |
| `pnpm dev`           | Start dev server                |
| `pnpm build`         | Build for production           |
| `pnpm deploy`        | Deploy to Cloudflare Workers    |
| `pnpm cf-typegen`    | Generate Cloudflare types       |
| `pnpm db:generate`   | Generate Drizzle migrations     |
| `pnpm db:push`       | Push schema to database         |
| `pnpm db:studio`     | Open Drizzle Studio             |
| `pnpm lint`          | Lint the codebase               |
