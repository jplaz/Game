# Build Roadmap & Status

Phases are cumulative; each ships a coherent slice of the full product
described in ARCHITECTURE.md. Status reflects this repository.

## Phase 1 — Foundation ✅
- Architecture, security, privacy design docs
- Full relational schema + RLS migrations
- Server foundation: db client, env config, structured logging, authz layer,
  Postgres job queue, storage driver abstraction (Supabase + local)
- Auth integration (Supabase email/OAuth) with dev fallback

## Phase 2 — Memory capture ✅
- Upload admission API (validation, quota, signed targets) + completion flow
- Media ingest pipeline: sniffing, EXIF, thumbnails, web derivatives,
  dHash dedupe, quality scoring
- Memories domain: text memories, versions (original always preserved),
  people tagging, milestones, growth entries
- Voice memories: upload, transcription provider, keepsake drafting flow

## Phase 3 — Intelligence & chapters ✅
- AI provider abstraction + task modules with Zod-validated structured output
- Grounding validator (no invented facts) + prompt-injection isolation
- Photo/video selection algorithm (quality × relevance × diversity)
- Chapter generation orchestration with editable sections
- Smart prompts + AI memory assistant endpoint

## Phase 4 — Family & sharing ✅
- Family roles, invitations, contributor approval flow
- Family feed, comments, reactions
- Share links (opaque, password, expiry, revocation)
- QR memory permanent-redirect layer + QR page rendering

## Phase 5 — Product surface ✅
- Design system + marketing landing page
- Home dashboard, timeline, capture flows, chapter viewer/editor,
  books, family, search, letters, settings
- PWA manifest + mobile-first navigation
- Demo family seed (fully synthetic)

## Phase 6 — Commerce & output ✅ (integration-ready)
- Plans/limits/usage metering; Stripe checkout + webhooks
- Book model, themes, print preflight (DPI/bleed/spine), print provider
  abstraction with manual fulfillment
- Video recap job scaffolding (ffmpeg storyboard renderer)
- Full-account export pipeline

## Phase 7 — Operate 🔜 next after connecting real services
- Admin console hardening, support access grants UI
- Adaptive streaming (HLS) variants; background upload resumption tuning
- Native mobile clients on the existing API surface
- Print provider API integration (Lulu/Peecho class)
- Malware scanning service attachment (interface is in place)
- Load/perf pass on 50k-item libraries (indexes are in place; verify plans)
