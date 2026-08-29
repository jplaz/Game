-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — plans/billing/usage, print commerce, job queue, AI ledger, exports,
--        embeddings, analytics, rate limiting
-- ─────────────────────────────────────────────────────────────────────────────

-- ── plans & billing ─────────────────────────────────────────────────────────
-- Business model is data, not code.
create table plans (
  id            text primary key,          -- 'free','plus','premium','family'
  name          text not null,
  description   text not null,
  monthly_price_cents int not null default 0,
  yearly_price_cents  int not null default 0,
  stripe_price_id_monthly text,
  stripe_price_id_yearly  text,
  is_active     boolean not null default true,
  sort_order    int not null default 0
);

create table plan_limits (
  plan_id       text not null references plans(id) on delete cascade,
  limit_key     text not null,   -- 'storage_bytes','video_minutes_month',
                                 -- 'ai_generations_month','transcription_minutes_month',
                                 -- 'members','children','books','recaps_month'
  limit_value   bigint not null, -- -1 = unlimited
  primary key (plan_id, limit_key)
);

create table subscriptions (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  plan_id       text not null references plans(id),
  status        text not null default 'active' check (status in
                  ('active','trialing','past_due','canceled','incomplete')),
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index subscriptions_family_active_idx
  on subscriptions(family_id) where status in ('active','trialing','past_due');
create trigger subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();

-- Stripe webhook idempotency
create table stripe_events (
  id            text primary key,          -- Stripe event id
  type          text not null,
  processed_at  timestamptz not null default now()
);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  kind          text not null check (kind in ('subscription','print_order')),
  amount_cents  int not null,
  currency      text not null default 'usd',
  stripe_payment_intent_id text unique,
  status        text not null check (status in
                  ('pending','succeeded','failed','refunded','partially_refunded')),
  print_order_id uuid,                     -- fk added below
  created_at    timestamptz not null default now()
);

-- ── usage metering ──────────────────────────────────────────────────────────
-- Append-only ledger; balances are aggregates. Never surprise users:
-- limits are enforced at admission time with clear messaging.
create table usage_ledger (
  id            bigint generated always as identity primary key,
  family_id     uuid not null references families(id) on delete cascade,
  metric        text not null,   -- 'storage_bytes','video_minutes','ai_generations',
                                 -- 'transcription_seconds','render_minutes'
  delta         bigint not null, -- bytes/seconds/count; negative on delete
  ref_type      text,
  ref_id        uuid,
  created_at    timestamptz not null default now()
);
create index usage_ledger_family_metric_idx on usage_ledger(family_id, metric, created_at);

-- ── print commerce ──────────────────────────────────────────────────────────
create table print_providers (
  id            text primary key,          -- 'manual','lulu',...
  name          text not null,
  is_active     boolean not null default true,
  config        jsonb not null default '{}'
);

create table print_products (
  id            text primary key,          -- 'hardcover-210sq','softcover-210sq',...
  provider_id   text not null references print_providers(id),
  name          text not null,
  kind          text not null check (kind in
                  ('hardcover','softcover','layflat','mini','milestone_cards','prints')),
  trim_size     text not null,             -- '210x210' mm
  min_pages     int not null default 20,
  max_pages     int not null default 200,
  bleed_mm      numeric not null default 3,
  safe_zone_mm  numeric not null default 6,
  target_dpi    int not null default 300,
  min_dpi       int not null default 200,
  base_cost_cents   int not null,          -- provider cost (configurable margin:
  retail_price_cents int not null,         --  retail − base = margin)
  extra_page_cost_cents int not null default 0,
  extra_page_price_cents int not null default 0,
  is_active     boolean not null default true
);

create table print_orders (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  ordered_by    uuid not null references users(id),
  provider_id   text not null references print_providers(id),
  status        text not null default 'draft' check (status in
                  ('draft','awaiting_payment','paid','submitted','in_production',
                   'shipped','delivered','canceled','refunded','failed')),
  shipping_address jsonb,                  -- structured, validated at checkout
  provider_order_ref text,
  subtotal_cents int not null default 0,
  shipping_cents int not null default 0,
  total_cents    int not null default 0,
  tracking_url   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index print_orders_family_idx on print_orders(family_id, created_at desc);
create trigger print_orders_updated before update on print_orders
  for each row execute function set_updated_at();

create table print_order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references print_orders(id) on delete cascade,
  product_id    text not null references print_products(id),
  book_id       uuid references books(id) on delete set null,
  quantity      int not null default 1 check (quantity between 1 and 50),
  page_count    int,
  unit_price_cents int not null,
  unit_cost_cents  int not null
);

