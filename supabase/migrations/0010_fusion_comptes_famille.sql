-- patinage_fusion_comptes_famille (appliquée le 2026-10-25) — MIGRATION DE DONNÉES, exécutée une fois.
--
-- Deux comptes « Famille » coexistaient (créés les 20 et 21 oct., suite aux ratés d'onboarding) :
-- les athlètes sur le premier, presque tout le reste sur le second, et les référentiels
-- (distances, circuits, pistes, saisons) amorcés en 3 ou 4 exemplaires par fn_creer_compte.
-- 1) Toutes les lignes du compte source sont déplacées vers le compte cible.
-- 2) Référentiels dédoublonnés par clé naturelle (on garde la ligne active la plus ancienne),
--    clés étrangères repointées, doublons soft-delete (circuit_distance : suppression physique,
--    table d'association sans historique, index unique (circuit_id, distance_id)).
-- 3) Compte source : adhésion retirée, compte soft-delete et renommé.
--
-- Les identifiants ci-dessous sont ceux de la production ; le script est conservé comme
-- référence (procédure réutilisable) et n'est PAS destiné à être rejoué.

begin;

do $$
declare
  v_src uuid := '8314ecfb-e789-46e6-9853-d0d299025254';
  v_dst uuid := '45999b83-99d1-48e4-8115-a741fe54c405';
  t record;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='compte_id' and not a.attisdropped
    where n.nspname='patinage' and c.relkind='r' and c.relname<>'compte_membre'
  loop
    execute format('update patinage.%I set compte_id = %L, updated_at = now() where compte_id = %L', t.relname, v_dst, v_src);
  end loop;
end $$;

create temp table map_distance as
  select d.id as old_id, first_value(d.id) over (partition by d.compte_id, d.libelle, d.type_piste order by (d.deleted_at is null) desc, d.created_at) as new_id
  from patinage.distance d where d.compte_id='45999b83-99d1-48e4-8115-a741fe54c405';
create temp table map_circuit as
  select c.id as old_id, first_value(c.id) over (partition by c.compte_id, c.nom, c.type_piste order by (c.deleted_at is null) desc, c.created_at) as new_id
  from patinage.circuit c where c.compte_id='45999b83-99d1-48e4-8115-a741fe54c405';
create temp table map_piste as
  select p.id as old_id, first_value(p.id) over (partition by p.compte_id, p.nom order by (p.deleted_at is null) desc, p.created_at) as new_id
  from patinage.piste p where p.compte_id='45999b83-99d1-48e4-8115-a741fe54c405';
create temp table map_saison as
  select s.id as old_id, first_value(s.id) over (partition by s.compte_id, s.libelle order by (s.deleted_at is null) desc, s.created_at) as new_id
  from patinage.saison s where s.compte_id='45999b83-99d1-48e4-8115-a741fe54c405';

create temp table cd_map as
  select cd.id, coalesce(mc.new_id, cd.circuit_id) as circuit_new, coalesce(md.new_id, cd.distance_id) as distance_new,
         cd.deleted_at, cd.created_at
  from patinage.circuit_distance cd
  left join map_circuit mc on mc.old_id = cd.circuit_id
  left join map_distance md on md.old_id = cd.distance_id;
delete from patinage.circuit_distance where id in (
  select id from (select id, row_number() over (partition by circuit_new, distance_new order by (deleted_at is null) desc, created_at) rn from cd_map) x where rn > 1);
update patinage.circuit_distance cd set circuit_id = m.circuit_new, distance_id = m.distance_new, updated_at = now()
  from cd_map m where cd.id = m.id and (cd.circuit_id <> m.circuit_new or cd.distance_id <> m.distance_new);

update patinage.epreuve e set distance_id = m.new_id, updated_at = now() from map_distance m where e.distance_id = m.old_id and m.old_id <> m.new_id;
update patinage.chrono e set distance_id = m.new_id, updated_at = now() from map_distance m where e.distance_id = m.old_id and m.old_id <> m.new_id;
update patinage.competition e set circuit_id = m.new_id, updated_at = now() from map_circuit m where e.circuit_id = m.old_id and m.old_id <> m.new_id;
update patinage.bareme_points e set circuit_id = m.new_id, updated_at = now() from map_circuit m where e.circuit_id = m.old_id and m.old_id <> m.new_id;
update patinage.competition e set piste_id = m.new_id, updated_at = now() from map_piste m where e.piste_id = m.old_id and m.old_id <> m.new_id;
update patinage.seance_entrainement e set piste_id = m.new_id, updated_at = now() from map_piste m where e.piste_id = m.old_id and m.old_id <> m.new_id;
update patinage.competition e set saison_id = m.new_id, updated_at = now() from map_saison m where e.saison_id = m.old_id and m.old_id <> m.new_id;
update patinage.bareme_points e set saison_id = m.new_id, updated_at = now() from map_saison m where e.saison_id = m.old_id and m.old_id <> m.new_id;
delete from patinage.athlete_saison e using map_saison m
  where e.saison_id = m.old_id and m.old_id <> m.new_id
  and exists (select 1 from patinage.athlete_saison x where x.athlete_id = e.athlete_id and x.saison_id = m.new_id);
update patinage.athlete_saison e set saison_id = m.new_id, updated_at = now() from map_saison m where e.saison_id = m.old_id and m.old_id <> m.new_id;

update patinage.distance d set deleted_at = coalesce(d.deleted_at, now()), updated_at = now() from map_distance m where d.id = m.old_id and m.old_id <> m.new_id;
update patinage.circuit d set deleted_at = coalesce(d.deleted_at, now()), updated_at = now() from map_circuit m where d.id = m.old_id and m.old_id <> m.new_id;
update patinage.piste d set deleted_at = coalesce(d.deleted_at, now()), updated_at = now() from map_piste m where d.id = m.old_id and m.old_id <> m.new_id;
update patinage.saison d set deleted_at = coalesce(d.deleted_at, now()), updated_at = now() from map_saison m where d.id = m.old_id and m.old_id <> m.new_id;

delete from patinage.compte_membre where compte_id='8314ecfb-e789-46e6-9853-d0d299025254';
update patinage.compte set deleted_at = now(), updated_at = now(), nom = 'Famille (fusionné le 2026-10-25)' where id='8314ecfb-e789-46e6-9853-d0d299025254';

commit;

-- Résultat : 1 compte, 21 distances actives (au lieu de 71), 4 circuits, 8 pistes, 4 saisons,
-- 13 compétitions, 0 référence orpheline.
