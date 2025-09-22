-- Supabase schema and policies for CustomerProjectDB
-- Run this in the Supabase SQL editor (or via the CLI) to prepare the database
-- for the front-end app. The script is idempotent so it can be applied multiple
-- times.

create extension if not exists "pgcrypto";

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  contact_name text,
  contact_phone text,
  contact_email text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  number text not null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  number text not null,
  type text not null check (type in ('Build', 'Onsite')),
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  number text not null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists projects_customer_id_idx on public.projects(customer_id);
create unique index if not exists projects_customer_number_key on public.projects(customer_id, number);

create index if not exists work_orders_project_id_idx on public.work_orders(project_id);
create unique index if not exists work_orders_project_number_key on public.work_orders(project_id, number);

create index if not exists purchase_orders_project_id_idx on public.purchase_orders(project_id);
create unique index if not exists purchase_orders_project_number_key on public.purchase_orders(project_id, number);

alter table public.customers enable row level security;
alter table public.projects enable row level security;
alter table public.work_orders enable row level security;
alter table public.purchase_orders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'Allow public read customers'
  ) then
    create policy "Allow public read customers" on public.customers for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'Allow public insert customers'
  ) then
    create policy "Allow public insert customers" on public.customers for insert with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'Allow public update customers'
  ) then
    create policy "Allow public update customers" on public.customers for update using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'Allow public delete customers'
  ) then
    create policy "Allow public delete customers" on public.customers for delete using (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Allow public read projects'
  ) then
    create policy "Allow public read projects" on public.projects for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Allow public insert projects'
  ) then
    create policy "Allow public insert projects" on public.projects for insert with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Allow public update projects'
  ) then
    create policy "Allow public update projects" on public.projects for update using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Allow public delete projects'
  ) then
    create policy "Allow public delete projects" on public.projects for delete using (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'work_orders' and policyname = 'Allow public read work_orders'
  ) then
    create policy "Allow public read work_orders" on public.work_orders for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'work_orders' and policyname = 'Allow public insert work_orders'
  ) then
    create policy "Allow public insert work_orders" on public.work_orders for insert with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'work_orders' and policyname = 'Allow public update work_orders'
  ) then
    create policy "Allow public update work_orders" on public.work_orders for update using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'work_orders' and policyname = 'Allow public delete work_orders'
  ) then
    create policy "Allow public delete work_orders" on public.work_orders for delete using (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_orders' and policyname = 'Allow public read purchase_orders'
  ) then
    create policy "Allow public read purchase_orders" on public.purchase_orders for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_orders' and policyname = 'Allow public insert purchase_orders'
  ) then
    create policy "Allow public insert purchase_orders" on public.purchase_orders for insert with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_orders' and policyname = 'Allow public update purchase_orders'
  ) then
    create policy "Allow public update purchase_orders" on public.purchase_orders for update using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_orders' and policyname = 'Allow public delete purchase_orders'
  ) then
    create policy "Allow public delete purchase_orders" on public.purchase_orders for delete using (true);
  end if;
end;
$$;
