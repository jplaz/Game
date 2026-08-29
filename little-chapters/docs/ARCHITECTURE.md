# Little Chapters — Production Architecture

> *Your baby's story, created automatically.*

This document is the authoritative technical design for the Little Chapters platform:
a private, long-term family childhood archive that turns scattered photos, videos,
voice recordings and notes into monthly chapters, books, video recaps and
QR-linked physical keepsakes.

Companion documents:

- [`DATABASE.md`](./DATABASE.md) — full relational model and RLS policy design
- [`SECURITY.md`](./SECURITY.md) — threat model and security controls
- [`PRIVACY.md`](./PRIVACY.md) — data handling commitments and defaults
- [`INTEGRATIONS.md`](./INTEGRATIONS.md) — how to connect real providers (Supabase, Stripe, Anthropic, print, transcription)
- [`ROADMAP.md`](./ROADMAP.md) — phased build plan and current status

---

## 1. Product analysis and risk register

### 1.1 What the product actually is

Little Chapters is **not** a photo storage service and **not** an AI product.
It sells one outcome: *a childhood you don't accidentally forget*. Every
architectural decision is subordinated to three properties:

1. **Longevity** — a printed book with a QR code must still resolve in 20 years.
   Storage vendors, AI vendors, and print vendors must all be replaceable
   without breaking anything a family already holds in their hands.
2. **Truthfulness** — the system may make writing beautiful; it must never
   invent facts. The Postgres database is the single source of truth, and AI
   output is always a *proposal* until a parent confirms it.
3. **Privacy by default** — nothing is ever publicly reachable by accident.
   Every read path is authorization-scoped; share links are opt-in, opaque,
   revocable, and never encode storage locations.

### 1.2 Technical risks

| Risk | Mitigation |
|---|---|
| Video processing cannot run in serverless functions | Dedicated worker process (`worker/`) consuming a Postgres job queue; web tier only enqueues |
| Storage URL churn breaks printed QR codes | Permanent redirect layer: QR encodes `https://<domain>/m/<opaque-token>`; token → `qr_memories` row → current media, forever re-pointable |
| Vendor lock-in (AI, transcription, print, storage) | Provider interfaces (`AiProvider`, `TranscriptionProvider`, `PrintProvider`, `StorageDriver`) with env-selected implementations |
| Tens of thousands of media items per family | Cursor pagination everywhere, thumbnails-first loading, derivative variants, DB indexes on `(child_id, captured_at)` |
| AI hallucination of milestones/facts | Structured output validated with Zod; every AI suggestion lands in a `suggested` state requiring parent confirmation; generation prompts receive only confirmed facts |
| Prompt injection via captions/transcripts | All user content is wrapped as untrusted data in AI calls; system prompts forbid instruction-following from content; outputs re-validated against schema and against the fact set they were given |
| Job failures corrupting chapters | Idempotent jobs keyed by `(type, idempotency_key)`, explicit state machine, retries with backoff, dead-letter state |

### 1.3 Business risks

- **Storage cost blowout (video)** — metered usage per family (`usage_ledger`),
  plan limits enforced at upload admission, derivative lifecycle policies
  (originals kept, intermediates purged).
- **Print quality complaints** — DPI validation before checkout; hard warnings
  on low-resolution images; print-provider abstraction keeps margin data
  (`print_products.base_cost_cents` vs `retail_price_cents`) configurable.
- **Pricing rigidity** — plans, limits and prices live in DB tables
  (`plans`, `plan_limits`), not code.

### 1.4 Privacy risks

- Child media leaking through predictable URLs → opaque 128-bit tokens, signed
  short-lived media URLs, no raw storage paths in application payloads.
- Third-party analytics leaking child data → analytics events carry anonymized
  IDs only, never names/captions/media.
- AI vendors receiving more than needed → per-call minimal context; documented
  in PRIVACY.md; no training on user content.
- Deleted accounts leaving remnants → deletion pipeline enumerates
  `storage_objects` for hard delete, plus audit trail of the deletion itself.

---

## 2. System topology

