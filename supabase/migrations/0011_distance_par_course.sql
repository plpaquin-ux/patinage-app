-- Migration « patinage_distance_par_course »
-- La distance est portée par chaque course, et non plus seulement par l'épreuve.
--
-- Une épreuve regroupe les courses (qualification, finale…) qui mènent à un même classement, et
-- ces courses n'ont pas forcément la même distance : en InterRégional, l'épreuve du 1500 m se
-- compose d'une qualification de 1000 m et d'une finale de 1500 m. L'épreuve garde sa distance
-- nominale (celle de la finale) pour son nom, son tri et comme valeur par défaut des nouvelles
-- courses ; `course.distance_id` porte la distance réellement courue, et c'est elle que lisent
-- les vues d'analyse et le portrait public (records par distance).
set search_path = patinage, public;

alter table course add column if not exists distance_id uuid references distance(id);
update course c set distance_id = e.distance_id
from epreuve e where e.id = c.epreuve_id and c.distance_id is null;
alter table course alter column distance_id set not null;
create index if not exists course_distance_idx on course(distance_id);

comment on column course.distance_id is 'Distance réellement courue (peut différer de la distance nominale de l''épreuve : qualification de 1000 m d''une épreuve de 1500 m).';
comment on column epreuve.distance_id is 'Distance nominale de l''épreuve (celle de la finale) : nom, tri, valeur par défaut des courses.';

-- ---------------------------------------------------------------------
-- Vue plate : la distance vient de la course ; la distance de l'épreuve est ajoutée en fin
-- ---------------------------------------------------------------------
create or replace view v_participation_detail with (security_invoker = true) as
select
  p.id                      as participation_id,
  a.id                      as athlete_id,
  a.prenom || ' ' || a.nom  as athlete,
  s.libelle                 as saison,
  ci.nom                    as circuit,
  cp.id                     as competition_id,
  cp.nom                    as competition,
  cp.date_debut             as competition_date,
  cp.niveau,
  pi.nom                    as arena,
  pi.ville,
  pi.type_piste,
  pi.longueur_m,
  pi.interieur,
  g.nom                     as groupe,
  d.metres,
  d.libelle                 as distance,
  e.type_course,
  c.id                      as course_id,
  c.type_manche,
  c.lettre_finale,
  c.ordre_manche,
  c.numero_course,
  coalesce(c.debutee_a, c.prevue_a) as course_a,
  c.nb_patineurs,
  c.temperature_c,
  p.couloir_depart,
  p.type_couloir,
  p.position_arrivee,
  p.rang_officiel,
  p.statut,
  p.qualifie_suivant,
  p.points,
  ch.id                     as chrono_id,
  ch.temps_calcule_ms,
  ch.temps_ajuste_ms,
  ch.temps_officiel_ms,
  ch.temps_retenu_ms,
  ch.ecart_officiel_ms,
  ch.nb_tours_enregistres,
  ch.chrono_incomplet,
  eq.nom                    as equipement,
  p.commentaire,
  coalesce(ch.longueur_piste_m, cp.longueur_piste_m, ci.longueur_piste_m) as longueur_piste_m,
  case
    when coalesce(ch.longueur_piste_m, cp.longueur_piste_m, ci.longueur_piste_m) > 0
      then round(d.metres::numeric / coalesce(ch.longueur_piste_m, cp.longueur_piste_m, ci.longueur_piste_m), 2)
    else null::numeric
  end                       as nb_tours_theorique,
  ch.nb_tours_prevus,
  ins.rang_final            as competition_rang_final,
  ins.nb_participants       as competition_nb_participants,
  ins.points_total          as competition_points_total,
  e.id                      as epreuve_id,
  de.libelle                as epreuve_distance,
  de.metres                 as epreuve_metres
from participation p
join chrono ch        on ch.id = p.chrono_id and ch.deleted_at is null
join athlete a        on a.id = p.athlete_id
join course c         on c.id = p.course_id and c.deleted_at is null
join epreuve e        on e.id = c.epreuve_id and e.deleted_at is null
join distance d       on d.id = c.distance_id
join distance de      on de.id = e.distance_id
join competition cp   on cp.id = e.competition_id and cp.deleted_at is null
left join groupe g    on g.id = e.groupe_id
left join piste pi    on pi.id = cp.piste_id
left join circuit ci  on ci.id = cp.circuit_id
left join saison s    on s.id = cp.saison_id
left join equipement eq on eq.id = ch.equipement_id
left join inscription_competition ins
       on ins.competition_id = cp.id and ins.athlete_id = a.id and ins.deleted_at is null
where p.deleted_at is null;
-- v_meilleur_temps et v_meilleur_temps_saison lisent cette vue : elles suivent automatiquement.

-- ---------------------------------------------------------------------
-- Portrait public : distance de la course + distance de l'épreuve (pour le regroupement)
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
      de.libelle                     as epreuve_distance,
      de.metres                      as epreuve_metres,
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
    join distance d    on d.id = c.distance_id
    join distance de   on de.id = e.distance_id
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
                        order by k.course_a nulls last, k.epreuve_ordre nulls last, k.epreuve_metres, k.ordre_manche nulls last)
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
