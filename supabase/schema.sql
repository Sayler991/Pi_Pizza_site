-- =====================================================================
--  Pi pizza and Burgers (Tlemcen) — contenu, commandes en ligne, clients
--  Schéma isolé « pipizza » du projet Supabase partagé. Idempotent.
--  Propriétaire : public.owners / public.is_owner() (existants, partagés).
--  Après exécution : ajouter « pipizza » aux schémas exposés.
-- =====================================================================
create schema if not exists pipizza;
grant usage on schema pipizza to anon, authenticated, service_role;

-- 1. CONTENU + HISTORIQUE
create table if not exists pipizza.site_content (
  id integer primary key default 1 check (id = 1),
  data jsonb not null check (jsonb_typeof(data) = 'object') check (octet_length(data::text) <= 524288),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table if not exists pipizza.site_content_history (
  id bigint generated always as identity primary key,
  saved_at timestamptz not null default now(),
  saved_by uuid,
  data jsonb not null
);
create or replace function pipizza.site_content_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.data is distinct from old.data then
    insert into pipizza.site_content_history (saved_by, data) values (old.updated_by, old.data);
    delete from pipizza.site_content_history
     where id not in (select id from pipizza.site_content_history order by id desc limit 50);
  end if;
  new.updated_at := now(); new.updated_by := auth.uid(); new.id := old.id;
  return new;
end; $$;
drop trigger if exists trg_site_content_before_update on pipizza.site_content;
create trigger trg_site_content_before_update before update on pipizza.site_content
  for each row execute function pipizza.site_content_before_update();

-- 2. CLIENTS + COMMANDES
create table if not exists pipizza.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text not null check (phone ~ '^\+?[0-9][0-9 .-]{7,18}[0-9]$'),
  phone_norm text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored,
  address text check (address is null or char_length(address) <= 300),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create unique index if not exists pp_customers_phone_norm_uq on pipizza.customers (phone_norm);

create table if not exists pipizza.orders (
  id bigint generated always as identity primary key,
  status text not null default 'nouvelle' check (status in ('nouvelle','en préparation','prête','livrée','annulée')),
  customer_id uuid references pipizza.customers(id) on delete set null,
  branch text not null check (char_length(branch) between 2 and 40),
  branch_name text,
  mode text not null check (mode in ('emporter','livraison')),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text not null check (phone ~ '^\+?[0-9][0-9 .-]{7,18}[0-9]$'),
  address text check (address is null or char_length(address) <= 300),
  note text check (note is null or char_length(note) <= 500),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  item_count integer not null default 0,
  total integer not null default 0 check (total >= 0),
  price_pending boolean not null default false,
  via_whatsapp boolean not null default false,
  hp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_address check (mode <> 'livraison' or (address is not null and char_length(btrim(address)) >= 5))
);
create index if not exists pp_orders_created_idx on pipizza.orders (created_at desc);
create index if not exists pp_orders_status_idx on pipizza.orders (status);

-- Validation serveur : pot de miel, limites, boutique, articles + prix recalculés depuis la carte publiée.
create or replace function pipizza.orders_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_data jsonb; v_norm text; v_cid uuid; v_branch jsonb; v_line jsonb; v_item jsonb;
        v_items jsonb := '[]'::jsonb; v_total int := 0; v_count int := 0; v_qty int; v_price int; v_lnote text; v_ids text[] := '{}'; v_pending boolean := false;
begin
  if public.is_owner() then new.updated_at := now(); return new; end if;
  if coalesce(new.hp, '') <> '' then raise exception 'Envoi refusé.' using errcode = 'P0001'; end if;
  new.status := 'nouvelle'; new.created_at := now(); new.updated_at := now(); new.customer_id := null; new.hp := null;
  new.name := btrim(new.name); new.phone := btrim(new.phone);
  new.address := nullif(btrim(coalesce(new.address,'')),''); new.note := nullif(btrim(coalesce(new.note,'')),'');
  select data into v_data from pipizza.site_content where id = 1;
  if coalesce((v_data -> 'ordering' ->> 'open')::boolean, true) = false then
    raise exception 'La commande en ligne est momentanément fermée : appelez-nous.' using errcode = 'P0001';
  end if;
  select b into v_branch from jsonb_array_elements(coalesce(v_data -> 'branches', '[]'::jsonb)) b
   where b ->> 'key' = new.branch and coalesce((b ->> 'orders')::boolean, true) limit 1;
  if v_branch is null then raise exception 'Boutique inconnue.' using errcode = 'P0001'; end if;
  new.branch_name := v_branch ->> 'name';
  if new.mode = 'livraison' and coalesce((v_data -> 'ordering' ->> 'delivery')::boolean, true) = false then
    raise exception 'La livraison n''est pas proposée en ce moment : choisissez « à emporter ».' using errcode = 'P0001';
  end if;
  if new.mode = 'emporter' then new.address := null; end if;
  if jsonb_array_length(new.items) < 1 or jsonb_array_length(new.items) > 30 then
    raise exception 'Panier vide ou trop grand.' using errcode = 'P0001';
  end if;
  for v_line in select * from jsonb_array_elements(new.items) loop
    if jsonb_typeof(v_line) <> 'object' then raise exception 'Article invalide.' using errcode = 'P0001'; end if;
    select it into v_item from jsonb_array_elements(coalesce(v_data -> 'menu' -> 'categories', '[]'::jsonb)) c,
                                 jsonb_array_elements(coalesce(c -> 'items', '[]'::jsonb)) it
     where it ->> 'id' = v_line ->> 'id' and coalesce((it ->> 'available')::boolean, true) limit 1;
    if v_item is null then raise exception 'Article indisponible : %', left(coalesce(v_line ->> 'id','?'), 40) using errcode = 'P0001'; end if;
    if coalesce(v_line ->> 'qty','') !~ '^[0-9]{1,2}$' then raise exception 'Quantité invalide.' using errcode = 'P0001'; end if;
    v_qty := (v_line ->> 'qty')::int;
    if coalesce(v_item ->> 'price','') ~ '^[0-9]{1,6}$' then v_price := (v_item ->> 'price')::int; else v_price := null; v_pending := true; end if;
    if v_qty < 1 or v_qty > 20 then raise exception 'Quantité invalide (1 à 20 par article).' using errcode = 'P0001'; end if;
    v_lnote := nullif(btrim(left(coalesce(v_line ->> 'note',''), 120)), '');
    v_items := v_items || jsonb_build_array(jsonb_build_object('id', v_item ->> 'id', 'name', v_item ->> 'name', 'price', v_price, 'qty', v_qty, 'line', v_price * v_qty, 'note', v_lnote));
    v_total := v_total + coalesce(v_price * v_qty, 0); v_count := v_count + v_qty;
  end loop;
  if v_count > 60 then raise exception 'Commande trop importante : appelez-nous directement.' using errcode = 'P0001'; end if;
  new.items := v_items; new.total := v_total; new.price_pending := v_pending; new.item_count := v_count;
  if (select count(*) from pipizza.orders where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Trop de commandes en ce moment, réessayez dans une minute.' using errcode = 'P0001';
  end if;
  v_norm := regexp_replace(new.phone, '[^0-9]', '', 'g');
  if (select count(*) from pipizza.orders where regexp_replace(phone,'[^0-9]','','g') = v_norm and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Vous avez déjà envoyé plusieurs commandes : la boutique vous rappelle rapidement.' using errcode = 'P0001';
  end if;
  insert into pipizza.customers (name, phone, address) values (new.name, new.phone, new.address)
    on conflict (phone_norm) do update set address = coalesce(excluded.address, pipizza.customers.address)
    returning id into v_cid;
  new.customer_id := v_cid;
  return new;
end; $$;
drop trigger if exists trg_orders_before_insert on pipizza.orders;
create trigger trg_orders_before_insert before insert on pipizza.orders
  for each row execute function pipizza.orders_before_insert();

create or replace function pipizza.touch_updated()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_orders_before_update on pipizza.orders;
create trigger trg_orders_before_update before update on pipizza.orders
  for each row execute function pipizza.touch_updated();

-- Point d'entrée public : renvoie le numéro et le total recalculé (les visiteurs ne lisent jamais la table).
create or replace function pipizza.place_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r pipizza.orders;
begin
  if jsonb_typeof(p) <> 'object' or octet_length(p::text) > 20000 then raise exception 'Requête invalide.' using errcode = 'P0001'; end if;
  insert into pipizza.orders (branch, mode, name, phone, address, note, items, via_whatsapp, hp)
  values (coalesce(p ->> 'branch',''), coalesce(p ->> 'mode',''), coalesce(p ->> 'name',''), coalesce(p ->> 'phone',''),
          p ->> 'address', p ->> 'note', coalesce(p -> 'items', '[]'::jsonb), coalesce((p ->> 'via_whatsapp')::boolean, false), p ->> 'hp')
  returning * into r;
  return jsonb_build_object('id', r.id, 'total', r.total, 'pending', r.price_pending, 'item_count', r.item_count, 'items', r.items, 'branch_name', r.branch_name, 'created_at', r.created_at);
exception when check_violation then
  raise exception 'Vérifiez vos informations (nom, téléphone, adresse).' using errcode = 'P0001';
end; $$;

create or replace view pipizza.orders_daily with (security_invoker = true) as
select (o.created_at at time zone 'Africa/Algiers')::date as day, count(*) as total,
       count(*) filter (where o.status <> 'annulée') as valid,
       coalesce(sum(o.total) filter (where o.status <> 'annulée'), 0) as revenue,
       count(*) filter (where o.mode = 'livraison') as deliveries,
       count(*) filter (where o.status = 'annulée') as cancelled
from pipizza.orders o group by 1;

-- 3. DROITS + RLS
revoke all on all tables in schema pipizza from anon, authenticated;
revoke execute on all functions in schema pipizza from public, anon, authenticated;
grant execute on function pipizza.place_order(jsonb) to anon, authenticated;
grant select on pipizza.site_content to anon, authenticated;
grant insert, update on pipizza.site_content to authenticated;
grant select on pipizza.site_content_history to authenticated;
grant select, update, delete on pipizza.orders to authenticated;
grant select, update, delete on pipizza.customers to authenticated;
grant select on pipizza.orders_daily to authenticated;
grant all on all tables in schema pipizza to service_role;

alter table pipizza.site_content enable row level security;
alter table pipizza.site_content_history enable row level security;
alter table pipizza.customers enable row level security;
alter table pipizza.orders enable row level security;
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'pipizza' loop
    execute format('drop policy if exists %I on pipizza.%I', r.policyname, r.tablename);
  end loop; end $$;
create policy "contenu : lecture publique" on pipizza.site_content for select to anon, authenticated using (true);
create policy "contenu : ajout patron" on pipizza.site_content for insert to authenticated with check (id = 1 and public.is_owner());
create policy "contenu : modification patron" on pipizza.site_content for update to authenticated
  using (id = 1 and public.is_owner()) with check (id = 1 and public.is_owner());
create policy "historique : lecture patron" on pipizza.site_content_history for select to authenticated using (public.is_owner());
create policy "commandes : patron" on pipizza.orders for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "clients : patron" on pipizza.customers for all to authenticated using (public.is_owner()) with check (public.is_owner());

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'pipizza' and tablename = 'orders') then
    alter publication supabase_realtime add table pipizza.orders;
  end if; end $$;
