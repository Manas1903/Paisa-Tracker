-- Credit cards: spends count when swiped; paying the bill is a 'transfer' (bank → card), not spending.
-- `account` = which card a spend or bill payment belongs to.
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('expense', 'income', 'invest', 'transfer'));
alter table public.transactions add column account text;

-- cards: [{ name, limit?, dueDay? }]. salary_cutoff: salary arriving on/after this day counts for next month (null = off).
alter table public.profiles
  add column cards jsonb not null default '[]'::jsonb,
  add column salary_cutoff int default 25 check (salary_cutoff between 1 and 31);
