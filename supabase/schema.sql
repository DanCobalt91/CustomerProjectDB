-- Supabase schema and policies for CustomerProjectDB
-- Run this in the Supabase SQL editor (or via the CLI) to prepare the database
-- for the front-end app. The script is idempotent so it can be applied multiple
-- times.

create extension if not exists "pgcrypto";

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  name text not null,
  address text,
  contact_name text,
  contact_phone text,
  contact_email text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  number text not null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  number text not null,
  type text not null check (type in ('Build', 'Onsite')),
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  number text not null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.customers add column if not exists owner_id uuid references auth.users(id);
alter table public.projects add column if not exists owner_id uuid references auth.users(id);
alter table public.work_orders add column if not exists owner_id uuid references auth.users(id);
alter table public.purchase_orders add column if not exists owner_id uuid references auth.users(id);

alter table public.customers alter column owner_id set default auth.uid();
alter table public.projects alter column owner_id set default auth.uid();
alter table public.work_orders alter column owner_id set default auth.uid();
alter table public.purchase_orders alter column owner_id set default auth.uid();

create unique index if not exists customers_owner_name_key on public.customers(owner_id, lower(name));
create index if not exists customers_owner_id_idx on public.customers(owner_id);
create index if not exists projects_owner_id_idx on public.projects(owner_id);
create index if not exists work_orders_owner_id_idx on public.work_orders(owner_id);
create index if not exists purchase_orders_owner_id_idx on public.purchase_orders(owner_id);

create index if not exists projects_customer_id_idx on public.projects(customer_id);
create unique index if not exists projects_customer_number_key on public.projects(customer_id, number);

create index if not exists work_orders_project_id_idx on public.work_orders(project_id);
create unique index if not exists work_orders_project_number_key on public.work_orders(project_id, number);

create index if not exists purchase_orders_project_id_idx on public.purchase_orders(project_id);
create unique index if not exists purchase_orders_project_number_key on public.purchase_orders(project_id, number);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists user_roles_user_role_key on public.user_roles(user_id, role);
create index if not exists user_roles_user_id_idx on public.user_roles(user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.work_orders to authenticated;
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select on public.user_roles to authenticated;

alter table public.customers enable row level security;
alter table public.projects enable row level security;
alter table public.work_orders enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.user_roles enable row level security;

-- Remove legacy permissive policies if they exist

drop policy if exists "Allow public read customers" on public.customers;
drop policy if exists "Allow public insert customers" on public.customers;
drop policy if exists "Allow public update customers" on public.customers;
drop policy if exists "Allow public delete customers" on public.customers;

drop policy if exists "Allow public read projects" on public.projects;
drop policy if exists "Allow public insert projects" on public.projects;
drop policy if exists "Allow public update projects" on public.projects;
drop policy if exists "Allow public delete projects" on public.projects;

drop policy if exists "Allow public read work_orders" on public.work_orders;
drop policy if exists "Allow public insert work_orders" on public.work_orders;
drop policy if exists "Allow public update work_orders" on public.work_orders;
drop policy if exists "Allow public delete work_orders" on public.work_orders;

drop policy if exists "Allow public read purchase_orders" on public.purchase_orders;
drop policy if exists "Allow public insert purchase_orders" on public.purchase_orders;
drop policy if exists "Allow public update purchase_orders" on public.purchase_orders;
drop policy if exists "Allow public delete purchase_orders" on public.purchase_orders;

-- Policies per table

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'Users can read own customers'
  ) then
    create policy "Users can read own customers" on public.customers
      for select using (owner_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'Users can insert own customers'
  ) then
    create policy "Users can insert own customers" on public.customers
      for insert with check (owner_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'Users can update own customers'
  ) then
    create policy "Users can update own customers" on public.customers
      for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'Users can delete own customers'
  ) then
    create policy "Users can delete own customers" on public.customers
      for delete using (owner_id = auth.uid());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_roles' and policyname = 'Users can view own roles'
  ) then
    create policy "Users can view own roles" on public.user_roles
      for select using (user_id = auth.uid());
  end if;
end;
$$;

create or replace view public.me_roles as
select role
from public.user_roles
where user_id = auth.uid();

grant select on public.me_roles to authenticated;

create or replace function public.grant_role_by_email(
  target_email text,
  target_role text,
  should_grant boolean default true,
  performed_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_role text;
  target_user uuid;
begin
  if target_email is null or length(trim(target_email)) = 0 then
    raise exception 'Email is required' using errcode = '22023';
  end if;

  normalized_role := lower(target_role);
  if normalized_role not in ('viewer', 'editor', 'admin') then
    raise exception 'Invalid role %', target_role using errcode = '22023';
  end if;

  select id into target_user from auth.users where lower(email) = lower(target_email) limit 1;

  if target_user is null then
    raise exception 'User with email % not found', target_email using errcode = 'P0002';
  end if;

  if should_grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (target_user, normalized_role, performed_by)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = target_user and role = normalized_role;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Users can read own projects'
  ) then
    create policy "Users can read own projects" on public.projects
      for select using (owner_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Users can insert own projects'
  ) then
    create policy "Users can insert own projects" on public.projects
      for insert
      with check (
        owner_id = auth.uid()
        and customer_id in (select id from public.customers where owner_id = auth.uid())
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Users can update own projects'
  ) then
    create policy "Users can update own projects" on public.projects
      for update
      using (owner_id = auth.uid())
      with check (
        owner_id = auth.uid()
        and customer_id in (select id from public.customers where owner_id = auth.uid())
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Users can delete own projects'
  ) then
    create policy "Users can delete own projects" on public.projects
      for delete using (owner_id = auth.uid());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'work_orders' and policyname = 'Users can read own work_orders'
  ) then
    create policy "Users can read own work_orders" on public.work_orders
      for select using (owner_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'work_orders' and policyname = 'Users can insert own work_orders'
  ) then
    create policy "Users can insert own work_orders" on public.work_orders
      for insert
      with check (
        owner_id = auth.uid()
        and project_id in (select id from public.projects where owner_id = auth.uid())
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'work_orders' and policyname = 'Users can update own work_orders'
  ) then
    create policy "Users can update own work_orders" on public.work_orders
      for update
      using (owner_id = auth.uid())
      with check (
        owner_id = auth.uid()
        and project_id in (select id from public.projects where owner_id = auth.uid())
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'work_orders' and policyname = 'Users can delete own work_orders'
  ) then
    create policy "Users can delete own work_orders" on public.work_orders
      for delete using (owner_id = auth.uid());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_orders' and policyname = 'Users can read own purchase_orders'
  ) then
    create policy "Users can read own purchase_orders" on public.purchase_orders
      for select using (owner_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_orders' and policyname = 'Users can insert own purchase_orders'
  ) then
    create policy "Users can insert own purchase_orders" on public.purchase_orders
      for insert
      with check (
        owner_id = auth.uid()
        and project_id in (select id from public.projects where owner_id = auth.uid())
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_orders' and policyname = 'Users can update own purchase_orders'
  ) then
    create policy "Users can update own purchase_orders" on public.purchase_orders
      for update
      using (owner_id = auth.uid())
      with check (
        owner_id = auth.uid()
        and project_id in (select id from public.projects where owner_id = auth.uid())
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_orders' and policyname = 'Users can delete own purchase_orders'
  ) then
    create policy "Users can delete own purchase_orders" on public.purchase_orders
      for delete using (owner_id = auth.uid());
  end if;
end;
$$;
