-- Migration « patinage_partage_public »
-- Partage en lecture seule du portrait d'un athlète par lien secret (jeton), sans connexion.
--
-- - Table `partage` : un jeton aléatoire par lien, lié à un athlète ; géré par le compte (RLS).
-- - Fonction `fn_partage_lecture(jeton)` : security definer, appelable par `anon`, retourne un seul
--   JSON (athlète, records par distance, compétitions → courses, vidéos). Rien d'autre n'est exposé
--   publiquement : les tables restent protégées par le RLS.
set search_path = patinage, public;

create table if not exists partage (
  id          uuid primary key default gen_random_uuid(),
  compte_id   uuid not null references compte(id),
  athlete_id  uuid not null references athlete(id),
  jeton       text not null unique default gen_random_uuid()::text,
  libelle     text,
  actif       boolean not null default true,
  nb_acces    integer not null default 0,
  dernier_acces_a timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists partage_athlete_idx on partage(athlete_id);
select fn_add_updated_at_trigger('partage');
select fn_enable_rls_compte('partage');

-- Jeton lisible dans une URL : base64 → base64url (sans « + », « / », « = »)
create or replace function fn_partage_jeton()
returns text language sql volatile set search_path = patinage, public as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_')
$$;
alter table partage alter column jeton set default fn_partage_jeton();

-- ---------------------------------------------------------------------
-- Lecture publique
-- ---------------------------------------------------------------------
create or replace function fn_partage_lecture(p_jeton text)
returns jsonb language plpgsql security definer set search_path = patinage, public as $$
declare
  v_partage partage%rowtype;
  v_result jsonb;
begin
  select * into v_partage from partage
  where jeton = p_jeton and actif and deleted_at is null;
  if not found then
    return null;
  end if;

  update partage set nb_acces = nb_acces + 1, dernier_acces_a = now() where id = v_partage.id;

  with
  ath as (
    select a.id, a.prenom, a.nom
    from athlete a where a.id = v_partage.athlete_id and a.deleted_at is null
  ),
  -- Saison courante (celle qui contient aujourd'hui, sinon la plus récente) pour catégorie / club
  saison_cour as (
    select asn.categorie, asn.club, s.libelle as saison
    from athlete_saison asn
    join saison s on s.id = asn.saison_id and s.deleted_at is null
    where asn.athlete_id = v_partage.athlete_id and asn.deleted_at is null
    order by (current_date between s.date_debut and s.date_fin) desc, s.date_debut desc
    limit 1
  ),
  -- Une ligne par course de l'athlète
  courses as (
    select
      cp.id                          as competition_id,
      e.id                           as epreuve_id,
      e.ordre                        as epreuve_ordre,
      c.id                           as course_id,
      c.type_manche::text            as type_manche,
      c.lettre_finale,
      c.ordre_manche,
      coalesce(c.debutee_a, c.prevue_a) as course_a,
      c.nb_patineurs,
      d.id                           as distance_id,
      d.libelle                      as distance,
      d.metres,
      d.type_piste::text             as type_piste,
      e.type_course::text            as type_course,
      p.id                           as participation_id,
      p.statut::text                 as statut,
      p.rang_officiel,
      p.position_arrivee,
      p.points,
      coalesce(p.url_video, c.url_video) as url_video,
      p.commentaire,
      ch.id                          as chrono_id,
      ch.temps_retenu_ms,
      ch.temps_officiel_ms,
      ch.longueur_piste_m,
      ch.nb_tours_prevus,
      ch.chrono_incomplet,
      (select jsonb_agg(t.temps_tour_ms order by t.numero_tour)
         from tour t where t.chrono_id = ch.id and t.deleted_at is null) as tours
    from participation p
    join chrono ch     on ch.id = p.chrono_id and ch.deleted_at is null
    join course c      on c.id = p.course_id and c.deleted_at is null
    join epreuve e     on e.id = c.epreuve_id and e.deleted_at is null
    join distance d    on d.id = e.distance_id
    join competition cp on cp.id = e.competition_id and cp.deleted_at is null
    where p.athlete_id = v_partage.athlete_id and p.deleted_at is null
  ),
  competitions as (
    select
      cp.id, cp.nom, cp.date_debut, cp.date_fin, cp.niveau,
      ci.nom as circuit, ci.type_piste::text as type_piste,
      pi.nom as arena, pi.ville,
      s.libelle as saison,
      coalesce(cp.longueur_piste_m, ci.longueur_piste_m) as longueur_piste_m,
      ic.rang_final, ic.nb_participants, ic.points_total, ic.dossard,
      (select jsonb_agg(to_jsonb(k) - 'competition_id'
                        order by k.course_a nulls last, k.epreuve_ordre nulls last, k.metres, k.ordre_manche nulls last)
         from courses k where k.competition_id = cp.id) as courses
    from competition cp
    left join circuit ci on ci.id = cp.circuit_id
    left join piste pi   on pi.id = cp.piste_id
    left join saison s   on s.id = cp.saison_id
    left join inscription_competition ic
           on ic.competition_id = cp.id and ic.athlete_id = v_partage.athlete_id and ic.deleted_at is null
    where cp.deleted_at is null
      and (ic.id is not null or exists (select 1 from courses k where k.competition_id = cp.id))
  )
  select jsonb_build_object(
    'athlete', (select jsonb_build_object('prenom', a.prenom, 'nom', a.nom,
                  'categorie', sc.categorie, 'club', sc.club, 'saison', sc.saison)
                from ath a left join saison_cour sc on true),
    'libelle', v_partage.libelle,
    'genere_a', now(),
    'competitions', coalesce((select jsonb_agg(to_jsonb(c) order by c.date_debut desc) from competitions c), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

grant execute on function fn_partage_lecture(text) to anon, authenticated;
revoke execute on function fn_partage_jeton() from anon;

comment on table partage is 'Liens de partage public (lecture seule) du portrait d''un athlète.';
comment on function fn_partage_lecture(text) is 'Portrait public d''un athlète à partir d''un jeton de partage actif ; null si inconnu.';
