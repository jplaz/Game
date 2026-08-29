-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — Row Level Security
--
-- Two-layer authorization: the application authz service is the primary gate
-- (friendly errors, role semantics); RLS is the independent backstop so that
-- any client-side Supabase query — or a future bug in the service layer —
-- still cannot cross family boundaries. The server/worker connect with the
-- service role and are governed by the authz layer.
-- ─────────────────────────────────────────────────────────────────────────────

-- On plain Postgres (local dev) auth.uid() doesn't exist; provide a stub that
-- returns null (RLS then denies everything for non-service connections, which
-- is the correct fail-closed behavior).
do $$ begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql stable
      as 'select null::uuid';
  end if;
end $$;

-- role ordering helper: owner > parent > contributor > viewer
create or replace function family_role_rank(r text) returns int
language sql immutable as $$
  select case r when 'owner' then 4 when 'parent' then 3
                when 'contributor' then 2 when 'viewer' then 1 else 0 end
$$;

create or replace function is_family_member(fid uuid, min_role text default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from family_members fm
    where fm.family_id = fid
      and fm.user_id = auth.uid()
      and family_role_rank(fm.role) >= family_role_rank(min_role)
  )
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users u where u.id = auth.uid() and u.staff_role is not null)
$$;

-- ── enable + policies ───────────────────────────────────────────────────────
alter table users enable row level security;
create policy users_self_read on users for select using (id = auth.uid());
create policy users_self_update on users for update using (id = auth.uid());

alter table families enable row level security;
create policy families_member_read on families for select using (is_family_member(id));
create policy families_owner_write on families for update using (is_family_member(id,'owner'));

alter table family_members enable row level security;
create policy family_members_read on family_members for select using (is_family_member(family_id));
create policy family_members_manage on family_members for all using (is_family_member(family_id,'parent'));

alter table family_invitations enable row level security;
create policy invitations_read on family_invitations for select using (is_family_member(family_id,'parent'));
create policy invitations_manage on family_invitations for all using (is_family_member(family_id,'parent'));

alter table children enable row level security;
create policy children_read on children for select using (is_family_member(family_id));
create policy children_write on children for all using (is_family_member(family_id,'parent'));

alter table child_guardians enable row level security;
create policy child_guardians_read on child_guardians for select
  using (exists (select 1 from children c where c.id = child_id and is_family_member(c.family_id)));
create policy child_guardians_write on child_guardians for all
  using (exists (select 1 from children c where c.id = child_id and is_family_member(c.family_id,'parent')));

alter table child_relationships enable row level security;
create policy child_relationships_read on child_relationships for select
  using (exists (select 1 from children c where c.id = child_id and is_family_member(c.family_id)));
create policy child_relationships_write on child_relationships for all
  using (exists (select 1 from children c where c.id = child_id and is_family_member(c.family_id,'parent')));

alter table people enable row level security;
create policy people_read on people for select using (is_family_member(family_id));
create policy people_write on people for all using (is_family_member(family_id,'parent'));

alter table locations enable row level security;
create policy locations_read on locations for select using (is_family_member(family_id));
create policy locations_write on locations for all using (is_family_member(family_id,'contributor'));

alter table storage_objects enable row level security;
create policy storage_objects_read on storage_objects for select
  using (family_id is not null and is_family_member(family_id));

alter table media enable row level security;
-- viewers see approved, non-hidden media; contributors additionally see their
-- own pending uploads; parents see everything
create policy media_read on media for select using (
  is_family_member(family_id,'parent')
  or (is_family_member(family_id) and approval_status = 'approved' and hidden = false)
  or (is_family_member(family_id,'contributor') and uploaded_by = auth.uid())
);
create policy media_insert on media for insert
  with check (is_family_member(family_id,'contributor') and uploaded_by = auth.uid());
create policy media_update on media for update using (is_family_member(family_id,'parent'));
create policy media_delete on media for delete using (is_family_member(family_id,'parent'));

alter table media_variants enable row level security;
create policy media_variants_read on media_variants for select
  using (exists (select 1 from media m where m.id = media_id and is_family_member(m.family_id)));

