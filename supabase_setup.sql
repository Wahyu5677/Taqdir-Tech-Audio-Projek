-- Supabase setup for: profiles/roles, addresses, shipping rates (per province/city), order upgrades, and RLS.
-- Jalankan di Supabase SQL Editor.

create extension if not exists pgcrypto;

-- 1) PROFILES (role-based admin)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If profiles table already existed (from previous attempts), ensure required columns exist.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text;
alter table public.profiles alter column role set default 'customer';
alter table public.profiles add column if not exists created_at timestamptz;
alter table public.profiles alter column created_at set default now();
alter table public.profiles add column if not exists updated_at timestamptz;
alter table public.profiles alter column updated_at set default now();

update public.profiles
set role = 'customer'
where role is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'customer')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- 2) ADDRESSES
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  recipient_name text not null,
  phone text not null,
  province text not null,
  city text not null,
  street text not null,
  postal_code text,
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_addresses_updated_at on public.addresses;
create trigger trg_addresses_updated_at
before update on public.addresses
for each row
execute function public.set_updated_at();

create index if not exists idx_addresses_user_id on public.addresses(user_id);

-- 3) SHIPPING RATES (per province/city)
create table if not exists public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  province text not null,
  city text not null,
  cost integer not null check (cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (province, city)
);

drop trigger if exists trg_shipping_rates_updated_at on public.shipping_rates;
create trigger trg_shipping_rates_updated_at
before update on public.shipping_rates
for each row
execute function public.set_updated_at();

-- 4) ORDERS upgrades (keep existing schema, add columns)
alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists subtotal_amount numeric;
alter table public.orders add column if not exists shipping_cost integer;
alter table public.orders add column if not exists total_amount numeric;
alter table public.orders add column if not exists shipping_province text;
alter table public.orders add column if not exists shipping_city text;
alter table public.orders add column if not exists shipping_address text;

create or replace function public.generate_order_number()
returns text
language plpgsql
as $$
declare
  d text;
  n bigint;
begin
  d := to_char(now(), 'YYYYMMDD');
  select floor(extract(epoch from clock_timestamp()) * 1000)::bigint into n;
  return 'ORD-' || d || '-' || right(n::text, 6);
end;
$$;

-- 5) RLS
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Additional app tables (carts/cart_items/payments/staging) - guarded.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'carts'
  ) then
    execute 'alter table public.carts enable row level security';

    execute 'drop policy if exists "carts_select_own" on public.carts';
    execute 'create policy "carts_select_own" on public.carts for select to authenticated using (auth.uid() = user_id)';

    execute 'drop policy if exists "carts_insert_own" on public.carts';
    execute 'create policy "carts_insert_own" on public.carts for insert to authenticated with check (auth.uid() = user_id)';

    execute 'drop policy if exists "carts_update_own" on public.carts';
    execute 'create policy "carts_update_own" on public.carts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)';

    execute 'drop policy if exists "carts_delete_own" on public.carts';
    execute 'create policy "carts_delete_own" on public.carts for delete to authenticated using (auth.uid() = user_id)';
  end if;
exception
  when undefined_table then null;
  when undefined_column then null;
  when insufficient_privilege then null;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'cart_items'
  ) then
    execute 'alter table public.cart_items enable row level security';

    execute 'drop policy if exists "cart_items_select_own" on public.cart_items';
    execute '
      create policy "cart_items_select_own" on public.cart_items
      for select to authenticated
      using (
        exists (
          select 1 from public.carts c
          where c.id = cart_items.cart_id and c.user_id = auth.uid()
        )
      )
    ';

    execute 'drop policy if exists "cart_items_insert_own" on public.cart_items';
    execute '
      create policy "cart_items_insert_own" on public.cart_items
      for insert to authenticated
      with check (
        exists (
          select 1 from public.carts c
          where c.id = cart_items.cart_id and c.user_id = auth.uid()
        )
      )
    ';

    execute 'drop policy if exists "cart_items_update_own" on public.cart_items';
    execute '
      create policy "cart_items_update_own" on public.cart_items
      for update to authenticated
      using (
        exists (
          select 1 from public.carts c
          where c.id = cart_items.cart_id and c.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.carts c
          where c.id = cart_items.cart_id and c.user_id = auth.uid()
        )
      )
    ';

    execute 'drop policy if exists "cart_items_delete_own" on public.cart_items';
    execute '
      create policy "cart_items_delete_own" on public.cart_items
      for delete to authenticated
      using (
        exists (
          select 1 from public.carts c
          where c.id = cart_items.cart_id and c.user_id = auth.uid()
        )
      )
    ';
  end if;
