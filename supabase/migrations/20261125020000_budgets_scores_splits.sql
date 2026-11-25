-- budgets: { "Food": 8000, ... } monthly limits per category.
-- credit_scores: [{ date, score, bureau }] typed in by the user (no bureau API: those need a lender licence).
-- Cards keep living in profiles.cards jsonb; new optional keys: statementDay, rewards { base, bonus: [{ match, rate }] }.
alter table public.profiles
  add column budgets jsonb not null default '{}'::jsonb,
  add column credit_scores jsonb not null default '[]'::jsonb;

-- split: [{ name, amount, settled }] friends' shares of a bill you paid. `amount` on the row stays YOUR share.
alter table public.transactions add column split jsonb;