alter table media_analysis enable row level security;
create policy media_analysis_read on media_analysis for select
  using (exists (select 1 from media m where m.id = media_id and is_family_member(m.family_id,'parent')));

alter table media_segments enable row level security;
create policy media_segments_read on media_segments for select
  using (exists (select 1 from media m where m.id = media_id and is_family_member(m.family_id)));

alter table memories enable row level security;
create policy memories_read on memories for select using (
  is_family_member(family_id,'parent')
  or (is_family_member(family_id) and approval_status = 'approved')
  or (is_family_member(family_id,'contributor') and created_by = auth.uid())
);
create policy memories_insert on memories for insert
  with check (is_family_member(family_id,'contributor') and created_by = auth.uid());
create policy memories_update on memories for update using (is_family_member(family_id,'parent'));
create policy memories_delete on memories for delete using (is_family_member(family_id,'parent'));

alter table memory_versions enable row level security;
create policy memory_versions_read on memory_versions for select
  using (exists (select 1 from memories m where m.id = memory_id and is_family_member(m.family_id)));

alter table memory_media enable row level security;
create policy memory_media_rw on memory_media for all
  using (exists (select 1 from memories m where m.id = memory_id and is_family_member(m.family_id,'contributor')));

alter table memory_people enable row level security;
create policy memory_people_rw on memory_people for all
  using (exists (select 1 from memories m where m.id = memory_id and is_family_member(m.family_id,'contributor')));

alter table media_people enable row level security;
create policy media_people_rw on media_people for all
  using (exists (select 1 from media m where m.id = media_id and is_family_member(m.family_id,'contributor')));

alter table milestone_catalog enable row level security;
create policy milestone_catalog_read on milestone_catalog for select
  using (family_id is null or is_family_member(family_id));
create policy milestone_catalog_write on milestone_catalog for all
  using (family_id is not null and is_family_member(family_id,'parent'));

alter table milestones enable row level security;
create policy milestones_read on milestones for select using (
  is_family_member(family_id,'parent')
  or (is_family_member(family_id) and status = 'confirmed')
);
create policy milestones_write on milestones for all using (is_family_member(family_id,'parent'));

alter table growth_entries enable row level security;
create policy growth_read on growth_entries for select using (is_family_member(family_id));
create policy growth_write on growth_entries for all using (is_family_member(family_id,'parent'));

alter table themes enable row level security;
create policy themes_read on themes for select using (true);

alter table chapters enable row level security;
create policy chapters_read on chapters for select using (is_family_member(family_id));
create policy chapters_write on chapters for all using (is_family_member(family_id,'parent'));

alter table chapter_sections enable row level security;
create policy chapter_sections_read on chapter_sections for select
  using (exists (select 1 from chapters c where c.id = chapter_id and is_family_member(c.family_id)));
create policy chapter_sections_write on chapter_sections for all
  using (exists (select 1 from chapters c where c.id = chapter_id and is_family_member(c.family_id,'parent')));

alter table books enable row level security;
create policy books_read on books for select using (is_family_member(family_id));
create policy books_write on books for all using (is_family_member(family_id,'parent'));

alter table book_pages enable row level security;
create policy book_pages_rw on book_pages for all
  using (exists (select 1 from books b where b.id = book_id and is_family_member(b.family_id,'parent')));
create policy book_pages_read on book_pages for select
  using (exists (select 1 from books b where b.id = book_id and is_family_member(b.family_id)));

alter table page_elements enable row level security;
create policy page_elements_rw on page_elements for all
  using (exists (select 1 from book_pages p join books b on b.id = p.book_id
                 where p.id = page_id and is_family_member(b.family_id,'parent')));
create policy page_elements_read on page_elements for select
  using (exists (select 1 from book_pages p join books b on b.id = p.book_id
                 where p.id = page_id and is_family_member(b.family_id)));

alter table storybooks enable row level security;
create policy storybooks_rw on storybooks for all
  using (exists (select 1 from books b where b.id = book_id and is_family_member(b.family_id,'parent')));

