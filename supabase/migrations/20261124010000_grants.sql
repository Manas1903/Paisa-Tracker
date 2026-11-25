-- Newer hosted projects don't auto-grant table access. Signed-in users get CRUD;
-- Row-Level Security still limits them to their own rows. Anonymous gets nothing.
grant select, insert, update, delete on public.transactions, public.recurring, public.goals, public.profiles to authenticated;
revoke all on public.transactions, public.recurring, public.goals, public.profiles from anon;
