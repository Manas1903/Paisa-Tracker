-- Friends, invite links, shared splits, shared stats, challenges, goal buddies.
-- See docs/adr/0001-shared-splits-own-tables.md and GLOSSARY.md.
-- Rule: rows here are visible to more than one user, so every write that touches
-- another user goes through a security-definer function that checks the caller.

-- ---------- people: the display name friends and split participants see ----------
create table public.people (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 40)
);

-- ---------- friendships: one row per direction; shares_stats = "share my stats" with friend_id ----------
create table public.friendships (
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  shares_stats boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index on public.friendships (friend_id);

create function public.is_friend(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships where user_id = (select auth.uid()) and friend_id = other);
$$;

-- true when `owner` has turned on "share my stats" for the caller
create function public.shares_with_me(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships where user_id = owner and friend_id = (select auth.uid()) and shares_stats);
$$;

-- ---------- invites: single use, 7 days ----------
create table public.invites (
  code text primary key default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invites (created_by);

-- Landing page, before sign-up: who invited me, and is the link still good? Reveals only the inviter's display name.
create function public.invite_info(p_code text) returns table (inviter_name text, valid boolean)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.display_name, 'A friend'), (i.used_by is null and i.expires_at > now())
  from public.invites i left join public.people p on p.user_id = i.created_by
  where i.code = p_code;
$$;

create function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); inv public.invites;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into inv from public.invites where code = p_code for update;
  if not found then raise exception 'Invite not found'; end if;
  if inv.created_by = me then raise exception 'This is your own invite link'; end if;
  if inv.used_by is not null then
    if inv.used_by = me then return inv.created_by; end if;
    raise exception 'This invite was already used';
  end if;
  if inv.expires_at <= now() then raise exception 'This invite has expired'; end if;
  update public.invites set used_by = me, used_at = now() where code = p_code;
  insert into public.friendships (user_id, friend_id) values (me, inv.created_by), (inv.created_by, me)
    on conflict do nothing;
  return inv.created_by;
end $$;

