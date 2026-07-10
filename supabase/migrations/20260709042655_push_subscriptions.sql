create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

grant select, insert, update, delete on push_subscriptions to authenticated;

create policy push_subscriptions_owner_all on push_subscriptions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
