-- Every table is private per user: Row-Level Security lets a signed-in user
-- see and change only rows where user_id = their own id.

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date timestamptz not null,
  amount numeric(12, 2) not null check (amount > 0),
  type text not null check (type in ('expense', 'income', 'invest')),
  category text not null,
  merchant text not null,
  mode text not null,
  created_at timestamptz not null default now()
);
create index on public.transactions (user_id, date desc);

-- EMIs, SIPs, subscriptions, bills, rent, salary.
create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null check (kind in ('Salary', 'EMI', 'SIP', 'Subscription', 'Bill', 'Rent')),
  type text not null check (type in ('expense', 'income', 'invest')),
  category text not null,
  amount numeric(12, 2) not null check (amount > 0),
  day int not null check (day between 1 and 31), -- clamped to month length in code
  month int check (month between 0 and 11), -- set only for yearly items
  start_date date not null,
  tenure int check (tenure > 0), -- months, EMIs only
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  target numeric(12, 2) not null check (target > 0),
  saved numeric(12, 2) not null default 0 check (saved >= 0),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  opening_balance numeric(12, 2) not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['transactions', 'recurring', 'goals', 'profiles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