-- Removing a friend removes both directions (sharing stops at once). Shared splits stay.
create function public.remove_friend(p_friend uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships
  where (user_id = (select auth.uid()) and friend_id = p_friend) or (user_id = p_friend and friend_id = (select auth.uid()));
  delete from public.goal_buddies
  where (user_id = (select auth.uid()) and friend_id = p_friend) or (user_id = p_friend and friend_id = (select auth.uid()));
end $$;

-- ---------- shared splits ----------
create table public.splits (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  payer uuid not null references auth.users on delete cascade,
  total numeric(12, 2) not null check (total > 0),
  date timestamptz not null,
  merchant text not null check (length(merchant) <= 200),
  category text not null check (length(category) <= 80),
  updated_at timestamptz not null default now()
);

-- One row per participant, the payer included. settled = how much of this share has been paid back.
create table public.split_shares (
  split_id uuid not null references public.splits on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  settled numeric(12, 2) not null default 0,
  primary key (split_id, user_id),
  check (settled >= 0 and settled <= amount)
);
create index on public.split_shares (user_id);

-- The payer's own payment method (UPI, which card). Private to the payer, never shared.
create table public.split_private (
  split_id uuid not null references public.splits on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mode text not null check (length(mode) <= 80),
  account text check (account is null or length(account) <= 120),
  primary key (split_id, user_id)
);

-- Every add / edit / settle / delete. Kept after a split is deleted (no foreign key on purpose).
create table public.split_history (
  id bigint generated always as identity primary key,
  split_id uuid not null,
  actor uuid not null references auth.users on delete cascade,
  action text not null check (action in ('added', 'edited', 'settled', 'deleted')),
  before jsonb,
  after jsonb,
  participants uuid[] not null,
  at timestamptz not null default now()
);
create index on public.split_history using gin (participants);

create function public.is_participant(p_split uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.split_shares where split_id = p_split and user_id = (select auth.uid()));
$$;

-- Snapshot of a split for history: header + shares.
create function public.split_snapshot(p_split uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'payer', s.payer, 'total', s.total, 'date', s.date, 'merchant', s.merchant, 'category', s.category,
    'shares', (select jsonb_agg(jsonb_build_object('user_id', sh.user_id, 'amount', sh.amount, 'settled', sh.settled) order by sh.user_id)
               from public.split_shares sh where sh.split_id = s.id))
  from public.splits s where s.id = p_split;
$$;

-- Create (p_id null) or edit a split. Any participant may edit. New participants must be the caller's friends.
-- p_shares: [{ "user_id": uuid, "amount": number }], must include the payer and add up to p_total.
-- Settled amounts are kept per person, capped at their new share.
create function public.save_split(
  p_id uuid, p_payer uuid, p_total numeric, p_date timestamptz, p_merchant text, p_category text, p_shares jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); sid uuid := p_id; old_snap jsonb; new_ids uuid[]; old_ids uuid[]; tot numeric;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select array_agg((e->>'user_id')::uuid), sum((e->>'amount')::numeric) into new_ids, tot from jsonb_array_elements(p_shares) e;
  if new_ids is null or array_length(new_ids, 1) < 2 then raise exception 'A split needs at least two people'; end if;
  if (select count(distinct x) from unnest(new_ids) x) <> array_length(new_ids, 1) then raise exception 'Someone is listed twice'; end if;
  if not (me = any(new_ids)) then raise exception 'You must be part of the split'; end if;
  if not (p_payer = any(new_ids)) then raise exception 'The payer must be part of the split'; end if;
  if abs(tot - p_total) > 0.01 then raise exception 'Shares must add up to the total'; end if;

  if sid is null then
    old_ids := array[me];
  else
    if not public.is_participant(sid) then raise exception 'Not your split'; end if;
    old_snap := public.split_snapshot(sid);
    select array_agg(user_id) into old_ids from public.split_shares where split_id = sid;
  end if;
  -- anyone being added must be a friend of the person adding them
  if exists (select 1 from unnest(new_ids) x where x <> me and not (x = any(old_ids))
             and not exists (select 1 from public.friendships f where f.user_id = me and f.friend_id = x)) then
    raise exception 'You can only add friends to a split';
  end if;

  if sid is null then
    insert into public.splits (created_by, payer, total, date, merchant, category)
      values (me, p_payer, p_total, p_date, p_merchant, p_category) returning id into sid;
  else
    update public.splits set payer = p_payer, total = p_total, date = p_date, merchant = p_merchant, category = p_category, updated_at = now()
      where id = sid;
    delete from public.split_shares where split_id = sid and not (user_id = any(new_ids));
    -- a new payer must not inherit the old payer's private payment method
    delete from public.split_private where split_id = sid and user_id <> p_payer;
  end if;
  insert into public.split_shares (split_id, user_id, amount)
    select sid, (e->>'user_id')::uuid, (e->>'amount')::numeric from jsonb_array_elements(p_shares) e
  on conflict (split_id, user_id) do update set amount = excluded.amount, settled = least(public.split_shares.settled, excluded.amount);
  -- the payer's own share is never "owed"
  update public.split_shares set settled = 0 where split_id = sid and user_id = p_payer;

  insert into public.split_history (split_id, actor, action, before, after, participants)
    values (sid, me, case when old_snap is null then 'added' else 'edited' end, old_snap, public.split_snapshot(sid),
            (select array(select distinct x from unnest(new_ids || old_ids) x)));
  return sid;
end $$;

create function public.delete_split(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare snap jsonb; ids uuid[];
begin
  if not public.is_participant(p_id) then raise exception 'Not your split'; end if;
  snap := public.split_snapshot(p_id);
  select array_agg(user_id) into ids from public.split_shares where split_id = p_id;
  delete from public.splits where id = p_id;
  insert into public.split_history (split_id, actor, action, before, after, participants)
    values (p_id, auth.uid(), 'deleted', snap, null, ids);
end $$;

-- Set how much of one person's share is settled. Any participant may do it; no confirmation (undo = set it back).
-- p_items: [{ "split_id": uuid, "user_id": uuid, "settled": number }]
create function public.settle_shares(p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare e jsonb; sid uuid; old_snap jsonb;
begin
  for e in select * from jsonb_array_elements(p_items) loop
    sid := (e->>'split_id')::uuid;
    if not public.is_participant(sid) then raise exception 'Not your split'; end if;
    old_snap := public.split_snapshot(sid);
    update public.split_shares sh set settled = (e->>'settled')::numeric
      from public.splits s
      where sh.split_id = sid and sh.user_id = (e->>'user_id')::uuid and s.id = sid and s.payer <> sh.user_id;
    if not found then raise exception 'Nothing to settle for that person'; end if;
    insert into public.split_history (split_id, actor, action, before, after, participants)
      values (sid, auth.uid(), 'settled', old_snap, public.split_snapshot(sid),
              (select array_agg(user_id) from public.split_shares where split_id = sid));
  end loop;
end $$;

-- ---------- stage 3: shared stats, goal buddies, challenges ----------
-- Percentages and scores only, never rupee amounts (enforced by the app; size-capped here).
create table public.shared_stats (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  stats jsonb not null default '{}'::jsonb check (pg_column_size(stats) <= 32768),
  updated_at timestamptz not null default now()
);

create table public.goal_buddies (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  goal_name text not null check (length(goal_name) <= 80),
  progress_pct numeric(5, 1) not null check (progress_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('no_spend_weekend', 'low_spend_week', 'savings_rate')),
  target numeric(5, 1) check (target is null or target between 0 and 100),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

-- what changed since I last looked (split updates + nudges pop-up)
alter table public.profiles add column updates_seen_at timestamptz not null default now();

-- ---------- Row-Level Security ----------
alter table public.people enable row level security;
alter table public.friendships enable row level security;
alter table public.invites enable row level security;
alter table public.splits enable row level security;
alter table public.split_shares enable row level security;
alter table public.split_private enable row level security;
alter table public.split_history enable row level security;
alter table public.shared_stats enable row level security;
alter table public.goal_buddies enable row level security;
alter table public.challenges enable row level security;

create policy "own row" on public.people for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "friends and co-participants read" on public.people for select to authenticated
  using (public.is_friend(user_id) or exists (
    select 1 from public.split_shares a join public.split_shares b on a.split_id = b.split_id
    where a.user_id = (select auth.uid()) and b.user_id = people.user_id));

create policy "both sides read" on public.friendships for select to authenticated
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));
create policy "toggle my sharing" on public.friendships for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own invites" on public.invites for select to authenticated using (created_by = (select auth.uid()));
create policy "create invites" on public.invites for insert to authenticated with check (created_by = (select auth.uid()));
create policy "delete own unused" on public.invites for delete to authenticated using (created_by = (select auth.uid()) and used_by is null);

create policy "participants read" on public.splits for select to authenticated using (public.is_participant(id));
create policy "participants read" on public.split_shares for select to authenticated using (public.is_participant(split_id));
create policy "own rows" on public.split_private for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.splits s where s.id = split_id and s.payer = (select auth.uid())));
create policy "participants read" on public.split_history for select to authenticated using ((select auth.uid()) = any(participants));

