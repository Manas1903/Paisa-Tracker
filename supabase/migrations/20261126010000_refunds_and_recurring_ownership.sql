-- Keep statement credits as positive stored amounts with explicit refund semantics.
alter table public.transactions
  add column is_refund boolean not null default false;

-- A transaction must only link to a recurring row owned by the same user.
create unique index recurring_id_user_id_key on public.recurring (id, user_id);
alter table public.transactions
  add constraint transactions_recurring_owner_fkey
  foreign key (recurring_id, user_id)
  references public.recurring (id, user_id)
  on delete set null (recurring_id);

-- Bound user-controlled text and JSON fields to protect the free database tier.
alter table public.transactions
  add constraint transactions_category_length check (length(category) <= 80),
  add constraint transactions_merchant_length check (length(merchant) <= 200),
  add constraint transactions_mode_length check (length(mode) <= 80);

alter table public.recurring
  add constraint recurring_name_length check (length(name) <= 200),
  add constraint recurring_product_length check (product is null or length(product) <= 200),
  add constraint recurring_institution_length check (institution is null or length(institution) <= 160);

alter table public.profiles
  add constraint profiles_cards_size check (pg_column_size(cards) <= 65536),
  add constraint profiles_layout_size check (pg_column_size(layout) <= 16384),
  add constraint profiles_budgets_size check (pg_column_size(budgets) <= 16384),
  add constraint profiles_scores_size check (pg_column_size(credit_scores) <= 16384),
  add constraint profiles_quotes_size check (pg_column_size(stock_quotes) <= 65536);
