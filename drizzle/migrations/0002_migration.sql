create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  product_id text not null,
  price_id text not null,
  quantity integer not null default 1,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  environment text not null default 'sandbox',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_subscriptions_user_id on public.subscriptions(user_id);
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "Users view own subscription" on public.subscriptions for select to authenticated using (auth.uid() = user_id);

create table public.user_sessions (
  user_id uuid primary key,
  device_id text not null,
  updated_at timestamptz not null default now()
);
grant select on public.user_sessions to authenticated;
grant all on public.user_sessions to service_role;
alter table public.user_sessions enable row level security;
create policy "Users view own session" on public.user_sessions for select to authenticated using (auth.uid() = user_id);