create policy "own row" on public.shared_stats for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "friends who share read" on public.shared_stats for select to authenticated using (public.shares_with_me(user_id));

create policy "own rows" on public.goal_buddies for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_friend(friend_id));
create policy "buddy reads" on public.goal_buddies for select to authenticated
  using (friend_id = (select auth.uid()) and public.shares_with_me(user_id));

create policy "both read" on public.challenges for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));
create policy "challenge a friend" on public.challenges for insert to authenticated
  with check (from_user = (select auth.uid()) and status = 'pending' and public.is_friend(to_user));
create policy "invitee answers" on public.challenges for update to authenticated
  using (to_user = (select auth.uid())) with check (to_user = (select auth.uid()));
create policy "either deletes" on public.challenges for delete to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

-- ---------- grants (hosted projects don't auto-grant) ----------
revoke all on public.people, public.friendships, public.invites, public.splits, public.split_shares, public.split_private,
  public.split_history, public.shared_stats, public.goal_buddies, public.challenges from anon, authenticated;
grant select, insert, update on public.people to authenticated;
grant select on public.friendships to authenticated;
grant update (shares_stats) on public.friendships to authenticated;
grant select, insert, delete on public.invites to authenticated;
grant select on public.splits, public.split_shares, public.split_history to authenticated;
grant select, insert, update, delete on public.split_private to authenticated;
grant select, insert, update, delete on public.shared_stats, public.goal_buddies to authenticated;
grant select, insert, delete on public.challenges to authenticated;
grant update (status) on public.challenges to authenticated;

revoke execute on function public.is_friend, public.shares_with_me, public.invite_info, public.accept_invite, public.remove_friend,
  public.is_participant, public.split_snapshot, public.save_split, public.delete_split, public.settle_shares from public, anon, authenticated;
grant execute on function public.invite_info to anon, authenticated;
grant execute on function public.is_friend, public.shares_with_me, public.accept_invite, public.remove_friend,
  public.is_participant, public.save_split, public.delete_split, public.settle_shares to authenticated;