```
┌────────────────────────────────────────────────────────────────────┐
│  Clients: mobile web (primary), desktop web, installable PWA       │
└───────────────┬────────────────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼───────────────┐     ┌──────────────────────────────┐
│  Next.js app (Vercel-ready)   │     │  Worker fleet (long-running) │
│  - App Router, RSC            │     │  - Postgres job queue        │
│  - Route handlers (API)       │     │  - ffmpeg video pipeline     │
│  - Auth (Supabase)            │     │  - sharp image pipeline      │
│  - Enqueues jobs, never       │     │  - AI generation jobs        │
│    transcodes video           │     │  - PDF/book rendering        │
└──────┬────────┬───────────────┘     └──────┬───────────────────────┘
       │        │                            │
       │  ┌─────▼────────────────────────────▼─────┐
       │  │  PostgreSQL (Supabase)                 │
       │  │  - authoritative data + RLS            │
       │  │  - job queue (SKIP LOCKED)             │
       │  │  - pgvector embeddings (search)        │
       │  └─────┬──────────────────────────────────┘
       │        │
┌──────▼────────▼─────────────┐   ┌───────────────────────────────┐
│  Object storage (buckets)   │   │  External providers (swappable)│
│  originals / derivatives /  │   │  - AI (Anthropic)             │
│  print-assets / exports     │   │  - Transcription              │
│  all private, signed URLs   │   │  - Stripe billing             │
└─────────────────────────────┘   │  - Print fulfillment          │
                                  │  - Email/push notifications   │
                                  └───────────────────────────────┘
```

**Two runtimes, one codebase.** The Next.js tier handles interactive traffic
and enqueues work. The worker tier (a plain Node process, deployable on
Fly/Railway/ECS/a VM) executes anything heavy or long-running: transcoding,
image analysis, AI generation, PDF rendering, recap rendering, exports.
Both share `src/server/**` domain code; neither bypasses the domain layer.

## 3. Repository layout

```
little-chapters/
  src/
    app/                     # Next.js App Router
      (marketing)/           #   landing, pricing — public
      (app)/                 #   authenticated product surface
        home/ timeline/ memories/ chapters/ books/ family/
        children/ search/ letters/ recaps/ settings/
      (admin)/admin/         #   staff console (role-gated)
      m/[token]/             #   QR permanent redirect layer
      s/[token]/             #   private share links
      api/                   #   route handlers (uploads, webhooks, etc.)
    components/              # design system + feature components
    lib/                     # isomorphic utilities (dates, age math, cn)
    server/                  # ALL backend logic (also used by worker)
      db/                    #   sql client, migrations runner, repositories
      auth/                  #   session, current-user, guards
      authz/                 #   family/child/media permission checks
      domain/                #   memories, chapters, books, milestones, growth,
                             #   letters, people, sharing, qr, recaps, exports
      media/                 #   upload admission, variants, scoring, dedupe
      ai/                    #   provider abstraction + task modules
      transcription/         #   provider abstraction
      print/                 #   provider abstraction, pdf specs, preflight
      billing/               #   plans, usage metering, stripe
      jobs/                  #   queue, registry, handlers
      notifications/         #   email/push/sms abstraction
      observability/         #   structured logging, audit
  worker/                    # worker entrypoint + loop
  supabase/migrations/       # numbered SQL migrations (authoritative schema)
  scripts/                   # migrate, seed-demo
  tests/                     # vitest unit + integration
  docs/
```

## 4. Identity, families and permissions

### 4.1 Model

- `users` — one row per authenticated person (mirrors Supabase `auth.users`).
- `families` — the unit of collaboration and billing. A user can belong to
  several families (their own children, grandchildren, blended families).
- `family_members` — membership with role: `owner` | `parent` | `contributor` | `viewer`.
- `children` — belong to a family. Multiple children (twins, siblings) are
  first-class. No assumption of two parents or biological relationships:
  `child_guardians` links children to users with a free-text relationship label.

### 4.2 Role capabilities

| Capability | owner | parent | contributor | viewer |
|---|---|---|---|---|
| Manage family, billing, deletion | ✅ | – | – | – |
| Invite members / set roles | ✅ | ✅ | – | – |
| Create/edit children, memories, chapters, books | ✅ | ✅ | – | – |
| Approve contributions | ✅ | ✅ | – | – |
| Upload media / submit memories (pending approval) | ✅ | ✅ | ✅ | – |
| View approved content, react, comment | ✅ | ✅ | ✅ | ✅ |