alter table payments add constraint payments_print_order_fk
  foreign key (print_order_id) references print_orders(id) on delete set null;

-- ── job queue ───────────────────────────────────────────────────────────────
-- Postgres-backed queue consumed by the worker fleet with FOR UPDATE SKIP
-- LOCKED. Doubles as the user-visible processing status store.
create table jobs (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,   -- 'media.ingest','media.analyze','media.transcode',
                                 -- 'voice.transcribe','chapter.generate','book.render',
                                 -- 'recap.render','export.build','notify.dispatch',...
  family_id     uuid references families(id) on delete cascade,
  -- idempotency: enqueueing the same (type, idempotency_key) while one is
  -- pending/running is a no-op (partial unique index below)
  idempotency_key text,
  payload       jsonb not null default '{}',
  status        text not null default 'queued' check (status in
                  ('queued','running','succeeded','failed','dead','canceled')),
  priority      int not null default 5,       -- 1 = highest
  attempts      int not null default 0,
  max_attempts  int not null default 5,
  run_at        timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  progress      real not null default 0,      -- 0..1 for UI
  progress_note text,
  last_error    text,
  locked_by     text,
  locked_at     timestamptz,
  created_at    timestamptz not null default now()
);
create index jobs_claim_idx on jobs(status, run_at, priority) where status = 'queued';
create index jobs_family_idx on jobs(family_id, created_at desc);
create unique index jobs_idempotent_idx on jobs(type, idempotency_key)
  where idempotency_key is not null and status in ('queued','running');

-- ── AI ledger ───────────────────────────────────────────────────────────────
-- Every AI call is recorded: task, inputs hash, validated output, cost.
-- Outputs are drafts/suggestions; application tables stay authoritative.
create table ai_generations (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid references families(id) on delete cascade,
  child_id      uuid references children(id) on delete set null,
  task          text not null,
  provider      text not null,
  model         text,
  input_hash    text,                      -- sha256 of canonical input (dedupe/cache)
  output        jsonb,
  status        text not null default 'succeeded'
                check (status in ('succeeded','failed','rejected_by_validation')),
  input_tokens  int,
  output_tokens int,
  cost_microdollars bigint,
  accepted      boolean,                   -- did the parent accept the draft?
  created_at    timestamptz not null default now()
);
create index ai_generations_family_idx on ai_generations(family_id, created_at desc);
create index ai_generations_cache_idx on ai_generations(task, input_hash);

alter table memory_versions add constraint memory_versions_ai_fk
  foreign key (ai_generation_id) references ai_generations(id) on delete set null;

-- ── embeddings (semantic search) ────────────────────────────────────────────
do $$ begin
  execute 'create table embeddings (
    id          uuid primary key default gen_random_uuid(),
    family_id   uuid not null references families(id) on delete cascade,
    target_type text not null check (target_type in (''memory'',''media'')),
    target_id   uuid not null,
    content_hash text not null,
    embedding   vector(1536),
    created_at  timestamptz not null default now(),
    unique (target_type, target_id)
  )';
  execute 'create index embeddings_family_idx on embeddings(family_id)';
exception when others then
  raise notice 'embeddings table skipped (pgvector unavailable)';
end $$;

-- ── exports ─────────────────────────────────────────────────────────────────
create table exports (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  requested_by  uuid not null references users(id),
  scope         text not null default 'full' check (scope in ('full','child','media_only')),
  child_id      uuid references children(id) on delete set null,
  status        text not null default 'queued'
                check (status in ('queued','building','ready','failed','expired')),
  storage_object_id uuid references storage_objects(id),
  size_bytes    bigint,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- ── analytics (anonymized) ──────────────────────────────────────────────────
-- No child names, captions, media or free text — event names + anon ids only.
create table analytics_events (
  id            bigint generated always as identity primary key,
  anon_user_id  text not null,   -- salted hash of user id
  anon_family_id text,
  event         text not null,   -- 'signup','child_created','first_upload',
                                 -- 'first_chapter_viewed','book_purchased',...
  props         jsonb not null default '{}',  -- numeric/enum props only
  created_at    timestamptz not null default now()
);
create index analytics_events_event_idx on analytics_events(event, created_at);

-- ── rate limiting (token bucket) ────────────────────────────────────────────
create table rate_limits (
  bucket_key    text primary key,          -- 'login:ip:1.2.3.4', 'share:token:…'
  tokens        real not null,
  updated_at    timestamptz not null default now()
);