alter table letters enable row level security;
-- sealed future letters are visible only to their author until unlocked
create policy letters_read on letters for select using (
  is_family_member(family_id)
  and (unlock_at is null or unlock_at <= current_date or author_id = auth.uid())
);
create policy letters_insert on letters for insert
  with check (is_family_member(family_id,'contributor') and author_id = auth.uid());
create policy letters_update on letters for update
  using (author_id = auth.uid() or is_family_member(family_id,'owner'));

alter table video_recaps enable row level security;
create policy recaps_read on video_recaps for select using (is_family_member(family_id));
create policy recaps_write on video_recaps for all using (is_family_member(family_id,'parent'));

alter table music_tracks enable row level security;
create policy music_read on music_tracks for select
  using (family_id is null or is_family_member(family_id));
create policy music_write on music_tracks for all
  using (family_id is not null and is_family_member(family_id,'parent'));

alter table share_links enable row level security;
create policy share_links_rw on share_links for all using (is_family_member(family_id,'parent'));

alter table qr_memories enable row level security;
create policy qr_memories_rw on qr_memories for all using (is_family_member(family_id,'parent'));

alter table comments enable row level security;
create policy comments_read on comments for select using (is_family_member(family_id));
create policy comments_insert on comments for insert
  with check (is_family_member(family_id) and author_id = auth.uid());
create policy comments_delete on comments for delete
  using (author_id = auth.uid() or is_family_member(family_id,'parent'));

alter table reactions enable row level security;
create policy reactions_read on reactions for select using (is_family_member(family_id));
create policy reactions_rw on reactions for all
  using (is_family_member(family_id) and author_id = auth.uid());

alter table feed_items enable row level security;
create policy feed_read on feed_items for select using (is_family_member(family_id));

alter table notification_preferences enable row level security;
create policy notif_prefs_rw on notification_preferences for all using (user_id = auth.uid());

alter table notifications enable row level security;
create policy notifications_rw on notifications for all using (user_id = auth.uid());

alter table push_subscriptions enable row level security;
create policy push_subs_rw on push_subscriptions for all using (user_id = auth.uid());

alter table plans enable row level security;
create policy plans_read on plans for select using (true);
alter table plan_limits enable row level security;
create policy plan_limits_read on plan_limits for select using (true);

alter table subscriptions enable row level security;
create policy subscriptions_read on subscriptions for select using (is_family_member(family_id));

alter table payments enable row level security;
create policy payments_read on payments for select using (is_family_member(family_id,'owner'));

alter table usage_ledger enable row level security;
create policy usage_read on usage_ledger for select using (is_family_member(family_id,'parent'));

alter table print_providers enable row level security;
create policy print_providers_read on print_providers for select using (true);
alter table print_products enable row level security;
create policy print_products_read on print_products for select using (true);

alter table print_orders enable row level security;
create policy print_orders_read on print_orders for select using (is_family_member(family_id,'parent'));
create policy print_orders_write on print_orders for all using (is_family_member(family_id,'parent'));

alter table print_order_items enable row level security;
create policy print_order_items_read on print_order_items for select
  using (exists (select 1 from print_orders o where o.id = order_id and is_family_member(o.family_id,'parent')));

alter table jobs enable row level security;
create policy jobs_read on jobs for select
  using (family_id is not null and is_family_member(family_id));

alter table ai_generations enable row level security;
create policy ai_generations_read on ai_generations for select
  using (family_id is not null and is_family_member(family_id,'parent'));

alter table exports enable row level security;
create policy exports_rw on exports for all using (is_family_member(family_id,'owner'));

alter table audit_logs enable row level security;
create policy audit_read on audit_logs for select
  using (family_id is not null and is_family_member(family_id,'owner'));

alter table support_access_grants enable row level security;
create policy support_grants_family_read on support_access_grants for select
  using (is_family_member(family_id,'owner') or is_staff());

-- analytics_events, stripe_events, rate_limits: service-role only (no policies;
-- RLS enabled = deny-all for non-service connections)
alter table analytics_events enable row level security;
alter table stripe_events enable row level security;
alter table rate_limits enable row level security;

do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'embeddings') then
    execute 'alter table embeddings enable row level security';
    execute 'create policy embeddings_read on embeddings for select using (is_family_member(family_id))';
  end if;
end $$;
