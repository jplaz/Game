# Little Chapters — Security Design & Threat Model

The platform stores the most sensitive category of consumer data there is:
private photos, videos and recordings of children. Security is a product
feature, not a checklist.

## Threat model

| Threat | Controls |
|---|---|
| **Private child media exposure via URL guessing** | No public buckets. All media served via short-lived signed URLs minted only after an authorization check. Share/QR tokens are ≥128-bit opaque IDs; storage keys never appear in tokens or client payloads. |
| **Authorization bypass (IDOR)** | Central `authz` layer: every resource access resolves user → family membership → role before the repository runs. Postgres RLS policies as an independent second layer. Authorization tests in CI cover cross-family access for children, memories, media, chapters, books, letters, share links. |
| **Storage bucket exposure** | All buckets private; derivative and original paths are namespaced per family; signed URL TTL ≤ 10 minutes for media, ≤ 1 hour for exports. Bucket policy audited in migration comments. |
| **Account takeover** | Supabase Auth (bcrypt/argon2 password hashing, verified email flows, OAuth with PKCE for Google/Apple), rate-limited login endpoints, session revocation on password change, recovery via verified email only. |
| **Family invitation abuse** | Invitations are single-use tokens with expiry, bound to an email, role capped at inviter's grantable roles (never owner), revocable, and audited. Accepting requires an authenticated session. |
| **Insecure share URLs** | Opaque tokens; default visibility `family`; optional password (per-link salted hash), expiry, revocation; view counting for owner awareness; downloads off by default. No search-engine indexing (`X-Robots-Tag: noindex` on all `/s/*`, `/m/*`). |
| **QR code access** | Same properties as share links plus a permanent redirect layer — the printed code contains no storage or identity information and every access re-evaluates current policy. |
| **Malicious uploads** | MIME allowlist enforced on admission *and* verified via magic-byte sniffing in the worker before processing; size limits per plan; images re-encoded (never served as uploaded bytes) for derivatives; malware-scan hook point in the ingest job (`media.scan`) with a documented ClamAV-compatible interface; SVG and executables rejected outright. |
| **Prompt injection via user content** | AI task modules wrap all user-provided text (captions, transcripts, notes) in delimited data blocks; system prompts instruct treating them as quoted material; outputs are Zod-validated and grounded-fact-checked; AI can never call tools or mutate data — it only returns JSON drafts that require human confirmation. |
| **Leaked logs** | Structured logging with an explicit field allowlist: IDs and event names only. Child names, captions, transcripts, tokens, and URLs with signatures are never logged. |
| **Deleted-account remnants** | Deletion pipeline: mark → revoke sessions/shares → enumerate `storage_objects` for hard delete → purge rows (FK cascades) → write a minimal audit tombstone. Documented retention for backups. |
| **CSRF** | State-changing routes require same-origin (`Origin`/`Sec-Fetch-Site` checks) + auth cookie with `SameSite=Lax`; webhooks use signature verification instead. |
| **XSS** | React escaping everywhere; no `dangerouslySetInnerHTML` for user content; CSP-friendly architecture (no inline event handlers); user text rendered as text, never HTML. |
| **Rate abuse** | Per-user and per-IP rate limits on auth, upload admission, share resolution, and AI endpoints (token-bucket in Postgres; CDN/WAF in front in production). |
| **Support staff overreach** | Admin console shows aggregates only. Any access to family content requires an explicit `support_access_grants` row (who, why, expiry) and every access is audit-logged and visible to the family owner. |

## Standing rules

1. **Default private.** Nothing is world-readable without an explicit owner action.
2. **Authorize every object**: child, family, media object, memory, book, page,
   video, audio file, share link — no route trusts a client-supplied ID.
3. **Two layers**: service-layer authz (friendly errors) + RLS (backstop).
4. **Secrets** only in environment variables; rotation supported for media
   token signing keys (comma-separated keyring, first key signs, all verify).
5. **Audit** all sensitive actions: role changes, deletions, share/QR policy
   changes, exports, support access.
6. **Webhooks** (Stripe) verify signatures and dedupe by event ID.

## Pre-production checklist

- [ ] Run authorization test suite (`tests/authz`) — must be green
- [ ] Verify all storage buckets private; attempt anonymous object fetch fails
- [ ] Verify `/s/*` and `/m/*` send `X-Robots-Tag: noindex`
- [ ] Pen-test invitation and share flows for token replay/expiry
- [ ] Confirm rate limits on `/api/auth/*`, `/api/uploads`, `/s/*`, `/m/*`
- [ ] Confirm logs contain no PII fields (run log-scrubber test)
- [ ] Delete a test account end-to-end; verify storage and rows are gone
- [ ] Rotate `MEDIA_TOKEN_SECRET` and verify old links keep working during overlap
