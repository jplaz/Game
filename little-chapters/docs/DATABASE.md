# Database Model

Authoritative schema lives in `supabase/migrations/*.sql` (plain SQL, applied
in order by `npm run db:migrate`, tracked in `_migrations`). This is the map.

## Table groups

**Identity & family** (`0001`)
- `users` — mirrors auth provider; `staff_role` gates the admin console
- `families`, `family_members` (roles: owner/parent/contributor/viewer),
  `family_invitations` (hashed single-use tokens, email-bound, expiring)
- `children` — supports pregnancy (`status='expected'`), 0–18+, flexible
  structure via `child_guardians` (free-text relationships) and
  `child_relationships` (twins, step-siblings); open-ended `profile_sections`
- `people` (manually created; **no biometrics**), `locations`
- `audit_logs`, `support_access_grants`

**Media & memories** (`0002`)
- `storage_objects` — every blob; app tables reference ids, never URLs
- `media` (photo/video/audio; status machine, EXIF `captured_at`, dHash
  `phash`, deterministic quality metrics, approval flow for contributors)
- `media_variants` (thumb/web/poster/web_video/hls/print/waveform),
  `media_analysis` (suggestions only), `media_segments` (video highlights)
- `memories` + `memory_versions` (original text always preserved; keepsake
  versions are additional rows), `memory_media`, `memory_people`, `media_people`
- `milestone_catalog` (global + per-family custom), `milestones`
  (**status: suggested→confirmed/dismissed; suggested never leaves the app**)
- `growth_entries` (memory-keeping, no medical interpretation)

**Chapters, books, letters, recaps** (`0003`)
- `themes` (design tokens as data, shared by web/PDF/recap renderers)
- `chapters` (month/pregnancy/birth/birthday/custom per child) +
  `chapter_sections` (editable units; `edited_by_user` protects parent edits
  from regeneration)
- `books` (first_year/birthday/storybook/grandparent/…; print PDFs +
  preflight report) + `book_pages` + `page_elements` (typed layout blocks,
  QR elements) + `storybooks` (style + source `memory_ids` — the grounding set)
- `letters` (sealed `future` letters unlock by date; author-only until then)
- `video_recaps` (storyboard JSON, aspect, theme, music) + `music_tracks`
  (license metadata mandatory)

**Sharing & social** (`0004`)
- `share_links` — hashed opaque tokens, visibility family/link/password,
  expiry, revocation, download/comment toggles, view counting
- `qr_memories` — the permanent redirect layer for printed books (plain
  token by design: printed forever; policy re-evaluated on every scan)
- `comments`, `reactions` (fixed emoji set), `feed_items` (private family feed)
- `notifications`, `notification_preferences`, `push_subscriptions`

**Billing, jobs, ops** (`0005`)
- `plans` + `plan_limits` (business model as data), `subscriptions`,
  `stripe_events` (webhook idempotency), `payments`
- `usage_ledger` — append-only metering (storage/AI/transcription/render)
- `print_providers`, `print_products` (trim/bleed/DPI/base cost vs retail),
  `print_orders`, `print_order_items`
- `jobs` — Postgres queue (SKIP LOCKED claim, idempotency keys, retries,
  progress for UI), `ai_generations` (full AI ledger + acceptance tracking),
  `embeddings` (pgvector, family-scoped), `exports`, `analytics_events`
  (anonymized), `rate_limits`

**RLS** (`0006`) — every table; `is_family_member(family_id, min_role)`
helper; deny-all for service-only tables. **Reference seed** (`0007`) —
plans, limits, themes, milestone catalog, print products.

## Conventions

- UUID PKs (`gen_random_uuid`), `timestamptz` audit columns with
  `set_updated_at` triggers, soft delete via `deleted_at` where users may
  want undo (media, memories, chapters, books, children, families), hard
  cascade elsewhere.
- Facts vs drafts: AI output lands in `ai_generations` / `*_versions` /
  `status='suggested'` rows. Only explicit user action promotes drafts into
  authoritative columns.
- Hot paths indexed: `(child_id, captured_at desc)`, `(family_id, happened_at)`,
  GIN on tsvector/tags, partial index for queue claims.
