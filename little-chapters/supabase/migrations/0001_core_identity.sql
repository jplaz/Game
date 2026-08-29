-- ─────────────────────────────────────────────────────────────────────────────
-- 0001 — extensions, helpers, identity, families, children, people
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;
-- pgvector powers semantic search embeddings. On managed Postgres without the
-- extension this block is skipped and the embeddings column is created as bytea
-- fallback by 0002 (search degrades to full-text only).
do $$ begin
  create extension if not exists vector;
exception when others then
  raise notice 'pgvector unavailable; semantic search will be disabled';
end $$;

-- updated_at maintenance
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── users ────────────────────────────────────────────────────────────────────
-- Mirrors the auth provider's users (Supabase auth.users in production, dev
-- credential store locally). Application data always references this table.
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  display_name  text not null default '',
  avatar_media_id uuid, -- fk added in 0002 after media exists
  pronouns      text,
  locale        text not null default 'en',
  timezone      text not null default 'UTC',
  -- staff_role gates the internal admin console; null for all customers
  staff_role    text check (staff_role in ('support','admin')),
  onboarded_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger users_updated before update on users
  for each row execute function set_updated_at();

-- ── families ────────────────────────────────────────────────────────────────
create table families (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  created_by   uuid not null references users(id),
  -- soft delete window before storage purge
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger families_updated before update on families
  for each row execute function set_updated_at();

create table family_members (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null check (role in ('owner','parent','contributor','viewer')),
  -- how this member is shown in the family ("Grandma", "Uncle Sam")
  label       text,
  joined_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (family_id, user_id)
);
create index family_members_user_idx on family_members(user_id);
create index family_members_family_idx on family_members(family_id);

create table family_invitations (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families(id) on delete cascade,
  invited_by   uuid not null references users(id),
  email        text not null,
  role         text not null check (role in ('parent','contributor','viewer')),
  label        text,
  -- opaque single-use token; stored hashed so a DB leak can't mint invites
  token_hash   text not null unique,
  message      text,
  expires_at   timestamptz not null,
  accepted_by  uuid references users(id),
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index family_invitations_family_idx on family_invitations(family_id);

-- ── children ────────────────────────────────────────────────────────────────
-- Designed for ages 0–18+: nothing below assumes infancy. Family structure is
-- explicitly flexible (twins, adoption, foster, blended families).
create table children (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references families(id) on delete cascade,
  full_name       text not null,
  nickname        text,
  pronouns        text,
  birth_date      date,          -- nullable: pregnancy profiles exist pre-birth
  due_date        date,
  birth_time      time,
  birth_location  text,
  birth_weight_grams integer check (birth_weight_grams between 100 and 15000),
  birth_length_mm    integer check (birth_length_mm between 100 and 1000),
  profile_media_id uuid,         -- fk added in 0002
  -- 'expected' supports pregnancy chapters before birth
  status          text not null default 'active'
                  check (status in ('expected','active','archived')),
  pregnancy_story text,
  birth_story     text,
  personality_notes text,
  -- open-ended structured notes chosen by parents, e.g. favorite things,
  -- important places, family traditions, custom categories
  profile_sections jsonb not null default '[]',
  sort_order      int not null default 0,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index children_family_idx on children(family_id);
create trigger children_updated before update on children
  for each row execute function set_updated_at();

-- Guardians/relationships: free-text labels, no assumptions about structure.
create table child_guardians (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references children(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  relationship text not null, -- "Mom", "Dad", "Foster parent", "Guardian", ...
  unique (child_id, user_id)
);

-- Sibling / family relationships between children (twins, step-siblings…)
create table child_relationships (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references children(id) on delete cascade,
  related_child_id uuid not null references children(id) on delete cascade,
  relationship text not null, -- "twin", "sibling", "half-sibling", ...
  check (child_id <> related_child_id),
  unique (child_id, related_child_id)
);

-- ── people ──────────────────────────────────────────────────────────────────
-- Manually created known people (Grandma, Uncle…). May optionally link to a
-- platform user. NO biometric identity: tagging is always a human action.
create table people (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  name        text not null,
  relationship text,          -- "Grandma", "Family friend"
  user_id     uuid references users(id) on delete set null,
  avatar_media_id uuid,       -- fk added in 0002
  created_by  uuid not null references users(id),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index people_family_idx on people(family_id);

-- ── locations ───────────────────────────────────────────────────────────────
create table locations (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  name        text not null,           -- "Home", "Grandma's house", "Ocean Beach"
  latitude    double precision,
  longitude   double precision,
  created_at  timestamptz not null default now()
);
create index locations_family_idx on locations(family_id);

-- ── audit log ───────────────────────────────────────────────────────────────
create table audit_logs (
  id          bigint generated always as identity primary key,
  family_id   uuid references families(id) on delete set null,
  actor_id    uuid references users(id) on delete set null,
  action      text not null,             -- 'share_link.revoked', 'member.role_changed', …
  target_type text,
  target_id   uuid,
  -- structured details; must never contain media bytes or free-text child data
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_logs_family_idx on audit_logs(family_id, created_at desc);

-- Support access to family content requires an explicit, audited grant.
create table support_access_grants (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  staff_id    uuid not null references users(id),
  reason      text not null,
  granted_by  uuid not null references users(id),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