Contributor submissions enter `status = 'pending'`; parents approve, edit,
attach to a chapter, or decline. Enforced twice: RLS policies in Postgres
*and* the `authz` service layer (defense in depth; the service layer produces
friendly errors, RLS is the backstop).

### 4.3 Authorization rule

Every read/write resolves subject → family → role before touching the
resource. `assertFamilyRole(userId, familyId, minRole)` is the single choke
point; repositories require a proven `FamilyContext`, not raw IDs.

## 5. Media architecture

### 5.1 Storage layout (private buckets, no public ACLs)

```
originals/      {familyId}/{mediaId}/original.{ext}     # never modified
derivatives/    {familyId}/{mediaId}/thumb.webp         # ~320px
                {familyId}/{mediaId}/web.webp           # ~1600px
                {familyId}/{mediaId}/poster.webp        # video poster
                {familyId}/{mediaId}/web.mp4            # H.264 web transcode
print-assets/   {familyId}/{bookId}/...                 # CMYK-ready assets
renders/        {familyId}/{artifact}/...               # PDFs, recap videos
exports/        {familyId}/{exportId}.zip               # takeout archives
```

Every stored object has a `storage_objects` row (bucket, key, bytes, checksum,
content type, purpose). Application tables reference `storage_objects.id` —
**never raw URLs** — so the storage backend can migrate wholesale.

Access is exclusively via short-lived signed URLs minted server-side after an
authorization check (`/api/media/[id]/url?variant=`). Local dev uses a
filesystem `StorageDriver` with the same interface.

### 5.2 Upload pipeline

1. Client requests upload admission (`POST /api/uploads`): server validates
   MIME allowlist, size limits, plan quota → creates `media` row
   (`status='uploading'`) + signed upload target.
2. Client uploads directly to storage (resumable/multipart for large video).
3. Client confirms (`POST /api/uploads/:id/complete`) → server verifies the
   object exists and matches declared size/checksum → enqueues `media.ingest`.
4. Worker `media.ingest`: sniff real content type (magic bytes, not extension),
   extract EXIF/video metadata (captured_at, duration, dimensions, GPS if
   consented), generate thumbnail + web derivative + poster, compute
   perceptual hash, run quality scoring → `status='ready'`.
5. Optional follow-on jobs: `media.analyze` (AI labels/quality),
   `media.transcode` (adaptive video), duplicate clustering.

Jobs are idempotent (re-running regenerates derivatives deterministically),
retried with exponential backoff, and observable (`processing_jobs` mirrors
progress to the UI).

### 5.3 Photo intelligence

Deterministic scoring first, AI second:

- **sharpness** — variance of Laplacian on the thumbnail
- **exposure** — luma histogram (too dark / blown out)
- **duplicates/bursts** — dHash hamming distance clustering within a time window
- **diversity** — selection algorithm penalizes same-cluster and same-minute picks
- **AI relevance** (optional, plan-gated) — scores emotional salience from the
  image + confirmed context; output is a *suggestion score*, never a fact

Selection for a chapter = greedy pick maximizing `quality × relevance ×
diversity` across the month's event clusters. Parents can always override.

### 5.4 Video intelligence

Worker pipeline flags: duplicates (pHash of sampled frames), blur/darkness
(sampled-frame metrics), very short/long clips, audio & speech presence
(volume detection + transcription sampling), candidate highlight segments
(scene cuts + audio energy), best poster frame. Milestone-looking moments
("this may be first crawling") are **suggestions requiring confirmation** —
never auto-recorded.

## 6. QR memory architecture (built for decades)

Printed QR codes encode exactly one thing: `https://littlechapters.example/m/{token}`
where `token` is a 26-char opaque ID (no media info, no family info, unguessable).

`/m/{token}` is a **permanent redirect layer**:

```
qr_memories: token → memory/media reference + policy
policy: visibility (family|link|password), password_hash?, expires_at?,
        revoked_at?, allow_download, view_count
```

Resolution: token → policy checks (revoked? expired? password? family-only
auth?) → render a private viewing page that fetches media via short-lived
signed URLs. Because the token maps through the database, storage can move,
CDNs can change, media can be re-encoded — the printed book keeps working.
Owners can revoke, password-protect, expire, or re-point any token at any time.
All tokens default to **family-only**.

## 7. AI architecture

### 7.1 Principles

