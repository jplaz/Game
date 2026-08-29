# Connecting Real Services

Every external integration is built against a provider interface with a
working development fallback, so the app runs end-to-end locally with zero
credentials. To go to production, connect each service below.

## 1. Supabase (database, auth, storage)

1. Create a project at supabase.com.
2. Set in `.env.local` / deployment env:
   - `NEXT_PUBLIC_SUPABASE_URL` — project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key (server/worker only)
   - `DATABASE_URL` — Postgres connection string (Settings → Database).
     Use the **pooled** (pgbouncer, port 6543) URL for the web tier and the
     **direct** (5432) URL for `npm run db:migrate` and the worker.
3. Run migrations: `npm run db:migrate` (applies `supabase/migrations/*.sql`
   in order, tracked in `_migrations`).
4. Create private storage buckets (all with public access **off**):
   `originals`, `derivatives`, `print-assets`, `renders`, `exports`.
   Set `STORAGE_DRIVER=supabase`.
5. Auth providers (Dashboard → Authentication):
   - Email/password: enable, require email confirmation.
   - Google: create OAuth client (Web) in Google Cloud Console, authorized
     redirect `https://<project>.supabase.co/auth/v1/callback`; paste client
     ID/secret into Supabase.
   - Apple: create a Services ID + key in the Apple Developer portal, same
     redirect; paste into Supabase.
   - Set Site URL to `NEXT_PUBLIC_APP_URL` and add it to redirect allowlist.

Local development without Supabase: leave the Supabase vars empty, run any
Postgres 15+ (e.g. `docker run -e POSTGRES_PASSWORD=postgres -p 54322:5432 postgres:16`),
set `STORAGE_DRIVER=local`, and use the dev credential login described in
`src/server/auth/README.md`.

## 2. Anthropic (AI generation)

1. Get an API key at console.anthropic.com.
2. Set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...`, `AI_MODEL` (default
   `claude-sonnet-5`; use `claude-haiku-4-5-20251001` for cheaper
   caption/scoring tasks — per-task model overrides live in
   `src/server/ai/config.ts`).
3. No other change: all tasks route through `src/server/ai/provider.ts`.

With `AI_PROVIDER=null` the app still works: generation produces clearly
labeled deterministic drafts assembled from the parent's own words.

## 3. Transcription

Any OpenAI-compatible `/v1/audio/transcriptions` endpoint works (OpenAI,
Groq, Deepgram's compat layer, self-hosted faster-whisper):

- `TRANSCRIPTION_PROVIDER=openai_compatible`
- `TRANSCRIPTION_API_URL=https://api.openai.com` (or compatible)
- `TRANSCRIPTION_API_KEY=...`, `TRANSCRIPTION_MODEL=whisper-1`

## 4. Stripe (subscriptions + print payments)

1. Create products/prices in Stripe matching the rows seeded in `plans`
   (or edit the seed to your prices), then set each plan's
   `stripe_price_id` in the `plans` table.
2. Env: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
3. Webhook: add endpoint `https://<app>/api/webhooks/stripe` with events
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`;
   set `STRIPE_WEBHOOK_SECRET`.
4. Enable the customer portal (Billing → Portal) for self-serve management.

## 5. Print fulfillment

`PRINT_PROVIDER=manual` records orders and produces print-ready PDFs for a
human-in-the-loop fulfillment flow (admin console → download interior/cover
PDFs → place with any printer). To integrate an API printer, implement
`PrintProvider` (`src/server/print/provider.ts`) — `getProducts`, `quote`,
`createOrder`, `getStatus`, `cancel` — register it in
`src/server/print/index.ts`, and set `PRINT_PROVIDER=<name>`. Product specs
(trim sizes, bleed, page limits, base costs) are rows in `print_products`.

## 6. Email + push

- Email: `EMAIL_PROVIDER=resend_compatible`, `EMAIL_API_URL`, `EMAIL_API_KEY`,
  `EMAIL_FROM`. Any Resend-compatible POST `/emails` API works.
- Web push: `npx web-push generate-vapid-keys`, set
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`.

## 7. Video processing (worker)

The worker shells out to ffmpeg/ffprobe. Install them on the worker image
(`apt-get install ffmpeg`) and set `FFMPEG_PATH`/`FFPROBE_PATH` if not on
PATH. The web tier never runs ffmpeg. Deploy the worker as a long-running
process (`npm run worker`) on Fly.io, Railway, Render, ECS, or a VM — not
on serverless.

## 8. Deployment shape

- **Web**: Vercel (or any Node host). Set all `NEXT_PUBLIC_*` + server env.
- **Worker**: container with Node 20+, ffmpeg, `DATABASE_URL` (direct),
  storage + AI + transcription credentials. Scale horizontally; the Postgres
  queue uses `FOR UPDATE SKIP LOCKED` so workers never double-claim.
- **Database**: Supabase / managed Postgres with pgvector available
  (`create extension vector` — migration 0001 handles it when permitted).
