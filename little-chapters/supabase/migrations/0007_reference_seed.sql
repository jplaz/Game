-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — reference data: plans, themes, milestone catalog, print products
-- (idempotent; safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────────

insert into plans (id, name, description, monthly_price_cents, yearly_price_cents, sort_order) values
  ('free',    'Free',    'Start their story: capture memories, a taste of chapters.', 0, 0, 0),
  ('plus',    'Plus',    'Monthly chapters, AI writing, more storage.',               799, 7900, 1),
  ('premium', 'Premium', 'Books, video recaps, premium themes, full collaboration.', 1499, 14900, 2),
  ('family',  'Family',  'Everything, more storage, the whole family on board.',     2499, 24900, 3)
on conflict (id) do nothing;

insert into plan_limits (plan_id, limit_key, limit_value) values
  ('free',    'storage_bytes',                2147483648),      -- 2 GB
  ('free',    'video_minutes_month',          10),
  ('free',    'ai_generations_month',         10),
  ('free',    'transcription_minutes_month',  10),
  ('free',    'members',                      3),
  ('free',    'children',                     2),
  ('free',    'books',                        0),
  ('free',    'recaps_month',                 0),
  ('plus',    'storage_bytes',                107374182400),    -- 100 GB
  ('plus',    'video_minutes_month',          120),
  ('plus',    'ai_generations_month',         200),
  ('plus',    'transcription_minutes_month',  120),
  ('plus',    'members',                      6),
  ('plus',    'children',                     4),
  ('plus',    'books',                        -1),
  ('plus',    'recaps_month',                 2),
  ('premium', 'storage_bytes',                1099511627776),   -- 1 TB
  ('premium', 'video_minutes_month',          -1),
  ('premium', 'ai_generations_month',         -1),
  ('premium', 'transcription_minutes_month',  600),
  ('premium', 'members',                      12),
  ('premium', 'children',                     -1),
  ('premium', 'books',                        -1),
  ('premium', 'recaps_month',                 -1),
  ('family',  'storage_bytes',                2199023255552),   -- 2 TB
  ('family',  'video_minutes_month',          -1),
  ('family',  'ai_generations_month',         -1),
  ('family',  'transcription_minutes_month',  -1),
  ('family',  'members',                      -1),
  ('family',  'children',                     -1),
  ('family',  'books',                        -1),
  ('family',  'recaps_month',                 -1)
on conflict (plan_id, limit_key) do nothing;

insert into themes (id, name, description, is_premium, sort_order, tokens) values
  ('neutral',  'Neutral',   'Warm, modern parenting aesthetic.', false, 0,
   '{"display":"serif-warm","palette":{"bg":"#FDFBF7","accent":"#B07A55","ink":"#2B2823"},"decoration":"none"}'),
  ('minimal',  'Minimal',   'Editorial, white space, timeless.', false, 1,
   '{"display":"serif-light","palette":{"bg":"#FFFFFF","accent":"#3B382F","ink":"#1F1D19"},"decoration":"none"}'),
  ('storybook','Storybook', 'Soft, whimsical elements.',         true, 2,
   '{"display":"serif-round","palette":{"bg":"#FBF4EC","accent":"#D69686","ink":"#524E47"},"decoration":"soft-corners"}'),
  ('vintage',  'Vintage',   'Film-inspired warmth.',             true, 3,
   '{"display":"serif-classic","palette":{"bg":"#F6EFE3","accent":"#96613F","ink":"#3B382F"},"decoration":"grain"}'),
  ('modern',   'Modern',    'Magazine editorial.',               true, 4,
   '{"display":"sans-tight","palette":{"bg":"#FFFFFF","accent":"#1F1D19","ink":"#1F1D19"},"decoration":"rules"}'),
  ('playful',  'Playful',   'Bright and cheerful.',              true, 5,
   '{"display":"sans-round","palette":{"bg":"#FFF9F0","accent":"#7E9370","ink":"#2B2823"},"decoration":"dots"}'),
  ('heirloom', 'Heirloom',  'Elegant, timeless, made to be held.', true, 6,
   '{"display":"serif-fine","palette":{"bg":"#FAF6EE","accent":"#7A4D31","ink":"#1F1D19"},"decoration":"foil-rule"}')
on conflict (id) do nothing;

insert into milestone_catalog (category, slug, title, typical_age_months) values
  ('movement',      'first-smile',        'First smile', 2),
  ('movement',      'rolled-over',        'Rolled over', 4),
  ('movement',      'sat-independently',  'Sat independently', 6),
  ('movement',      'first-crawl',        'First crawl', 8),
  ('movement',      'pulled-to-stand',    'Pulled up to stand', 9),
  ('movement',      'first-steps',        'First steps', 12),
  ('communication', 'first-laugh',        'First laugh', 3),
  ('communication', 'first-babble',       'First babble', 5),
  ('communication', 'first-word',         'First word', 12),
  ('communication', 'said-mama',          'Said “Mama”', 12),
  ('communication', 'said-dada',          'Said “Dada”', 12),
  ('food',          'first-food',         'First food', 6),
  ('food',          'first-finger-food',  'First finger food', 8),
  ('sleep',         'slept-through-night','Slept through the night', null),
  ('sleep',         'first-nap-in-crib',  'First nap in the crib', null),
  ('social',        'met-grandparents',   'Met the grandparents', null),
  ('social',        'first-playdate',     'First playdate', null),
  ('travel',        'first-trip',         'First trip', null),
  ('travel',        'first-beach-day',    'First beach day', null),
  ('travel',        'first-flight',       'First flight', null),
  ('holidays',      'first-christmas',    'First Christmas', null),
  ('holidays',      'first-halloween',    'First Halloween', null),
  ('holidays',      'first-birthday',     'First birthday', 12),
  ('family',        'came-home',          'Came home', 0),
  ('family',        'first-family-photo', 'First family photo', 0),
  ('firsts',        'first-bath',         'First bath', 0),
  ('firsts',        'first-tooth',        'First tooth', 7),
  ('firsts',        'first-haircut',      'First haircut', null),
  ('firsts',        'first-swim',         'First swim', null),
  ('firsts',        'first-snow',         'First snow', null),
  ('firsts',        'first-day-of-school','First day of school', 60)
on conflict (slug) do nothing;

insert into print_providers (id, name, is_active) values
  ('manual', 'Manual fulfillment', true)
on conflict (id) do nothing;

insert into print_products
  (id, provider_id, name, kind, trim_size, min_pages, max_pages,
   base_cost_cents, retail_price_cents, extra_page_cost_cents, extra_page_price_cents) values
  ('hardcover-210sq', 'manual', 'Hardcover Book 21×21 cm',   'hardcover', '210x210', 20, 200, 2200, 5900, 25, 75),
  ('layflat-210sq',   'manual', 'Layflat Book 21×21 cm',     'layflat',   '210x210', 20, 120, 3800, 8900, 60, 140),
  ('softcover-210sq', 'manual', 'Softcover Book 21×21 cm',   'softcover', '210x210', 20, 200, 1100, 3400, 15, 50),
  ('mini-140sq',      'manual', 'Mini Book 14×14 cm',        'mini',      '140x140', 20, 100,  700, 1900, 10, 35),
  ('grandparent-180sq','manual','Grandparent Book 18×18 cm', 'softcover', '180x180', 20, 120,  900, 2900, 12, 45),
  ('milestone-cards', 'manual', 'Milestone Card Set',        'milestone_cards', '105x148', 1, 40, 500, 1900, 0, 0),
  ('photo-prints',    'manual', 'Photo Prints (set of 20)',  'prints',    '102x152', 1, 1,  300, 1200, 0, 0)
on conflict (id) do nothing;