- **Modular tasks, not one giant prompt.** Each task is its own module with
  its own prompt, input contract, Zod output schema, and temperature.
- **Database is authoritative.** AI never writes facts; it writes *drafts*
  and *suggestions* stored in `ai_generations` and surfaced for confirmation.
- **Grounding contract.** Narrative tasks receive only confirmed facts
  (memories, milestones, growth entries approved by parents) and are
  instructed + validated to introduce no new named events, dates, people,
  or measurements.
- **Untrusted content isolation.** Captions/transcripts/notes are passed as
  clearly delimited data blocks; system prompts direct the model to treat
  them as quoted material, never instructions.

### 7.2 Task modules (`src/server/ai/tasks/`)

| Task | Purpose |
|---|---|
| `caption` | short tasteful caption for a photo/video given confirmed context |
| `rewriteMemory` | keepsake version of a parent's raw note (original preserved) |
| `monthlyNarrative` | grounded monthly story from confirmed memories |
| `storybook` | warm storybook text from selected real memories |
| `milestoneSuggest` | classify a memory/transcript into candidate milestones |
| `mediaRelevance` | emotional-salience scoring for photo/video selection |
| `memoryPrompts` | personalized capture prompts (age/season aware, no pressure) |
| `titles` | chapter/book/recap title options |
| `voiceMemory` | transcript → title + keepsake + milestone candidates |
| `searchQuery` | natural-language query → structured search filters |

### 7.3 Providers

`AiProvider` interface: `complete(task, input) → validated JSON`.
Implementations: `AnthropicProvider` (production; Claude structured outputs)
and `NullProvider` (dev/demo: deterministic templates so the product runs
end-to-end without credentials — clearly labeled, never pretending to be AI).
`TranscriptionProvider`: `WhisperCompatibleProvider` (any OpenAI-compatible
endpoint) + `NullTranscriptionProvider`.
Embeddings for semantic search live in `pgvector`, scoped per family, and are
queried only through authorization-filtered SQL.

## 8. Chapter generation

`chapter.generate` job (idempotent per `(childId, month)`):

1. Gather the month: approved memories, ready media, milestones, growth,
   voice memories.
2. Cluster media into events (time + location + visual similarity).
3. Score & select best photos/clips (5.3/5.4) with chronological diversity.
4. Suggest milestones from unclassified memories (→ pending confirmations).
5. Generate captions and monthly narrative (grounded; drafts).
6. Compose sections (cover, story, favorites, milestones, firsts, growth,
   collage, video memories, looking ahead) into `chapter_sections` — every
   section editable, re-orderable, hideable.
7. Produce artifacts: private web version (live render), print-ready PDF job,
   30–120s recap job (both queued separately).

A regenerate never clobbers parent edits: sections carry `edited_by_user`;
regeneration only refreshes untouched sections unless explicitly reset.

## 9. Books & print

- **Book types**: monthly album, first-year, birthday/annual (age 1→18),
  storybook, grandparent, milestone cards — all rows in `books` with typed
  structure in `book_pages` / `page_elements` (JSON layout blocks constrained
  by theme templates).
- **Themes** (`Minimal, Storybook, Vintage, Modern, Playful, Heirloom, Neutral`)
  are data: token sets (type scale, palette, decorative elements, cover and
  recap styling) consumed by both web renderer and PDF renderer.
- **Print pipeline**: `book.render` job produces interior + cover PDFs with
  bleed (3mm), trim, safe zones, and spine width computed from page count and
  paper weight; preflight validates every placed image ≥ target DPI (300 print,
  hard warning < 200) and page-count constraints per product.
- **`PrintProvider` interface**: `getProducts / quote / createOrder / getStatus / cancel`
  with a `ManualFulfillmentProvider` default and documented slots for
  Lulu/Peecho/RPI-style APIs. Orders, line items, costs and margins are DB rows.

## 10. Billing & usage

- `plans` + `plan_limits` (storage bytes, AI generations/mo, video minutes,
  members, books) are data, seeded: Free / Plus / Premium / Family.
- Stripe: Checkout for subscribe, customer portal for management, webhooks
  (`checkout.session.completed`, `customer.subscription.*`) reconcile
  `subscriptions`. Webhook handler verifies signatures and is idempotent
  (`stripe_events` dedupe table).
