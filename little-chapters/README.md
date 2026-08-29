# Little Chapters

> *Your baby's story, created automatically.*

Little Chapters turns the photos, videos, voice notes and little moments
already on a parent's phone into a private childhood archive: monthly
chapters, first-year and birthday books, video recaps, and printed keepsakes
with QR-linked video memories — built to last from birth through age 18.

It is not a photo-storage service and not an AI product. It sells one thing:
**a childhood you don't accidentally forget.**

## What's here

A production-architecture platform: Next.js 15 web app + long-running worker
+ PostgreSQL, with provider abstractions for AI (Anthropic), transcription,
storage (Supabase), billing (Stripe), and print fulfillment — every one with
a working development fallback so the entire product runs locally with zero
credentials.

| Area | Where |
|---|---|
| Architecture & risk register | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Database model + RLS | [`docs/DATABASE.md`](docs/DATABASE.md), `supabase/migrations/` |
| Threat model & controls | [`docs/SECURITY.md`](docs/SECURITY.md) |
| Privacy commitments | [`docs/PRIVACY.md`](docs/PRIVACY.md) |
| Connecting real services | [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) |
| Build status / roadmap | [`docs/ROADMAP.md`](docs/ROADMAP.md) |

## Quick start (no credentials needed)

```bash
npm install

# any Postgres 15+; for example:
#   docker run -d -e POSTGRES_PASSWORD=postgres -p 54322:5432 postgres:16
cp .env.example .env.local          # defaults target localhost:54322 + local storage

npm run db:migrate                  # applies supabase/migrations/*.sql
npm run db:seed:demo                # synthetic demo family (no real children)

npm run dev                         # web app on :3000
npm run worker                      # job worker (ffmpeg needed for video jobs)
```

Sign in at `/login` with **demo@littlechapters.example** (dev login — real
deployments use Supabase email/password + Google/Apple). You'll land in a
seeded family with photos, memories, milestones, two generated chapters, a
sealed future letter, family comments, and a QR-linked memory.

## Checks

```bash
npm run typecheck   # strict TS across app, server, worker
npm run lint
npm run test        # 58 tests: unit + real-Postgres integration
npm run build       # production build
```

Integration tests cover the promises that matter: authorization boundaries
(no cross-family access, no existence leaks), share-link and QR policy
(password/expiry/revocation/family-only), queue idempotency and retries,
plan-limit enforcement, invitation binding, contributor approval, and
chapter generation that never overwrites a parent's edits.

## Design commitments

- **Private by default** — nothing is publicly reachable without an explicit
  owner action; all media flows through short-lived signed URLs behind
  authorization checks; share and QR tokens are opaque, revocable and hashed
  at rest (QR tokens are printed, so they map through a permanent redirect
  layer that survives storage migrations for decades).
- **The database is the truth** — AI output is always a draft or suggestion;
  milestones, dates, names and measurements are never invented and never
  recorded without parent confirmation. Structured outputs are Zod-validated
  and grounding-checked; user content is isolated against prompt injection.
- **Never locked in** — full-account export (originals + transcripts +
  metadata + readable index) is one tap for every family, on every plan.
- **Video is first-class and honest about infrastructure** — transcodes,
  posters, recaps and print PDFs run on a worker fleet, never in serverless
  functions.