exception
  when undefined_table then null;
  when undefined_column then null;
  when insufficient_privilege then null;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payments'
  ) then
    execute 'alter table public.payments enable row level security';

    -- If payments has user_id, protect by user; otherwise, admin-only.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payments' and column_name = 'user_id'
    ) then
      execute 'drop policy if exists "payments_select_own_or_admin" on public.payments';
      execute 'create policy "payments_select_own_or_admin" on public.payments for select to authenticated using (auth.uid() = user_id or public.is_admin())';

      execute 'drop policy if exists "payments_insert_own" on public.payments';
      execute 'create policy "payments_insert_own" on public.payments for insert to authenticated with check (auth.uid() = user_id)';
    else
      execute 'drop policy if exists "payments_admin_select" on public.payments';
      execute 'create policy "payments_admin_select" on public.payments for select to authenticated using (public.is_admin())';
    end if;

    execute 'drop policy if exists "payments_admin_write" on public.payments';
    execute 'create policy "payments_admin_write" on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
exception
  when undefined_table then null;
  when undefined_column then null;
  when insufficient_privilege then null;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'product_images_stage'
  ) then
    execute 'alter table public.product_images_stage enable row level security';

    execute 'drop policy if exists "product_images_stage_admin_only" on public.product_images_stage';
    execute 'create policy "product_images_stage_admin_only" on public.product_images_stage for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
exception
  when undefined_table then null;
  when insufficient_privilege then null;
end $$;

-- Optional hardening for catalog tables (avoid breaking if tables don't exist).
do $$
begin
  -- PRODUCTS (public read active; admin write) - only if products table exists.
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'products'
  ) then
    execute 'alter table public.products enable row level security';

    execute 'drop policy if exists "products_public_select" on public.products';
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'products' and column_name = 'is_active'
    ) then
      execute 'create policy "products_public_select" on public.products for select to anon, authenticated using (is_active is null or is_active = true)';
    else
      execute 'create policy "products_public_select" on public.products for select to anon, authenticated using (true)';
    end if;

    execute 'drop policy if exists "products_admin_write" on public.products';
    execute 'create policy "products_admin_write" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
exception
  when undefined_table then
    -- ignore if products table does not exist
    null;
  when undefined_column then
    -- ignore if schema is missing expected columns
    null;
  when insufficient_privilege then
    -- ignore if current role can't change RLS in this context
    null;
end $$;

do $$
begin
  -- PRODUCT IMAGES (public read; admin write) - only if product_images table exists.
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'product_images'
  ) then
    execute 'alter table public.product_images enable row level security';

    execute 'drop policy if exists "product_images_public_select" on public.product_images';
    execute 'create policy "product_images_public_select" on public.product_images for select to anon, authenticated using (true)';

    execute 'drop policy if exists "product_images_admin_write" on public.product_images';
    execute 'create policy "product_images_admin_write" on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
exception
  when undefined_table then
    -- ignore if product_images table does not exist
    null;
  when insufficient_privilege then
    null;
end $$;

-- PROFILES policies
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select
to authenticated
using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- ADDRESSES policies
drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own" on public.addresses
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own" on public.addresses
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "addresses_update_own" on public.addresses;
create policy "addresses_update_own" on public.addresses
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "addresses_delete_own" on public.addresses;
create policy "addresses_delete_own" on public.addresses
for delete
to authenticated
using (auth.uid() = user_id);

-- SHIPPING RATES policies (public read active; admin write)
drop policy if exists "shipping_rates_public_select" on public.shipping_rates;
create policy "shipping_rates_public_select" on public.shipping_rates
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "shipping_rates_admin_write" on public.shipping_rates;
create policy "shipping_rates_admin_write" on public.shipping_rates
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ORDERS policies (own or admin)
drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin" on public.orders
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "orders_update_admin" on public.orders;
create policy "orders_update_admin" on public.orders
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ORDER ITEMS policies (own via order join, or admin)
drop policy if exists "order_items_select_own_or_admin" on public.order_items;
create policy "order_items_select_own_or_admin" on public.order_items
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.user_id = auth.uid()
  )
);

drop policy if exists "order_items_insert_own" on public.order_items;
create policy "order_items_insert_own" on public.order_items
for insert
to authenticated
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.user_id = auth.uid()
  )
);

-- ORDER ITEMS write policies (admin only)
drop policy if exists "order_items_update_admin" on public.order_items;
create policy "order_items_update_admin" on public.order_items
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "order_items_delete_admin" on public.order_items;
create policy "order_items_delete_admin" on public.order_items
for delete
to authenticated
using (public.is_admin());

-- NOTES:
-- Set admin manual: update public.profiles set role='admin' where email='you@example.com';
