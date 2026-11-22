-- Moreeh connector: run once in the SQL Editor of the app's Supabase project.
-- Creates the admin list, the audit log and two read-only functions Moreeh's dashboard uses.
-- Safe to run again.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'support')),
  apps text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.admin_audit (
  id bigserial primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_user uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
alter table public.admin_audit enable row level security;
revoke all on public.admins, public.admin_audit from anon, authenticated;
grant all on public.admins, public.admin_audit to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Dashboard numbers: sign-ups. Add your own app's numbers later.
create or replace function public.moreeh_overview(p_days integer default 7)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'new_users', (select count(*) from auth.users where created_at > now() - make_interval(days => p_days)),
    'active_users', (select count(*) from auth.users where last_sign_in_at > now() - make_interval(days => p_days)),
    'per_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'value', coalesce(n, 0)) order by d), '[]'::jsonb)
                from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
                left join (select date_trunc('day', created_at) dd, count(*) n from auth.users where created_at > now() - interval '15 days' group by 1) x on x.dd = d)
  );
$$;
create or replace function public.moreeh_detail(p_kind text, p_days integer default 7)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'title', case p_kind when 'new_users' then 'New users this week' when 'active_users' then 'Signed in this week' else 'All users (newest first)' end,
    'columns', jsonb_build_array('Email', 'Joined:date', 'Last sign-in:date'),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(email, created_at, last_sign_in_at) order by created_at desc) from (
      select email, created_at, last_sign_in_at from auth.users
      where p_kind = 'users'
         or (p_kind = 'new_users' and created_at > now() - make_interval(days => p_days))
         or (p_kind = 'active_users' and last_sign_in_at > now() - make_interval(days => p_days))
      order by created_at desc limit 200) u), '[]'::jsonb));
$$;
revoke all on function public.moreeh_overview(integer), public.moreeh_detail(text, integer) from public, anon, authenticated;
grant execute on function public.moreeh_overview(integer), public.moreeh_detail(text, integer) to service_role;

-- Make yourself the owner (change the email):
-- insert into public.admins (user_id, role) select id, 'owner' from auth.users where email = 'you@example.com' on conflict do nothing;
