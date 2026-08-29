-- ─────────────────────────────────────────────────────────────────────────────
-- 0004 — share links, QR memories, comments, reactions, feed, notifications
-- ─────────────────────────────────────────────────────────────────────────────

-- ── share links ─────────────────────────────────────────────────────────────
-- Opaque, revocable, default family-only. Tokens are 26+ char base32 (≥128 bit)
-- generated server-side; only a hash is stored so a DB leak can't be replayed.
-- The public token itself is the URL path segment: /s/{token}
create table share_links (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  created_by    uuid not null references users(id),
  target_type   text not null check (target_type in
                  ('chapter','memory','book','recap','timeline','album')),
  target_id     uuid not null,
  token_hash    text not null unique,
  visibility    text not null default 'family'
                check (visibility in ('family','link','password')),
  password_hash text,                       -- scrypt(password, per-link salt)
  password_salt text,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  allow_download boolean not null default false,
  allow_comments boolean not null default false,
  view_count    int not null default 0,
  last_viewed_at timestamptz,
  created_at    timestamptz not null default now()
);
create index share_links_family_idx on share_links(family_id);
create index share_links_target_idx on share_links(target_type, target_id);

-- ── QR memories ─────────────────────────────────────────────────────────────
-- The permanent redirect layer for printed books. The printed code encodes
-- ONLY https://<app>/m/{token}. Token → this row → current memory/media.
-- Storage can migrate, media can be re-encoded; the printed page keeps working.
create table qr_memories (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  created_by    uuid not null references users(id),
  -- public token (not hashed: it is printed in physical books and must be
  -- resolvable forever; it carries no information and grants nothing by
  -- itself — policy below is evaluated on every scan)
  token         text not null unique,
  memory_id     uuid references memories(id) on delete set null,
  media_id      uuid references media(id) on delete set null,
  title         text,
  visibility    text not null default 'family'
                check (visibility in ('family','link','password','disabled')),
  password_hash text,
  password_salt text,
  expires_at    timestamptz,               -- 'time-limited' option
  revoked_at    timestamptz,               -- 'disabled' forever
  allow_download boolean not null default false,
  scan_count    int not null default 0,
  last_scanned_at timestamptz,
  created_at    timestamptz not null default now(),
  check (memory_id is not null or media_id is not null)
);
create index qr_memories_family_idx on qr_memories(family_id);

alter table page_elements add constraint page_elements_qr_fk
  foreign key (qr_memory_id) references qr_memories(id) on delete set null;

-- ── comments & reactions ────────────────────────────────────────────────────
create table comments (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  author_id     uuid not null references users(id),
  target_type   text not null check (target_type in ('memory','media','chapter','recap','letter')),
  target_id     uuid not null,
  body          text not null check (char_length(body) between 1 and 4000),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index comments_target_idx on comments(target_type, target_id, created_at);
create index comments_family_idx on comments(family_id, created_at desc);

create table reactions (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  author_id     uuid not null references users(id),
  target_type   text not null check (target_type in ('memory','media','chapter','recap','comment')),
  target_id     uuid not null,
  emoji         text not null check (emoji in ('❤️','😂','🥹','🎉')),
  created_at    timestamptz not null default now(),
  unique (author_id, target_type, target_id, emoji)
);
create index reactions_target_idx on reactions(target_type, target_id);

-- ── family feed ─────────────────────────────────────────────────────────────
-- Denormalized private activity stream (intimate, no public mechanics).
create table feed_items (
  id            bigint generated always as identity primary key,
  family_id     uuid not null references families(id) on delete cascade,
  actor_id      uuid references users(id) on delete set null,
  event_type    text not null,   -- 'memory.created','media.uploaded','milestone.confirmed',
                                 -- 'chapter.ready','recap.ready','comment.added','reaction.added'
  target_type   text,
  target_id     uuid,
  summary       text not null,   -- pre-rendered, family-visible line
  created_at    timestamptz not null default now()
);
create index feed_items_family_idx on feed_items(family_id, id desc);

-- ── notifications ───────────────────────────────────────────────────────────
create table notification_preferences (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  family_id     uuid references families(id) on delete cascade,
  -- notification type slug → {email: bool, push: bool, sms: bool}
  preferences   jsonb not null default '{}',
  unique (user_id, family_id)
);

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  family_id     uuid references families(id) on delete cascade,
  type          text not null,  -- 'chapter.ready','family.submission','capture.summary',
                                -- 'age.milestone','reengagement','book.ready',...
  title         text not null,
  body          text not null,
  link_path     text,
  read_at       timestamptz,
  channels_sent jsonb not null default '{}',  -- {email: ts, push: ts}
  created_at    timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc);

create table push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  endpoint      text not null unique,
  keys          jsonb not null,       -- {p256dh, auth}
  created_at    timestamptz not null default now()
);
