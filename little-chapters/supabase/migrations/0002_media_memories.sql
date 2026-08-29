-- ─────────────────────────────────────────────────────────────────────────────
-- 0002 — storage objects, media pipeline, memories, milestones, growth
-- ─────────────────────────────────────────────────────────────────────────────

-- ── storage objects ─────────────────────────────────────────────────────────
-- Every stored blob has exactly one row here. Application tables reference
-- these ids; raw storage URLs/keys never appear anywhere else, so the storage
-- backend can be migrated wholesale (critical for decades-long QR longevity).
create table storage_objects (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid references families(id) on delete set null,
  bucket        text not null check (bucket in
                  ('originals','derivatives','print-assets','renders','exports')),
  object_key    text not null,
  content_type  text not null,
  size_bytes    bigint not null check (size_bytes >= 0),
  checksum_sha256 text,
  purpose       text not null,  -- 'original','thumb','web','poster','web_video',
                                -- 'print','pdf_interior','pdf_cover','recap','export'
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (bucket, object_key)
);
create index storage_objects_family_idx on storage_objects(family_id);

-- ── media ───────────────────────────────────────────────────────────────────
create table media (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  child_id      uuid references children(id) on delete set null,
  uploaded_by   uuid not null references users(id),
  kind          text not null check (kind in ('photo','video','audio')),
  status        text not null default 'uploading' check (status in
                  ('uploading','processing','ready','failed','rejected')),
  original_object_id uuid references storage_objects(id),
  original_filename  text,
  declared_content_type text not null,
  declared_size_bytes  bigint not null,
  -- verified by the worker via magic-byte sniffing (never trusts extension)
  verified_content_type text,
  width         int,
  height        int,
  duration_ms   int,
  captured_at   timestamptz,     -- from EXIF/container metadata or user edit
  captured_at_source text check (captured_at_source in ('exif','user','upload_time')),
  -- perceptual hash for duplicate/burst clustering (64-bit dHash, hex)
  phash         text,
  -- deterministic quality metrics computed by the worker
  sharpness     real,            -- variance of Laplacian, normalized 0..1
  exposure      real,            -- 0 = very dark, 1 = blown out, 0.5 ideal
  quality_score real,            -- combined 0..1
  duplicate_of  uuid references media(id) on delete set null,
  location_id   uuid references locations(id) on delete set null,
  is_favorite   boolean not null default false,
  hidden        boolean not null default false,
  -- contributor uploads await parent approval
  approval_status text not null default 'approved'
                  check (approval_status in ('pending','approved','declined')),
  alt_text      text,
  error_message text,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index media_family_captured_idx on media(family_id, captured_at desc);
create index media_child_captured_idx on media(child_id, captured_at desc);
create index media_status_idx on media(family_id, status);
create index media_phash_idx on media(family_id, phash);
create trigger media_updated before update on media
  for each row execute function set_updated_at();

-- Derived renditions (thumb, web, poster, transcodes, print-ready copies).
create table media_variants (
  id            uuid primary key default gen_random_uuid(),
  media_id      uuid not null references media(id) on delete cascade,
  variant       text not null check (variant in
                  ('thumb','web','poster','web_video','hls','print','waveform')),
  storage_object_id uuid not null references storage_objects(id) on delete cascade,
  width         int,
  height        int,
  duration_ms   int,
  created_at    timestamptz not null default now(),
  unique (media_id, variant)
);

-- Analysis results from deterministic and AI passes. Suggestions ONLY —
-- nothing here is a fact until a parent confirms it into a memory/milestone.
create table media_analysis (
  id            uuid primary key default gen_random_uuid(),
  media_id      uuid not null references media(id) on delete cascade,
  analyzer      text not null,   -- 'quality','dedupe','video_metrics','ai_relevance','ai_labels'
  result        jsonb not null default '{}',
  model         text,            -- AI model id when applicable
  created_at    timestamptz not null default now(),
  unique (media_id, analyzer)
);

-- Video-specific: candidate highlight segments (worker-derived suggestions)
create table media_segments (
  id            uuid primary key default gen_random_uuid(),
  media_id      uuid not null references media(id) on delete cascade,
  start_ms      int not null,
  end_ms        int not null,
  kind          text not null default 'highlight'
                check (kind in ('highlight','speech','scene')),
  score         real,
  check (end_ms > start_ms)
);

-- ── memories ────────────────────────────────────────────────────────────────
create table memories (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  child_id      uuid not null references children(id) on delete cascade,
  created_by    uuid not null references users(id),
  kind          text not null default 'moment' check (kind in
                  ('moment','milestone','voice','growth','event','trip','holiday','first','pregnancy')),
  title         text,
  -- current display text (may be the accepted keepsake version)
  body          text,
  happened_at   date not null,
  happened_time time,
  location_id   uuid references locations(id) on delete set null,
  tags          text[] not null default '{}',
  approval_status text not null default 'approved'
                  check (approval_status in ('pending','approved','declined')),
  is_favorite   boolean not null default false,
  comments_enabled boolean not null default true,
  -- voice memories
  audio_media_id uuid references media(id) on delete set null,
  transcript    text,             -- verbatim transcription, preserved
  search_tsv    tsvector,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index memories_child_date_idx on memories(child_id, happened_at desc);
create index memories_family_idx on memories(family_id, happened_at desc);
create index memories_tsv_idx on memories using gin(search_tsv);
create index memories_tags_idx on memories using gin(tags);
create trigger memories_updated before update on memories
  for each row execute function set_updated_at();

create or replace function memories_tsv_update() returns trigger as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('simple', coalesce(new.title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.body,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.transcript,'')), 'C') ||
    setweight(to_tsvector('simple', array_to_string(new.tags,' ')), 'B');
  return new;
end $$ language plpgsql;
create trigger memories_tsv before insert or update of title, body, transcript, tags
  on memories for each row execute function memories_tsv_update();

-- Every text state is preserved: the parent's original words are never lost.
create table memory_versions (
  id            uuid primary key default gen_random_uuid(),
  memory_id     uuid not null references memories(id) on delete cascade,
  source        text not null check (source in ('user','ai','ai_edited')),
  title         text,
  body          text,
  ai_generation_id uuid,          -- fk added in 0005
  created_by    uuid references users(id),
  created_at    timestamptz not null default now()
);
create index memory_versions_memory_idx on memory_versions(memory_id, created_at);

create table memory_media (
  memory_id   uuid not null references memories(id) on delete cascade,
  media_id    uuid not null references media(id) on delete cascade,
  sort_order  int not null default 0,
  primary key (memory_id, media_id)
);
create index memory_media_media_idx on memory_media(media_id);

create table memory_people (
  memory_id   uuid not null references memories(id) on delete cascade,
  person_id   uuid not null references people(id) on delete cascade,
  primary key (memory_id, person_id)
);
create index memory_people_person_idx on memory_people(person_id);

create table media_people (
  media_id    uuid not null references media(id) on delete cascade,
  person_id   uuid not null references people(id) on delete cascade,
  tagged_by   uuid references users(id),
  primary key (media_id, person_id)
);

-- ── milestones ──────────────────────────────────────────────────────────────
-- Catalog of well-known milestones plus per-family custom ones. Memory
-- preservation, never assessment: no "expected age" pressure fields surface
-- in product copy; typical_age_months exists only for gentle prompt ordering.
create table milestone_catalog (
  id            uuid primary key default gen_random_uuid(),
  category      text not null check (category in
                  ('movement','communication','food','sleep','social','travel',
                   'holidays','family','personality','firsts','custom')),
  slug          text not null unique,
  title         text not null,
  typical_age_months int,
  family_id     uuid references families(id) on delete cascade  -- null = global
);

create table milestones (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  child_id      uuid not null references children(id) on delete cascade,
  catalog_id    uuid references milestone_catalog(id),
  title         text not null,
  category      text not null,
  happened_at   date not null,
  memory_id     uuid references memories(id) on delete set null,
  -- 'suggested' = AI/worker proposal awaiting parent confirmation.
  -- Suggested milestones NEVER appear in chapters, books, or exports.
  status        text not null default 'confirmed'
                check (status in ('suggested','confirmed','dismissed')),
  suggested_reason text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now()
);
create index milestones_child_idx on milestones(child_id, happened_at);

-- ── growth ──────────────────────────────────────────────────────────────────
create table growth_entries (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  child_id      uuid not null references children(id) on delete cascade,
  measured_at   date not null,
  weight_grams  integer check (weight_grams between 100 and 200000),
  height_mm     integer check (height_mm between 100 and 2500),
  head_circumference_mm integer check (head_circumference_mm between 100 and 700),
  clothing_size text,
  shoe_size     text,
  diaper_size   text,
  note          text,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now()
);
create index growth_entries_child_idx on growth_entries(child_id, measured_at);

-- deferred FKs from 0001 now that media exists
alter table users add constraint users_avatar_fk
  foreign key (avatar_media_id) references media(id) on delete set null;
alter table children add constraint children_profile_media_fk
  foreign key (profile_media_id) references media(id) on delete set null;
alter table people add constraint people_avatar_fk
  foreign key (avatar_media_id) references media(id) on delete set null;
