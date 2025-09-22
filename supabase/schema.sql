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

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.work_orders to authenticated;
grant select, insert, update, delete on public.purchase_orders to authenticated;

alter table public.customers enable row level security;
alter table public.projects enable row level security;
alter table public.work_orders enable row level security;
alter table public.purchase_orders enable row level security;

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
