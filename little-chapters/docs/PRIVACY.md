# Little Chapters — Privacy Design

Privacy is a defining product feature. This document states what the
implementation actually does — no claims the code cannot guarantee.

## What is uploaded

- Photos, videos, and voice recordings you choose to upload.
- Text you write: memories, notes, letters, captions, comments.
- Optional structured data you enter: milestones, growth entries, birth
  details, people labels, locations.
- Technical metadata embedded in media files (EXIF dates, dimensions,
  duration). GPS metadata is extracted **only** if you enable location
  features; otherwise it is ignored and stripped from derivatives.

## What is analyzed, and by whom

| Processing | Where it runs | Leaves our infrastructure? |
|---|---|---|
| Thumbnails, web/print derivatives, quality scoring (sharpness, exposure), duplicate detection | Our workers (sharp/ffmpeg) | No |
| Voice transcription | Configured transcription provider | Yes — audio + resulting text, only when you record voice memories |
| AI writing (captions, monthly stories, storybooks, suggestions) | Configured AI provider (Anthropic by default) | Yes — only the specific confirmed memories/text needed for that generation, never your whole library |
| Semantic search embeddings | Computed via AI provider, stored in our database | Text snippets only; embeddings never leave the database and queries are family-scoped |
| Face grouping | **Not implemented.** The architecture reserves a consent-gated slot; no biometric identification runs today, silently or otherwise | — |

AI providers are used as processors with training disabled on API traffic
(Anthropic does not train on API data by default). **Uploaded content is
never used to train AI models.**

## How media is stored

- Private object storage buckets, namespaced per family; no public access.
- Originals are kept untouched (for print quality and export fidelity);
  derivatives (thumbnails, web versions, transcodes) are generated copies.
- Every access requires an authenticated, authorized request and uses signed
  URLs that expire within minutes.
- Temporary processing files on workers are deleted when the job finishes,
  and worker scratch space is wiped on deploy; nothing temporary persists
  beyond 24 hours.

## Sharing model — private by default

- New content is visible only to your family members, per their roles.
- Share links and QR codes exist only when you create them, use unguessable
  tokens, and can be password-protected, expiring, or revoked at any time.
- Nothing is ever indexed by search engines (`noindex` on all share surfaces).
- Family feed, comments, and reactions are visible only inside the family.
  There are no public profiles, followers, or engagement mechanics.

## Family permissions

Owner → full control including billing and deletion. Parent → manage all
memories and children. Contributor → may submit memories/media which parents
approve before they join the archive. Viewer → sees approved content only.
Invitations are email-bound, expiring, and revocable.

## Deleting your data

- Deleting a memory/media item removes it and its derivatives from storage
  (a 30-day trash window lets you undo; then purge is permanent).
- Deleting your account removes your content, storage objects, embeddings,
  and share tokens. Printed books you already own obviously remain yours;
  their QR codes stop resolving.
- Full export (originals + metadata + readable archive) is available to
  owners at any time — you are never locked in.

## Analytics

Product analytics use anonymized IDs and event names only. Child names,
captions, photos, transcripts, and free text never enter analytics events.

## Children's data

The account holder is always an adult guardian. Content about children is
controlled by their guardians; contributor submissions require guardian
approval; developmental "milestone" features are memory-keeping, never
assessment, and AI suggestions about a child are never recorded as fact
without explicit guardian confirmation.
