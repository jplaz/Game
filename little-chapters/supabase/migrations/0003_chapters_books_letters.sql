-- ─────────────────────────────────────────────────────────────────────────────
-- 0003 — chapters, books, storybooks, letters, video recaps, themes
-- ─────────────────────────────────────────────────────────────────────────────

-- Themes are data consumed by web renderer, PDF renderer and recap renderer.
create table themes (
  id          text primary key,          -- 'minimal','storybook','vintage',...
  name        text not null,
  description text not null,
  tokens      jsonb not null default '{}',   -- typography, palette, decoration
  is_premium  boolean not null default false,
  sort_order  int not null default 0
);

-- ── chapters ────────────────────────────────────────────────────────────────
-- A chapter is a month (or a special chapter like "Before You Arrived" /
-- "First Birthday") of one child's life, composed of ordered sections.
create table chapters (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  child_id      uuid not null references children(id) on delete cascade,
  kind          text not null default 'month'
                check (kind in ('month','pregnancy','birth','birthday','custom')),
  -- for month chapters: first day of the month covered
  period_start  date not null,
  period_end    date not null,
  title         text not null,             -- "Rory — Six Months"
  subtitle      text,
  theme_id      text not null default 'neutral' references themes(id),
  status        text not null default 'draft'
                check (status in ('draft','generating','ready','failed')),
  cover_media_id uuid references media(id) on delete set null,
  -- generation bookkeeping
  generated_at  timestamptz,
  generation_job_id uuid,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (period_end >= period_start),
  unique (child_id, kind, period_start)
);
create index chapters_child_idx on chapters(child_id, period_start desc);
create trigger chapters_updated before update on chapters
  for each row execute function set_updated_at();

-- Sections are the editable units. Regeneration only refreshes sections the
-- parent hasn't touched (edited_by_user stays sacred).
create table chapter_sections (
  id            uuid primary key default gen_random_uuid(),
  chapter_id    uuid not null references chapters(id) on delete cascade,
  section_type  text not null check (section_type in
                  ('cover','story','favorite_moments','milestones','firsts',
                   'things_you_loved','laughs','family_moments','places',
                   'growth','favorites_list','funny_moments','parent_notes',
                   'favorite_photo','favorite_video','collage','video_memories',
                   'looking_ahead','custom')),
  title         text,
  -- typed content: text blocks, media refs (media ids), list items, layout hints
  content       jsonb not null default '{}',
  sort_order    int not null default 0,
  hidden        boolean not null default false,
  edited_by_user boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index chapter_sections_chapter_idx on chapter_sections(chapter_id, sort_order);
create trigger chapter_sections_updated before update on chapter_sections
  for each row execute function set_updated_at();

-- ── books ───────────────────────────────────────────────────────────────────
create table books (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  child_id      uuid not null references children(id) on delete cascade,
  kind          text not null check (kind in
                  ('monthly','first_year','birthday','storybook','grandparent',
                   'milestone_cards','custom')),
  title         text not null,
  subtitle      text,
  theme_id      text not null default 'heirloom' references themes(id),
  status        text not null default 'draft'
                check (status in ('draft','generating','ready','rendering','rendered','failed')),
  -- year covered for birthday/annual books (age at the birthday, 1..18)
  year_number   int check (year_number between 0 and 18),
  cover_media_id uuid references media(id) on delete set null,
  trim_size     text not null default '210x210',    -- mm, square default
  page_count    int,
  interior_pdf_object_id uuid references storage_objects(id),
  cover_pdf_object_id    uuid references storage_objects(id),
  preflight     jsonb not null default '{}',        -- warnings, dpi report
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index books_child_idx on books(child_id, created_at desc);
create trigger books_updated before update on books
  for each row execute function set_updated_at();

create table book_pages (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references books(id) on delete cascade,
  page_number   int not null,
  layout        text not null default 'auto',   -- template id within the theme
  chapter_id    uuid references chapters(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (book_id, page_number)
);

create table page_elements (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references book_pages(id) on delete cascade,
  element_type  text not null check (element_type in
                  ('photo','text','caption','qr','collage','decoration','growth_chart','timeline')),
  media_id      uuid references media(id) on delete set null,
  qr_memory_id  uuid,                       -- fk added in 0004
  -- normalized geometry (0..1 of page box) + typed props (text, font role…)
  frame         jsonb not null default '{}',
  props         jsonb not null default '{}',
  sort_order    int not null default 0
);
create index page_elements_page_idx on page_elements(page_id, sort_order);

-- Storybooks: a narrative artifact built from selected real memories.
create table storybooks (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references books(id) on delete cascade,
  style         text not null default 'realistic'
                check (style in ('realistic','illustrated','playful')),
  -- source facts: the memory ids the story is allowed to draw from
  memory_ids    uuid[] not null default '{}',
  story_text    jsonb not null default '{}',  -- per-page paragraphs (drafts until approved)
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ── letters ─────────────────────────────────────────────────────────────────
create table letters (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  child_id      uuid not null references children(id) on delete cascade,
  author_id     uuid not null references users(id),
  kind          text not null default 'general' check (kind in
                  ('birthday','annual','future','first_day_of_school','graduation','general')),
  title         text not null,
  body          text not null,
  -- future letters stay sealed (invisible to non-authors) until unlock_at
  unlock_at     date,
  unlock_label  text,                      -- "Open on your 10th birthday"
  unlocked_at   timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index letters_child_idx on letters(child_id, created_at desc);
create trigger letters_updated before update on letters
  for each row execute function set_updated_at();

-- ── video recaps ────────────────────────────────────────────────────────────
create table video_recaps (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  child_id      uuid not null references children(id) on delete cascade,
  chapter_id    uuid references chapters(id) on delete set null,
  title         text not null,
  status        text not null default 'draft'
                check (status in ('draft','rendering','ready','failed')),
  aspect        text not null default '9:16' check (aspect in ('9:16','16:9','1:1')),
  target_duration_s int not null default 60 check (target_duration_s between 15 and 180),
  theme_id      text not null default 'neutral' references themes(id),
  -- ordered scene list: {mediaId, segment?, caption?, durationMs}
  storyboard    jsonb not null default '[]',
  music_track_id uuid,                      -- fk added below
  output_object_id uuid references storage_objects(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index video_recaps_child_idx on video_recaps(child_id, created_at desc);
create trigger video_recaps_updated before update on video_recaps
  for each row execute function set_updated_at();

-- Licensed music catalog. Licensing metadata is mandatory — no track enters
-- the catalog without a license record. User uploads carry their own license
-- attestation. Commercial copyrighted music is never scraped or bundled.
create table music_tracks (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid references families(id) on delete cascade, -- null = platform catalog
  title         text not null,
  artist        text,
  duration_ms   int,
  storage_object_id uuid references storage_objects(id),
  license_type  text not null check (license_type in
                  ('royalty_free','owned','user_licensed')),
  license_ref   text not null,            -- license id / receipt / attestation
  mood          text,
  created_at    timestamptz not null default now()
);
alter table video_recaps add constraint video_recaps_music_fk
  foreign key (music_track_id) references music_tracks(id) on delete set null;
