-- SIPs can point at a real mutual fund (AMFI scheme code) so the app can value them at live NAVs.
-- units_held / held_invested: holdings bought before tracking started, so value is right from day one.
alter table public.recurring
  add column scheme_code int,
  add column scheme_name text,
  add column units_held numeric(16, 4) not null default 0 check (units_held >= 0),
  add column held_invested numeric(14, 2) not null default 0 check (held_invested >= 0);
