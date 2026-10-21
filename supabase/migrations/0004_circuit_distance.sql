-- Programme d'un circuit : distances qui s'y courent (n-n), sert à filtrer les épreuves d'une compétition.
-- (Appliquée sous le nom « patinage_circuit_distance » ; détail complet dans Supabase.)
set search_path = patinage, public;
create table if not exists circuit_distance (
  id           uuid primary key default gen_random_uuid(),
  compte_id    uuid not null references compte(id) on delete cascade,
  circuit_id   uuid not null references circuit(id) on delete cascade,
  distance_id  uuid not null references distance(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index if not exists circuit_distance_uq on circuit_distance(circuit_id, distance_id);
select fn_add_updated_at_trigger('circuit_distance'::regclass);
select fn_enable_rls_compte('circuit_distance'::regclass);
grant all on circuit_distance to anon, authenticated, service_role;
-- + fn_amorcer_programme(compte_id) : programme par défaut (InterRégional : 200/400/500/777/1000/1500/relais 2000 ;
--   Provincial CP : 500/1000/1500/relais 3000 ; LP : toutes), appelée par fn_amorcer_compte.
