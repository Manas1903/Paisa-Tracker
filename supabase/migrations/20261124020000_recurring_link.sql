-- Link each payment to the recurring item it pays (EMI, SIP, bill…), so renames and edits
-- never break "paid" status. Existing rows are linked by matching name and type.
alter table public.transactions
  add column recurring_id uuid references public.recurring on delete set null;
create index on public.transactions (recurring_id);

update public.transactions t
set recurring_id = r.id
from public.recurring r
where t.recurring_id is null
  and t.user_id = r.user_id
  and t.merchant = r.name
  and t.type = r.type;
