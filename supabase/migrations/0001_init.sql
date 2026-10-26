-- Open Fields PIM: v1 schema
-- Run once in the Supabase SQL editor (or with `supabase db push`).

-- ---------------------------------------------------------------
-- Team and roles
-- ---------------------------------------------------------------
create type public.app_role as enum ('admin', 'editor', 'viewer');

create table public.team_members (
  email      text primary key check (email = lower(email)),
  role       public.app_role not null default 'viewer',
  added_at   timestamptz not null default now(),
  added_by   text
);

-- Who is calling (lower-cased email from the login token)
create or replace function public.current_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.team_members where email = public.current_email()
$$;

create or replace function public.can_edit()
returns boolean language sql stable as $$
  select coalesce(public.my_role() in ('admin', 'editor'), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- The very first person to sign in becomes admin. After that, only
-- people an admin adds on the Team page get in.
create or replace function public.claim_admin_if_first()
returns public.app_role language plpgsql security definer set search_path = public as $$
declare
  me text := public.current_email();
begin
  if me = '' then
    return null;
  end if;
  if not exists (select 1 from public.team_members where role = 'admin') then
    insert into public.team_members (email, role, added_by)
    values (me, 'admin', 'first sign-in')
    on conflict (email) do update set role = 'admin';
  end if;
  return public.my_role();
end $$;

-- ---------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------
create table public.products (
  item_number        text primary key check (length(trim(item_number)) > 0),
  product_name       text,
  variation_name     text,
  category           text,
  subcategory        text,
  brand              text,
  licensed_producer  text,
  lp_group           text,
  strain_type        text,
  status             text not null default 'New' check (status in ('New', 'Active', 'Delist')),
  gtin               text,
  size_text          text,
  units_per_pack     numeric,
  unit_size          numeric,
  unit_of_measure    text check (unit_of_measure in ('g', 'mg', 'mL')),
  case_qty           integer check (case_qty is null or case_qty > 0),
  thc_min            numeric,
  thc_max            numeric,
  thc_unit           text check (thc_unit in ('%', 'mg', 'mg/g', 'mg/mL')),
  cbd_min            numeric,
  cbd_max            numeric,
  cbd_unit           text check (cbd_unit in ('%', 'mg', 'mg/g', 'mg/mL')),
  description        text,
  tags               text[] not null default '{}',
  created_at         timestamptz not null default now(),
  created_by         text,
  updated_at         timestamptz not null default now(),
  updated_by         text
);

create index products_status_idx   on public.products (status);
create index products_category_idx on public.products (category);
create index products_lp_idx       on public.products (licensed_producer);
create index products_brand_idx    on public.products (brand);
create index products_gtin_idx     on public.products (gtin);

-- Stamp who/when on every write
create or replace function public.stamp_product()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(nullif(public.current_email(), ''), new.created_by, 'system');
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(nullif(public.current_email(), ''), 'system');
  return new;
end $$;

create trigger products_stamp
before insert or update on public.products
for each row execute function public.stamp_product();

-- ---------------------------------------------------------------
-- Change log: one row per changed field, written by the database
-- itself so nothing can skip it.
-- ---------------------------------------------------------------
create table public.change_log (
  id           bigserial primary key,
  item_number  text not null,
  changed_at   timestamptz not null default now(),
  changed_by   text not null,
  action       text not null check (action in ('created', 'updated', 'deleted')),
  field        text,
  old_value    text,
  new_value    text,
  source       text not null default 'app'
);
create index change_log_item_idx on public.change_log (item_number, changed_at desc);
create index change_log_time_idx on public.change_log (changed_at desc);

create or replace function public.log_product_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k    text;
  o    jsonb;
  n    jsonb;
  who  text := coalesce(nullif(public.current_email(), ''), 'system');
  src  text := coalesce(nullif(current_setting('pim.source', true), ''), 'app');
begin
  if tg_op = 'INSERT' then
    insert into public.change_log (item_number, changed_by, action, source)
    values (new.item_number, who, 'created', src);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.change_log (item_number, changed_by, action, source)
    values (old.item_number, who, 'deleted', src);
    return old;
  end if;

  o := to_jsonb(old);
  n := to_jsonb(new);
  for k in select jsonb_object_keys(n) loop
    continue when k in ('created_at', 'created_by', 'updated_at', 'updated_by');
    if (o -> k) is distinct from (n -> k) then
      insert into public.change_log (item_number, changed_by, action, field, old_value, new_value, source)
      values (new.item_number, who, 'updated', k, o ->> k, n ->> k, src);
    end if;
  end loop;
  return new;
end $$;

create trigger products_log
after insert or update or delete on public.products
for each row execute function public.log_product_change();

-- ---------------------------------------------------------------
-- Bulk upload. Rows are JSON objects keyed by column name.
-- Blank / missing values never overwrite what is already stored.
-- mode: 'add_only'   -> new item numbers are added, existing ones skipped
--       'add_update' -> new ones added, existing ones updated
-- Runs as the caller, so row-level security still applies.
-- ---------------------------------------------------------------
create or replace function public.bulk_upsert_products(rows jsonb, mode text default 'add_only')
returns jsonb language plpgsql as $$
declare
  ins int := 0;
  upd int := 0;
begin
  if not public.can_edit() then
    raise exception 'You do not have edit access';
  end if;
  if mode not in ('add_only', 'add_update') then
    raise exception 'Unknown mode %', mode;
  end if;

  perform set_config('pim.source', 'bulk upload', true);

  drop table if exists _src;
  create temp table _src on commit drop as
    select distinct on (trim(x.item_number)) x.*
    from jsonb_populate_recordset(null::public.products, rows) x
    where coalesce(trim(x.item_number), '') <> '';
  update _src set item_number = trim(item_number);

  if mode = 'add_update' then
    update public.products p set
      product_name = coalesce(s.product_name, p.product_name),
      variation_name = coalesce(s.variation_name, p.variation_name),
      category = coalesce(s.category, p.category),
      subcategory = coalesce(s.subcategory, p.subcategory),
      brand = coalesce(s.brand, p.brand),
      licensed_producer = coalesce(s.licensed_producer, p.licensed_producer),
      lp_group = coalesce(s.lp_group, p.lp_group),
      strain_type = coalesce(s.strain_type, p.strain_type),
      status = coalesce(s.status, p.status),
      gtin = coalesce(s.gtin, p.gtin),
      size_text = coalesce(s.size_text, p.size_text),
      units_per_pack = coalesce(s.units_per_pack, p.units_per_pack),
      unit_size = coalesce(s.unit_size, p.unit_size),
      unit_of_measure = coalesce(s.unit_of_measure, p.unit_of_measure),
      case_qty = coalesce(s.case_qty, p.case_qty),
      thc_min = coalesce(s.thc_min, p.thc_min),
      thc_max = coalesce(s.thc_max, p.thc_max),
      thc_unit = coalesce(s.thc_unit, p.thc_unit),
      cbd_min = coalesce(s.cbd_min, p.cbd_min),
      cbd_max = coalesce(s.cbd_max, p.cbd_max),
      cbd_unit = coalesce(s.cbd_unit, p.cbd_unit),
      description = coalesce(s.description, p.description),
      tags = coalesce(s.tags, p.tags)
    from _src s
    where p.item_number = s.item_number
      and (
      (s.product_name is not null and s.product_name is distinct from p.product_name) or
      (s.variation_name is not null and s.variation_name is distinct from p.variation_name) or
      (s.category is not null and s.category is distinct from p.category) or
      (s.subcategory is not null and s.subcategory is distinct from p.subcategory) or
      (s.brand is not null and s.brand is distinct from p.brand) or
      (s.licensed_producer is not null and s.licensed_producer is distinct from p.licensed_producer) or
      (s.lp_group is not null and s.lp_group is distinct from p.lp_group) or
      (s.strain_type is not null and s.strain_type is distinct from p.strain_type) or
      (s.status is not null and s.status is distinct from p.status) or
      (s.gtin is not null and s.gtin is distinct from p.gtin) or
      (s.size_text is not null and s.size_text is distinct from p.size_text) or
      (s.units_per_pack is not null and s.units_per_pack is distinct from p.units_per_pack) or
      (s.unit_size is not null and s.unit_size is distinct from p.unit_size) or
      (s.unit_of_measure is not null and s.unit_of_measure is distinct from p.unit_of_measure) or
      (s.case_qty is not null and s.case_qty is distinct from p.case_qty) or
      (s.thc_min is not null and s.thc_min is distinct from p.thc_min) or
      (s.thc_max is not null and s.thc_max is distinct from p.thc_max) or
      (s.thc_unit is not null and s.thc_unit is distinct from p.thc_unit) or
      (s.cbd_min is not null and s.cbd_min is distinct from p.cbd_min) or
      (s.cbd_max is not null and s.cbd_max is distinct from p.cbd_max) or
      (s.cbd_unit is not null and s.cbd_unit is distinct from p.cbd_unit) or
      (s.description is not null and s.description is distinct from p.description) or
      (s.tags is not null and s.tags is distinct from p.tags)
      );
    get diagnostics upd = row_count;
  end if;

  insert into public.products (item_number, product_name, variation_name, category, subcategory, brand, licensed_producer, lp_group, strain_type, status, gtin, size_text, units_per_pack, unit_size, unit_of_measure, case_qty, thc_min, thc_max, thc_unit, cbd_min, cbd_max, cbd_unit, description, tags)
  select s.item_number, s.product_name, s.variation_name, s.category, s.subcategory, s.brand, s.licensed_producer, s.lp_group, s.strain_type, coalesce(s.status, 'New'), s.gtin, s.size_text, s.units_per_pack, s.unit_size, s.unit_of_measure, s.case_qty, s.thc_min, s.thc_max, s.thc_unit, s.cbd_min, s.cbd_max, s.cbd_unit, s.description, coalesce(s.tags, '{}')
  from _src s
  where not exists (select 1 from public.products p where p.item_number = s.item_number);
  get diagnostics ins = row_count;

  return jsonb_build_object('inserted', ins, 'updated', upd);
end $$;

-- Distinct values for pick lists (category, brand, LP, ...)
create or replace function public.field_options()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'category',          (select coalesce(jsonb_agg(v order by v), '[]') from (select distinct category v from public.products where category is not null) s),
    'subcategory',       (select coalesce(jsonb_agg(v order by v), '[]') from (select distinct subcategory v from public.products where subcategory is not null) s),
    'brand',             (select coalesce(jsonb_agg(v order by v), '[]') from (select distinct brand v from public.products where brand is not null) s),
    'licensed_producer', (select coalesce(jsonb_agg(v order by v), '[]') from (select distinct licensed_producer v from public.products where licensed_producer is not null) s),
    'lp_group',          (select coalesce(jsonb_agg(v order by v), '[]') from (select distinct lp_group v from public.products where lp_group is not null) s),
    'strain_type',       (select coalesce(jsonb_agg(v order by v), '[]') from (select distinct strain_type v from public.products where strain_type is not null) s),
    'tags',              (select coalesce(jsonb_agg(v order by v), '[]') from (select distinct unnest(tags) v from public.products) s)
  )
$$;

-- ---------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------
alter table public.team_members enable row level security;
alter table public.products     enable row level security;
alter table public.change_log   enable row level security;

create policy "members read team"   on public.team_members for select using (public.my_role() is not null);
create policy "admins manage team"  on public.team_members for all    using (public.is_admin()) with check (public.is_admin());

create policy "members read products"  on public.products for select using (public.my_role() is not null);
create policy "editors add products"   on public.products for insert with check (public.can_edit());
create policy "editors edit products"  on public.products for update using (public.can_edit()) with check (public.can_edit());
create policy "admins delete products" on public.products for delete using (public.is_admin());

create policy "members read log" on public.change_log for select using (public.my_role() is not null);
-- No insert/update/delete policies on change_log: only the trigger writes to it.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.products, public.team_members to authenticated;
grant select on public.change_log to authenticated;
grant execute on function public.claim_admin_if_first(), public.my_role(), public.can_edit(),
  public.is_admin(), public.current_email(), public.bulk_upsert_products(jsonb, text),
  public.field_options() to authenticated;
revoke execute on function public.claim_admin_if_first() from anon;