- `usage_ledger` meters storage deltas, AI calls, transcription seconds,
  render minutes. Limits are enforced at admission time (upload/generation)
  with clear in-product messaging — no surprise charges, ever.
- Physical products: `print_products` carry `base_cost_cents` and
  `retail_price_cents` (configurable margin); orders flow through Stripe
  payment intents.

## 11. Search

- **Structured**: filters over dates, people, tags, milestone types, media
  kind — plain SQL with indexes.
- **Full-text**: `tsvector` over titles, bodies, captions, transcripts.
- **Semantic**: pgvector embeddings per memory/media-caption, *always* joined
  through family-scoped authorization; the NL query is parsed by the
  `searchQuery` AI task into filters + an embedded query vector.

## 12. Notifications

`notifications` + `notification_preferences` per user/family with channels
email / push / (SMS-ready). Producers: chapter ready, family submission,
monthly capture summary, age milestones ("Rory turns 7 months tomorrow"),
gentle re-engagement, book ready. Web Push via VAPID; email via provider
abstraction (Resend/Postmark-compatible interface). Every notification type
individually mutable; quiet by default.

## 13. Mobile & PWA

Mobile is the primary surface: bottom tab bar (Home / Timeline / **Add** /
Chapters / Family) with a prominent center capture button; capture sheet
offers photo/video picker, voice recorder (MediaRecorder), and quick text.
Uploads are resumable and survive backgrounding where the platform allows.
PWA: manifest + icons + offline shell for browsing cached thumbnails; the
backend is a clean JSON API surface so native iOS/Android clients can be
added without new backend logic.

## 14. Observability & admin

- Structured JSON logs (request id, user id, family id — never captions or
  child names in log lines), audit log table for sensitive actions
  (deletions, share-link changes, role changes, support access).
- Admin console (staff-only, `users.staff_role`) exposes aggregate health:
  counts, subscription state, job failures, storage/AI cost curves, print
  orders, abuse reports. **No family media is visible by default**; support
  access requires an explicit, audited grant (`support_access_grants`).

## 15. Analytics

Event stream (`analytics_events`) with anonymized IDs: signup, child created,
first upload / memory / video / voice / chapter / recap / share, invites,
books created/purchased, retention cohorts, chapter generation frequency.
The activation metric is **first meaningful generated chapter viewed**.
No child names, captions, media, or transcripts ever leave the platform for
third-party analytics.

## 16. Application routes

Public: `/` (landing), `/pricing`, `/login`, `/signup`, `/reset-password`,
`/m/[token]` (QR resolver), `/s/[token]` (share links), `/demo` (synthetic family).

App: `/home`, `/timeline`, `/memories/new`, `/memories/[id]`,
`/children`, `/children/[id]`, `/chapters`, `/chapters/[id]`,
`/chapters/[id]/edit`, `/books`, `/books/[id]`, `/books/[id]/edit`,
`/recaps/[id]`, `/family`, `/family/feed`, `/family/invite`, `/letters`,
`/search`, `/assistant`, `/settings/*` (profile, notifications, privacy,
billing, export), `/admin/*` (staff).

API: `/api/uploads*`, `/api/media/[id]/url`, `/api/memories*`, `/api/chapters*`,
`/api/books*`, `/api/qr*`, `/api/shares*`, `/api/search`, `/api/assistant`,
`/api/webhooks/stripe`, `/api/exports`, `/api/jobs/[id]` (progress).

## 17. Design system

Warm editorial aesthetic — Apple Photos × Artifact Uprising × premium print
brand. Tokens: warm neutrals (`cream, sand, clay, ink`), serif display
(Fraunces-class) + humanist sans (system stack fallback), generous whitespace,
soft 16–24px radii, subtle grain/texture on covers only, restrained motion
(fade/translate, 150–250ms). Components in `src/components/ui` follow
shadcn-style composition (cva variants) without importing the generator.
Full a11y: focus rings, semantic landmarks, dialog traps, alt text fields on
all media, captions/transcripts for audio & video, AA contrast.

## 18. Long-term evolution

Nothing hard-codes "baby": ages are computed (supports 0–18+), milestone
categories are extensible per family, chapters are month-granular but the
same tables support school years, sports seasons, artwork archives and annual
books through age 18. The archive is exportable in full (originals +
metadata JSON + readable HTML index) at any time — families are never locked in.
