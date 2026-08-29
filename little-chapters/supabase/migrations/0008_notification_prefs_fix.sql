-- ─────────────────────────────────────────────────────────────────────────────
-- 0008 — global (family-less) notification preferences need a partial unique
-- index: unique(user_id, family_id) treats NULLs as distinct, so upserts on
-- the global row would duplicate without this.
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists notification_prefs_global_idx
  on notification_preferences (user_id) where family_id is null;
