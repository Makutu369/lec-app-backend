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
| Auth         | JWT (jose) + Web Crypto (PBKDF2)        |
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
│   ├── schema.ts            # Drizzle schema definitions (11 tables)
│   ├── relations.ts         # Drizzle ORM relations
│   └── index.ts             # Database client factory
├── lib/
│   ├── jwt.ts               # JWT sign/verify (jose)
│   └── password.ts          # Password hash/compare (Web Crypto PBKDF2)
├── middleware/
│   ├── auth.ts              # JWT Bearer auth guard
│   └── admin.ts             # Admin role guard (requires authGuard)
├── routes/
│   ├── auth.ts              # Auth routes (signin, signup, password reset)
│   ├── courses.ts           # Course CRUD + enrollment + progress
│   ├── sections.ts          # Section completion
│   ├── mega-centers.ts      # Mega center listing
│   └── exams.ts             # Exam CRUD, questions, enrollment, submit
├── worker/
│   └── index.ts             # Cloudflare Worker entry point (Hono app)
└── react-app/               # React frontend (admin dashboard)
```

---

## Database Schema

| Table            | Description                        |
| ---------------- | ---------------------------------- |
| `users`            | User accounts with role & profile             |
| `courses`          | Course catalog                                |
| `sections`         | Lessons within a course                       |
| `enrollments`      | User ↔ Course enrollment records              |
| `progress`         | User ↔ Section completion tracking            |
| `mega_centers`     | Church mega center directory                  |
| `password_resets`  | Password reset codes (6-digit)                |
| `exams`            | Exam catalog (title, passing score, publish)  |
| `exam_enrollments` | User ↔ Exam enrollment records                |
| `questions`        | Questions with options + correct indices      |
| `exam_attempts`    | User exam submissions with score + results    |

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

### Exams

**Admin** (requires auth token with `role: "admin"`):

| Method | Route                                   | Auth  | Description                       |
| ------ | --------------------------------------- | ----- | --------------------------------- |
| POST   | `/api/exams`                            | Admin | Create a new exam                 |
| GET    | `/api/exams`                            | Admin | List all exams with questions     |
| GET    | `/api/exams/:id`                        | Admin | Get exam with questions           |
| PUT    | `/api/exams/:id`                        | Admin | Update exam metadata              |
| DELETE | `/api/exams/:id`                        | Admin | Delete exam (cascades questions)  |
| PATCH  | `/api/exams/:id/publish`                | Admin | Toggle published status           |
| POST   | `/api/exams/:examId/questions`          | Admin | Add a question to an exam         |
| PUT    | `/api/exams/:examId/questions/:qId`     | Admin | Update a question                 |
| DELETE | `/api/exams/:examId/questions/:qId`     | Admin | Delete a question                 |
| POST   | `/api/exams/import`                     | Admin | Bulk import exam + questions      |

**User** (requires auth token):

| Method | Route                            | Auth | Description                            |
| ------ | -------------------------------- | ---- | -------------------------------------- |
| GET    | `/api/exams/published`           | Yes  | List published exams                   |
| POST   | `/api/exams/:id/enroll`          | Yes  | Enroll in an exam                      |
| GET    | `/api/exams/:id/take`            | Yes  | Get questions (answers hidden)         |
| POST   | `/api/exams/:id/submit`          | Yes  | Submit answers and get score           |
| GET    | `/api/exams/:id/attempts`        | Yes  | Get your attempts for this exam        |

---

### Exam Data Types

**Exam object:**

```json
{
  "id": "uuid",
  "title": "Born Again Quiz",
  "description": "Test your knowledge...",
  "passingScore": 60,
  "timeLimitMinutes": null,
  "isPublished": true,
  "createdAt": "2026-05-26T00:00:00.000Z"
}
```

**Question object:**

```json
{
  "id": "uuid",
  "examId": "uuid",
  "questionText": "To be born again is:",
  "options": [
    "to be born from your mother's womb when you are old",
    "to be born from above",
    "to be born from heaven",
    "to stop doing all the bad things you used to do"
  ],
  "correctIndices": [1, 2],
  "scripture": null,
  "sortOrder": 0
}
```

> **Note:** `correctIndices` is an array of indices into `options`, supporting multiple correct answers. This field is **omitted** from the `/take` endpoint so users cannot see the answers.

### Exam Flow

1. **Admin** creates an exam via `POST /api/exams` or bulk imports via `POST /api/exams/import`
2. **Admin** adds questions via `POST /api/exams/:examId/questions`
3. **Admin** publishes the exam via `PATCH /api/exams/:id/publish`
4. **User** browses published exams via `GET /api/exams/published`
5. **User** enrolls via `POST /api/exams/:id/enroll`
6. **User** takes the exam via `GET /api/exams/:id/take` (questions without answers)
7. **User** submits via `POST /api/exams/:id/submit` — receives score, pass/fail, per-question results

### Scoring

- Each question awards 1 point if the user's selected indices match `correctIndices` exactly (set equality).
- Final score = `(correctCount / totalQuestions) × 100`.
- Passed if `score >= exam.passingScore`.

### Bulk Import Example

```bash
curl -X POST http://localhost:5173/api/exams/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "exam": {
      "title": "Born Again Quiz",
      "description": "Test your understanding of being born again",
      "passingScore": 60
    },
    "questions": [
      {
        "questionText": "To be born again is:",
        "options": [
          "to be born from your mother'\''s womb when you are old",
          "to be born from above",
          "to be born from heaven",
          "to stop doing all the bad things you used to do"
        ],
        "correctIndices": [1, 2],
        "scripture": null,
        "sortOrder": 0
      },
      {
        "questionText": "The following scriptures speak of being born again except:",
        "options": [
          "John 10:30",
          "1 Peter 1:23",
          "John 3:5",
          "Titus 3:5"
        ],
        "correctIndices": [0],
        "scripture": null,
        "sortOrder": 1
      }
    ]
  }'
```

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
