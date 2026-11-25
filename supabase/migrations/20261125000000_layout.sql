-- Per-user dashboard layout: card order and hidden cards, synced across devices.
alter table public.profiles add column layout jsonb;
