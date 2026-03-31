-- Run this in your Supabase SQL editor

-- Users table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  credits integer default 0,
  plan text default 'free', -- 'free' | 'starter'
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamp with time zone default now()
);

-- Enable RLS
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Jobs table
create table public.jobs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  zip_code text not null,
  county text,
  state text,
  lead_type text default 'pre_foreclosure',
  requested_count integer not null,
  status text default 'queued', -- 'queued' | 'scraping' | 'tracing' | 'complete' | 'failed'
  lead_count integer default 0,
  credits_used integer default 0,
  tracerfy_download text,
  error_message text,
  created_at timestamp with time zone default now(),
  completed_at timestamp with time zone
);

alter table public.jobs enable row level security;
create policy "Users can view own jobs" on public.jobs for select using (auth.uid() = user_id);
create policy "Users can create own jobs" on public.jobs for insert with check (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, credits)
  values (new.id, new.email, 10); -- 10 free credits on signup
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
