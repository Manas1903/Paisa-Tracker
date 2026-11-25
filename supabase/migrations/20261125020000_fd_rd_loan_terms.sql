-- Fixed deposits, recurring deposits and amortized loan terms.
alter table public.recurring
  drop constraint if exists recurring_kind_check;

alter table public.recurring
  add constraint recurring_kind_check
  check (kind in ('Salary', 'EMI', 'SIP', 'FD', 'RD', 'Subscription', 'Bill', 'Rent')),
  add column annual_rate numeric(6, 3) check (annual_rate between 0 and 100),
  add column loan_principal numeric(12, 2) check (loan_principal > 0),
  add column institution text,
  add column product text,
  add column compounding_frequency text check (compounding_frequency in ('monthly', 'quarterly', 'half-yearly', 'yearly')),
  add column payout_frequency text check (payout_frequency in ('maturity', 'monthly', 'quarterly', 'half-yearly', 'yearly')),
  add column maturity_amount numeric(12, 2) check (maturity_amount >= 0),
  add column maturity_date date,
  add column maturity_instruction text check (maturity_instruction in ('credit', 'renew-principal', 'renew-principal-interest'));

alter table public.profiles
  add column stock_quotes jsonb not null default '{}'::jsonb;

alter table public.transactions
  add column annual_rate numeric(6, 3) check (annual_rate between 0 and 100),
  add column tenure_months int check (tenure_months between 1 and 600),
  add column institution text,
  add column product text,
  add column compounding_frequency text check (compounding_frequency in ('monthly', 'quarterly', 'half-yearly', 'yearly')),
  add column payout_frequency text check (payout_frequency in ('maturity', 'monthly', 'quarterly', 'half-yearly', 'yearly')),
  add column maturity_amount numeric(12, 2) check (maturity_amount >= 0),
  add column maturity_date date,
  add column maturity_instruction text check (maturity_instruction in ('credit', 'renew-principal', 'renew-principal-interest')),
  add column stock_symbol text,
  add column stock_quantity numeric(16, 6) check (stock_quantity > 0),
  add column stock_unit_price numeric(16, 6) check (stock_unit_price > 0);
