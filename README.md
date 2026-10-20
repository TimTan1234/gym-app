# GymPal

AI-powered gym companion: snap or describe a meal and get calories, protein, carbs, fat, fiber, sugar and sodium; log workouts with rest timer and PR detection; generate training plans; track progress; chat with an AI coach that reads your data.

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 7 · Better Auth · OpenAI (Responses API + structured outputs) · Recharts · Vitest · Playwright.

## Features

| Area | What it does |
|---|---|
| **AI meal logging** | Text and/or photo → per-item nutrition draft with confidence + assumptions (knows Malaysian/SEA dishes). Edit grams and nutrients scale; totals are always recomputed server-side. Saved foods and "log again" for quick re-logging. |
| **Targets** | Mifflin-St Jeor BMR × activity, goal-based deficit/surplus, protein 1.8–2.2 g/kg; safety floor (1200/1500 kcal). Auto-updates when you log weight, or set custom targets. |
| **Workout logger** | Start empty or from a plan day; last session's sets inline; double-progression suggestion; auto rest timer (survives reloads, vibrates/notifies); PRs (max weight, e1RM, best set volume) with toasts. |
| **Training plans** | AI generator (goal, days, session length, level, equipment, focus, injuries) constrained to the exercise library; manual builder/editor; active plan drives "up next". |
| **Progress** | Body-weight trend with 7-day average, calories/protein vs target, adherence + logging streak, sets per muscle, weekly volume, best e1RMs, per-exercise history. Every chart has a table view. |
| **AI coach** | Streaming chat with read-only tools over your data; can *propose* target or plan changes that only apply when you tap **Apply**. |
| **PWA** | Installable, offline fallback page; the service worker never caches personal data. |

## Setup

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env             # then fill in the values below
```

1. **Database**: any PostgreSQL works via `DATABASE_URL`.
   - No Docker? `npm run db:local` starts a local Prisma Postgres (`prisma dev`). Use the URL in `.env.example` and keep `DATABASE_POOL_MAX="1"` for it.
   - For hosted Postgres (Neon, Supabase, RDS), set its URL and `DATABASE_POOL_MAX="10"`.
2. `BETTER_AUTH_SECRET`: run `openssl rand -base64 32`.
3. **AI provider**: any provider with an OpenAI-compatible **Responses API** (structured outputs + function tools) works. Without a key (or with `AI_MOCK="1"`), the app returns realistic fixture responses so you can try every flow offline. Set `AI_MOCK="0"` to use the real provider.

   | Setting | OpenAI | DeepSeek (tested) |
   |---|---|---|
   | `OPENAI_BASE_URL` | *(empty)* | `https://api.deepseek.com` |
   | `OPENAI_MODEL`: meals (needs image input) | `gpt-5.4-mini` | `deepseek-flash` |
   | `OPENAI_SMART_MODEL`: coach | `gpt-5.5` | `deepseek-v4-pro` |
   | `OPENAI_PLAN_MODEL`: plan generation | *(empty = smart)* | `deepseek-flash` |
   | `OPENAI_REASONING_EFFORT` | *(optional)* | `low` |

   With DeepSeek, `deepseek-v4-pro` cannot read images, and it took ~100 s to generate a plan, versus ~10–30 s for `deepseek-flash`.
4. Create tables and seed the 111-exercise library:

```bash
npm run db:migrate
npm run db:seed
npm run dev                      # http://localhost:3000
```

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests (Vitest): targets, dates/timezones, units, nutrition totals, e1RM, progression, PRs, progress stats, AI schema validation, OpenAI strict-format checks |
| `npm run test:e2e` | Playwright flows on a production build at :3100 with AI mocked: sign-up → onboarding → AI meal (text + photo) → workout → history; AI plan → planned workout → progress; coach proposal → apply |
| `npm run test:e2e:live` | Same flows against the **real AI provider** (costs tokens). Needs `npm run dev` on :3000 with `AI_MOCK="0"` |
| `npm run typecheck` / `lint` | |
| `npm run db:migrate` / `db:seed` / `db:local` | Prisma |
| `npm run icons` | Regenerate PWA icons |

## Architecture notes

- `src/lib/`: pure domain logic (unit-tested) + `ai/` (OpenAI client, prompts, schemas, meal/plan/coach) + `queries.ts`.
- `src/server/`: server actions; every query is scoped to the signed-in user.
- `src/app/api/ai/*`: AI route handlers with per-user daily limits (`AI_LIMIT_*`), refunded on failure.
- All quantities are stored metric (kg, g, cm, kcal); imperial is display-only. Daily totals bucket by the user's **local date** (profile timezone), never UTC.
- AI output is always a draft: meal totals are recomputed from items, plans are constrained to library slugs (enum) and re-validated, and coach changes require confirmation.
- Nutrition estimates are approximate and not medical advice.
