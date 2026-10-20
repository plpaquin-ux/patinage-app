-- =====================================================================
-- Migration 0001 — Suivi de performance patinage de vitesse
-- Supabase / PostgreSQL — schéma « patinage » du projet ph2-datalake
--
-- Principes :
--   * Multi-athlètes : tout est rattaché à un COMPTE (ménage/famille) ;
--     plusieurs usagers peuvent être membres d'un compte (proprietaire,
--     editeur, lecteur). Le RLS s'appuie uniquement sur compte_id.
--   * Hors ligne : toutes les clés sont des UUID (générables côté client),
--     toutes les tables ont created_at / updated_at / deleted_at (soft
--     delete) pour permettre une synchronisation « last-write-wins ».
--   * Manches optionnelles : une épreuve a 0..n courses, chacune typée
--     (qualification, repêchage, quart, demi, finale A/B/C…, série unique).
--     Aucune séquence imposée.
--   * Temps ajustables : chaque tour garde sa valeur captée d'origine
--     (immuable) et une valeur éditable ; le chrono garde un temps calculé
--     (somme des tours, maintenu par trigger), un temps ajusté (override
--     manuel du total) et un temps officiel. temps_retenu_ms =
--     coalesce(officiel, ajusté, calculé).
--   * Entraînement simple : une séance contient des chronos (runs) sans la
--     structure compétition/épreuve/course.
-- =====================================================================

create extension if not exists "pgcrypto";

-- Schéma dédié dans le projet ph2-datalake (isolé de public)
create schema if not exists patinage;
set search_path = patinage, public;

-- ---------------------------------------------------------------------
-- 1. Types énumérés
-- ---------------------------------------------------------------------
create type type_piste      as enum ('courte_piste', 'longue_piste');
create type type_course     as enum ('individuelle', 'relais', 'mass_start', 'poursuite', 'contre_la_montre');
create type type_manche     as enum ('serie_unique', 'qualification', 'repechage', 'quart_de_finale', 'demi_finale', 'finale');
create type statut_resultat as enum ('termine', 'penalite', 'disqualifie', 'avance', 'chute', 'abandon', 'absent', 'non_classe');
create type contexte_chrono as enum ('competition', 'entrainement');
create type source_temps    as enum ('chrono_app', 'saisie_manuelle', 'import_officiel');
create type type_couloir    as enum ('interieur', 'exterieur');
create type role_membre     as enum ('proprietaire', 'editeur', 'lecteur');
create type type_equipement as enum ('lames', 'bottes', 'patins', 'combinaison', 'autre');

-- ---------------------------------------------------------------------
-- 2. Fonctions utilitaires (horodatage, sync)
-- ---------------------------------------------------------------------
create or replace function fn_set_updated_at()
returns trigger language plpgsql set search_path = patinage, public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Applique le trigger updated_at à une table
create or replace function fn_add_updated_at_trigger(p_table regclass)
returns void language plpgsql set search_path = patinage, public as $$
begin
  execute format(
    'create trigger trg_%s_updated_at before update on %s for each row execute function fn_set_updated_at()',
    replace(p_table::text, '.', '_'), p_table);
end $$;

-- ---------------------------------------------------------------------
-- 3. Comptes et membres (base du RLS)
-- ---------------------------------------------------------------------
create table compte (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table compte_membre (
  id          uuid primary key default gen_random_uuid(),
  compte_id   uuid not null references compte(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        role_membre not null default 'editeur',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (compte_id, user_id)
);
create index on compte_membre(user_id);

-- Le créateur d'un compte en devient automatiquement propriétaire
create or replace function fn_compte_after_insert()
returns trigger language plpgsql security definer set search_path = patinage, public as $$
begin
  if auth.uid() is not null then
    insert into compte_membre (compte_id, user_id, role)
    values (new.id, auth.uid(), 'proprietaire')
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger trg_compte_after_insert after insert on compte
  for each row execute function fn_compte_after_insert();

-- Comptes accessibles en lecture par l'usager courant
create or replace function fn_mes_comptes()
returns setof uuid language sql stable security definer set search_path = patinage, public as $$
  select compte_id from compte_membre where user_id = auth.uid();
$$;

-- Comptes accessibles en écriture par l'usager courant
create or replace function fn_mes_comptes_ecriture()
returns setof uuid language sql stable security definer set search_path = patinage, public as $$
  select compte_id from compte_membre
  where user_id = auth.uid() and role in ('proprietaire', 'editeur');
$$;

-- ---------------------------------------------------------------------
-- 4. Référentiels
-- ---------------------------------------------------------------------
create table athlete (
  id              uuid primary key default gen_random_uuid(),
  compte_id       uuid not null references compte(id) on delete cascade,
  prenom          text not null,
  nom             text not null,
  date_naissance  date,
  sexe            text check (sexe in ('F', 'M', 'X')),
  actif           boolean not null default true,
  commentaire     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on athlete(compte_id);

create table saison (
  id          uuid primary key default gen_random_uuid(),
  compte_id   uuid not null references compte(id) on delete cascade,
  libelle     text not null,                 -- ex. « 2026-2027 »
  date_debut  date not null,
  date_fin    date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (date_fin >= date_debut)
);
create index on saison(compte_id);

-- Contexte de l'athlète pour une saison (catégorie d'âge, club, entraîneur)
create table athlete_saison (
  id          uuid primary key default gen_random_uuid(),
  compte_id   uuid not null references compte(id) on delete cascade,
  athlete_id  uuid not null references athlete(id) on delete cascade,
  saison_id   uuid not null references saison(id) on delete cascade,
  categorie   text,                          -- ex. « Juvénile », « Cadet »
  club        text,
  entraineur  text,
  commentaire text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (athlete_id, saison_id)
);

create table circuit (
  id          uuid primary key default gen_random_uuid(),
  compte_id   uuid not null references compte(id) on delete cascade,
  nom         text not null,                 -- ex. « InterRégional », « Provincial LP »
  type_piste  type_piste,
  organisme   text,                          -- ex. « Patinage de vitesse Québec »
  commentaire text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on circuit(compte_id);

-- Barème de points d'un circuit (versionné par saison si nécessaire)
create table bareme_points (
  id          uuid primary key default gen_random_uuid(),
  compte_id   uuid not null references compte(id) on delete cascade,
  circuit_id  uuid not null references circuit(id) on delete cascade,
  saison_id   uuid references saison(id) on delete set null,
  nom         text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table bareme_points_ligne (
  id             uuid primary key default gen_random_uuid(),
  compte_id      uuid not null references compte(id) on delete cascade,
  bareme_id      uuid not null references bareme_points(id) on delete cascade,
  type_manche    type_manche not null default 'finale',
  lettre_finale  text,                       -- « A », « B », … ; null = toutes
  rang           int not null check (rang > 0),
  points         numeric(7,2) not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on bareme_points_ligne(bareme_id);

-- Piste = aréna/anneau + longueur de piste. Un lieu ayant deux pistes
-- (CP et LP) = deux lignes.
create table piste (
  id           uuid primary key default gen_random_uuid(),
  compte_id    uuid not null references compte(id) on delete cascade,
  nom          text not null,                -- nom de l'aréna / anneau
  ville        text,
  province     text default 'QC',
  type_piste   type_piste not null,
  longueur_m   numeric(7,2),                 -- 111.12, 400, 333.33…
  interieur    boolean not null default true,
  commentaire  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index on piste(compte_id);

create table distance (
  id               uuid primary key default gen_random_uuid(),
  compte_id        uuid not null references compte(id) on delete cascade,
  type_piste       type_piste not null,
  metres           int not null check (metres > 0),
  libelle          text not null,            -- ex. « 500 m », « Relais 3000 m »
  type_course      type_course not null default 'individuelle',
  nb_tours_defaut  numeric(5,2),             -- ex. 4.5 pour 500 m CP
  actif            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index on distance(compte_id);

create table equipement (
  id          uuid primary key default gen_random_uuid(),
  compte_id   uuid not null references compte(id) on delete cascade,
  athlete_id  uuid not null references athlete(id) on delete cascade,
  type        type_equipement not null,
  nom         text not null,                 -- ex. « Maple Laser 15.5", rocker 8m »
  details     text,
  date_debut  date,
  date_fin    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on equipement(athlete_id);

-- ---------------------------------------------------------------------
-- 5. Compétition → Groupe / Inscription → Épreuve → Course
-- ---------------------------------------------------------------------
create table competition (
  id             uuid primary key default gen_random_uuid(),
  compte_id      uuid not null references compte(id) on delete cascade,
  saison_id      uuid references saison(id) on delete set null,
  circuit_id     uuid references circuit(id) on delete set null,
  piste_id       uuid references piste(id) on delete set null,
  nom            text not null,
  date_debut     date not null,
  date_fin       date,
  niveau         text,                       -- régional, provincial, invitation…
  url_resultats  text,                       -- lien vers résultats officiels
  commentaire    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index on competition(compte_id, date_debut desc);

-- Groupe de course dans une compétition (Groupe 1, Groupe 2 Filles, Mix…)
create table groupe (
  id              uuid primary key default gen_random_uuid(),
  compte_id       uuid not null references compte(id) on delete cascade,
  competition_id  uuid not null references competition(id) on delete cascade,
  nom             text not null,
  ordre           int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on groupe(competition_id);

-- Inscription d'un athlète à une compétition + RÉSULTAT GLOBAL de la compétition
create table inscription_competition (
  id              uuid primary key default gen_random_uuid(),
  compte_id       uuid not null references compte(id) on delete cascade,
  competition_id  uuid not null references competition(id) on delete cascade,
  athlete_id      uuid not null references athlete(id) on delete cascade,
  groupe_id       uuid references groupe(id) on delete set null,
  dossard         text,
  rang_final      int,                       -- classement au cumul de la compétition
  points_total    numeric(7,2),              -- points récoltés (cumul)
  commentaire     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (competition_id, athlete_id)
);
create index on inscription_competition(athlete_id);

-- Épreuve = une distance dans une compétition (pour un groupe)
create table epreuve (
  id              uuid primary key default gen_random_uuid(),
  compte_id       uuid not null references compte(id) on delete cascade,
  competition_id  uuid not null references competition(id) on delete cascade,
  groupe_id       uuid references groupe(id) on delete set null,
  distance_id     uuid not null references distance(id),
  type_course     type_course not null default 'individuelle',
  nom             text,                      -- libre, ex. « 500 m (1) » s'il y a deux 500 m
  ordre           int,
  commentaire     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on epreuve(competition_id);

-- Course = une manche d'une épreuve. 0..n par épreuve, AUCUNE séquence imposée :
-- une épreuve peut n'avoir qu'une 'serie_unique' ou qu'une 'finale'.
create table course (
  id                    uuid primary key default gen_random_uuid(),
  compte_id             uuid not null references compte(id) on delete cascade,
  epreuve_id            uuid not null references epreuve(id) on delete cascade,
  type_manche           type_manche not null default 'finale',
  lettre_finale         text,                -- « A », « B », « C »… (finales seulement)
  ordre_manche          int,                 -- ordre chronologique dans l'épreuve
  numero_course         text,                -- numéro officiel sur l'horaire
  prevue_a              timestamptz,         -- heure prévue
  debutee_a             timestamptz,         -- heure réelle (date et heure de la course)
  nb_patineurs          int,                 -- patineurs au départ
  regle_qualification   text,                -- ex. « 2 premiers + meilleur 3e »
  temperature_c         numeric(4,1),        -- longue piste extérieure
  vent                  text,
  etat_glace            text,
  url_video             text,
  commentaire           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index on course(epreuve_id);

-- ---------------------------------------------------------------------
-- 6. Entraînement (simple)
-- ---------------------------------------------------------------------
create table seance_entrainement (
  id           uuid primary key default gen_random_uuid(),
  compte_id    uuid not null references compte(id) on delete cascade,
  athlete_id   uuid not null references athlete(id) on delete cascade,
  piste_id     uuid references piste(id) on delete set null,
  date_seance  timestamptz not null default now(),
  type_seance  text,                         -- technique, intervalles, test…
  objectif     text,
  ressenti     smallint check (ressenti between 1 and 5),
  commentaire  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index on seance_entrainement(athlete_id, date_seance desc);

-- ---------------------------------------------------------------------
-- 7. Chrono (run) et tours — commun compétition / entraînement
-- ---------------------------------------------------------------------
create table chrono (
  id                     uuid primary key default gen_random_uuid(),
  compte_id              uuid not null references compte(id) on delete cascade,
  athlete_id             uuid not null references athlete(id) on delete cascade,
  contexte               contexte_chrono not null,
  seance_entrainement_id uuid references seance_entrainement(id) on delete cascade,
  distance_id            uuid references distance(id),
  equipement_id          uuid references equipement(id) on delete set null,
  source                 source_temps not null default 'chrono_app',
  debute_a               timestamptz,        -- horodatage du départ (chrono)
  termine_a              timestamptz,        -- horodatage de l'arrivée (chrono)
  nb_tours_prevus        int,
  nb_tours_enregistres   int not null default 0,       -- maintenu par trigger
  temps_calcule_ms       int,                           -- somme des tours (trigger)
  temps_ajuste_ms        int,                           -- override manuel du total
  temps_officiel_ms      int,                           -- temps des officiels
  temps_retenu_ms        int generated always as
                           (coalesce(temps_officiel_ms, temps_ajuste_ms, temps_calcule_ms)) stored,
  ecart_officiel_ms      int generated always as
                           (temps_officiel_ms - coalesce(temps_ajuste_ms, temps_calcule_ms)) stored,
  chrono_incomplet       boolean not null default false, -- tour(s) manqué(s)
  note_ajustement        text,
  commentaire            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  check (contexte <> 'entrainement' or seance_entrainement_id is not null),
  check (temps_calcule_ms  is null or temps_calcule_ms  >= 0),
  check (temps_ajuste_ms   is null or temps_ajuste_ms   >= 0),
  check (temps_officiel_ms is null or temps_officiel_ms >= 0)
);
create index on chrono(athlete_id, debute_a desc);
create index on chrono(seance_entrainement_id);

create table tour (
  id                     uuid primary key default gen_random_uuid(),
  compte_id              uuid not null references compte(id) on delete cascade,
  chrono_id              uuid not null references chrono(id) on delete cascade,
  numero_tour            int not null check (numero_tour > 0),
  temps_tour_ms          int not null check (temps_tour_ms >= 0),  -- valeur ÉDITABLE
  temps_tour_capture_ms  int,                -- valeur captée d'origine (immuable)
  cumul_capture_ms       int,                -- écoulé depuis le départ au moment du clic
  capture_a              timestamptz,        -- horodatage absolu du clic
  position_peloton       int,                -- position dans le groupe à ce tour (opt.)
  commentaire            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create unique index tour_chrono_numero_uq on tour(chrono_id, numero_tour) where deleted_at is null;

-- Le temps capté d'origine est figé dès la première insertion
create or replace function fn_tour_before_insert()
returns trigger language plpgsql set search_path = patinage, public as $$
begin
  if new.temps_tour_capture_ms is null then
    new.temps_tour_capture_ms := new.temps_tour_ms;
  end if;
  return new;
end $$;
create trigger trg_tour_before_insert before insert on tour
  for each row execute function fn_tour_before_insert();

create or replace function fn_tour_protect_capture()
returns trigger language plpgsql set search_path = patinage, public as $$
begin
  new.temps_tour_capture_ms := old.temps_tour_capture_ms;
  new.cumul_capture_ms      := old.cumul_capture_ms;
  new.capture_a             := old.capture_a;
  return new;
end $$;
create trigger trg_tour_protect_capture before update on tour
  for each row execute function fn_tour_protect_capture();

-- Recalcul du temps calculé et du nombre de tours sur le chrono parent
create or replace function fn_chrono_recalc(p_chrono_id uuid)
returns void language sql set search_path = patinage, public as $$
  update chrono c
  set temps_calcule_ms     = s.total,
      nb_tours_enregistres = s.nb
  from (
    select sum(temps_tour_ms)::int as total, count(*)::int as nb
    from tour where chrono_id = p_chrono_id and deleted_at is null
  ) s
  where c.id = p_chrono_id;
$$;

create or replace function fn_tour_after_change()
returns trigger language plpgsql set search_path = patinage, public as $$
begin
  if tg_op = 'DELETE' then
    perform fn_chrono_recalc(old.chrono_id);
  else
    perform fn_chrono_recalc(new.chrono_id);
    if tg_op = 'UPDATE' and new.chrono_id <> old.chrono_id then
      perform fn_chrono_recalc(old.chrono_id);
    end if;
  end if;
  return null;
end $$;
create trigger trg_tour_after_change after insert or update or delete on tour
  for each row execute function fn_tour_after_change();

-- ---------------------------------------------------------------------
-- 8. Participation = l'athlète dans une course (résultat par course)
-- ---------------------------------------------------------------------
create table participation (
  id                  uuid primary key default gen_random_uuid(),
  compte_id           uuid not null references compte(id) on delete cascade,
  course_id           uuid not null references course(id) on delete cascade,
  athlete_id          uuid not null references athlete(id) on delete cascade,
  chrono_id           uuid not null unique references chrono(id) on delete cascade,
  couloir_depart      int,                   -- position de départ (CP) / couloir (LP)
  type_couloir        type_couloir,          -- LP : intérieur / extérieur
  partenaire_paire    text,                  -- LP : patineur dans la paire
  position_arrivee    int,                   -- ordre de passage de la ligne
  rang_officiel       int,                   -- classement officiel (après pénalités)
  statut              statut_resultat not null default 'termine',
  qualifie_suivant    boolean,               -- passe à la manche suivante ?
  points              numeric(7,2),          -- points récoltés pour cette course
  points_sprint       int,                   -- mass start : points intermédiaires
  segments_relais     text,                  -- relais : segments patinés
  coequipiers_relais  text[],                -- relais : coéquipières
  ressenti            smallint check (ressenti between 1 and 5),
  url_video           text,
  commentaire         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create unique index participation_course_athlete_uq on participation(course_id, athlete_id) where deleted_at is null;
create index on participation(athlete_id);

-- ---------------------------------------------------------------------
-- 9. Triggers updated_at
-- ---------------------------------------------------------------------
select fn_add_updated_at_trigger(t) from unnest(array[
  'compte','compte_membre','athlete','saison','athlete_saison','circuit',
  'bareme_points','bareme_points_ligne','piste','distance','equipement',
  'competition','groupe','inscription_competition','epreuve','course',
  'seance_entrainement','chrono','tour','participation'
]::regclass[]) as t;

-- ---------------------------------------------------------------------
-- 10. RLS — toutes les tables scoping compte_id
-- ---------------------------------------------------------------------
create or replace function fn_enable_rls_compte(p_table regclass)
returns void language plpgsql set search_path = patinage, public as $$
declare t text := replace(p_table::text, '.', '_');
begin
  execute format('alter table %s enable row level security', p_table);
  execute format('create policy %I on %s for select to authenticated using (compte_id in (select fn_mes_comptes()))', t || '_select', p_table);
  execute format('create policy %I on %s for insert to authenticated with check (compte_id in (select fn_mes_comptes_ecriture()))', t || '_insert', p_table);
  execute format('create policy %I on %s for update to authenticated using (compte_id in (select fn_mes_comptes_ecriture())) with check (compte_id in (select fn_mes_comptes_ecriture()))', t || '_update', p_table);
  execute format('create policy %I on %s for delete to authenticated using (compte_id in (select fn_mes_comptes_ecriture()))', t || '_delete', p_table);
end $$;

select fn_enable_rls_compte(t) from unnest(array[
  'athlete','saison','athlete_saison','circuit','bareme_points',
  'bareme_points_ligne','piste','distance','equipement','competition',
  'groupe','inscription_competition','epreuve','course',
  'seance_entrainement','chrono','tour','participation'
]::regclass[]) as t;

-- compte : lecture si membre ; création libre (le trigger ajoute le propriétaire)
alter table compte enable row level security;
create policy compte_select on compte for select to authenticated
  using (id in (select fn_mes_comptes()));
create policy compte_insert on compte for insert to authenticated
  with check (true);
create policy compte_update on compte for update to authenticated
  using (id in (select compte_id from compte_membre where user_id = auth.uid() and role = 'proprietaire'));
create policy compte_delete on compte for delete to authenticated
  using (id in (select compte_id from compte_membre where user_id = auth.uid() and role = 'proprietaire'));

-- compte_membre : lecture par les membres, gestion par le propriétaire
alter table compte_membre enable row level security;
create policy compte_membre_select on compte_membre for select to authenticated
  using (compte_id in (select fn_mes_comptes()));
create policy compte_membre_manage on compte_membre for all to authenticated
  using (compte_id in (select compte_id from compte_membre where user_id = auth.uid() and role = 'proprietaire'))
  with check (compte_id in (select compte_id from compte_membre where user_id = auth.uid() and role = 'proprietaire'));

-- ---------------------------------------------------------------------
-- 11. Vues d'analyse (security_invoker → le RLS s'applique)
-- ---------------------------------------------------------------------

-- Tours avec cumul recalculé à partir des valeurs éditables
create view v_tour_detail with (security_invoker = true) as
select
  t.id, t.chrono_id, t.numero_tour, t.temps_tour_ms, t.temps_tour_capture_ms,
  sum(t.temps_tour_ms) over (partition by t.chrono_id order by t.numero_tour) as cumul_ms,
  t.cumul_capture_ms,
  t.temps_tour_ms - t.temps_tour_capture_ms as ajustement_ms,
  t.position_peloton, t.commentaire
from tour t
where t.deleted_at is null;

-- Vue plate : une ligne par participation, avec tout le contexte
create view v_participation_detail with (security_invoker = true) as
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
  p.commentaire
from participation p
join chrono ch        on ch.id = p.chrono_id and ch.deleted_at is null
join athlete a        on a.id = p.athlete_id
join course c         on c.id = p.course_id and c.deleted_at is null
join epreuve e        on e.id = c.epreuve_id and e.deleted_at is null
join distance d       on d.id = e.distance_id
join competition cp   on cp.id = e.competition_id and cp.deleted_at is null
left join groupe g    on g.id = e.groupe_id
left join piste pi    on pi.id = cp.piste_id
left join circuit ci  on ci.id = cp.circuit_id
left join saison s    on s.id = cp.saison_id
left join equipement eq on eq.id = ch.equipement_id
where p.deleted_at is null;

-- Meilleur temps personnel par athlète / distance / type de piste
-- (résultats terminés ou avancés seulement, temps retenu non nul)
create view v_meilleur_temps with (security_invoker = true) as
select distinct on (athlete_id, type_piste, metres)
  athlete_id, athlete, type_piste, metres, distance,
  temps_retenu_ms, competition, competition_date, arena, type_manche, lettre_finale
from v_participation_detail
where temps_retenu_ms is not null and statut in ('termine', 'avance')
order by athlete_id, type_piste, metres, temps_retenu_ms asc;

-- Meilleur temps par saison
create view v_meilleur_temps_saison with (security_invoker = true) as
select distinct on (athlete_id, saison, type_piste, metres)
  athlete_id, athlete, saison, type_piste, metres, distance,
  temps_retenu_ms, competition, competition_date, arena
from v_participation_detail
where temps_retenu_ms is not null and statut in ('termine', 'avance')
order by athlete_id, saison, type_piste, metres, temps_retenu_ms asc;

-- Chronos d'entraînement avec contexte
create view v_entrainement_detail with (security_invoker = true) as
select
  ch.id as chrono_id, a.id as athlete_id, a.prenom || ' ' || a.nom as athlete,
  se.date_seance, se.type_seance, se.objectif, se.ressenti,
  pi.nom as arena, pi.type_piste, d.metres, d.libelle as distance,
  ch.debute_a, ch.temps_calcule_ms, ch.temps_ajuste_ms, ch.temps_retenu_ms,
  ch.nb_tours_enregistres, ch.chrono_incomplet, ch.commentaire
from chrono ch
join seance_entrainement se on se.id = ch.seance_entrainement_id and se.deleted_at is null
join athlete a on a.id = ch.athlete_id
left join piste pi on pi.id = se.piste_id
left join distance d on d.id = ch.distance_id
where ch.contexte = 'entrainement' and ch.deleted_at is null;

-- ---------------------------------------------------------------------
-- 12. Points depuis un barème (utilitaire)
-- ---------------------------------------------------------------------
create or replace function fn_points_bareme(
  p_bareme_id uuid, p_type_manche type_manche, p_lettre text, p_rang int)
returns numeric language sql stable set search_path = patinage, public as $$
  select points from bareme_points_ligne
  where bareme_id = p_bareme_id
    and type_manche = p_type_manche
    and rang = p_rang
    and (lettre_finale is null or lettre_finale = p_lettre)
  order by lettre_finale nulls last
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- 13. Amorçage d'un nouveau compte : distances standard
--     (à ajuster selon les catégories de PVQ)
-- ---------------------------------------------------------------------
create or replace function fn_amorcer_compte(p_compte_id uuid)
returns void language plpgsql security definer set search_path = patinage, public as $$
begin
  insert into distance (compte_id, type_piste, metres, libelle, type_course, nb_tours_defaut) values
    (p_compte_id, 'courte_piste',  200, '200 m',  'individuelle', 1.8),
    (p_compte_id, 'courte_piste',  400, '400 m',  'individuelle', 3.6),
    (p_compte_id, 'courte_piste',  500, '500 m',  'individuelle', 4.5),
    (p_compte_id, 'courte_piste',  777, '777 m',  'individuelle', 7),
    (p_compte_id, 'courte_piste', 1000, '1000 m', 'individuelle', 9),
    (p_compte_id, 'courte_piste', 1500, '1500 m', 'individuelle', 13.5),
    (p_compte_id, 'courte_piste', 2000, 'Relais 2000 m', 'relais', 18),
    (p_compte_id, 'courte_piste', 3000, 'Relais 3000 m', 'relais', 27),
    (p_compte_id, 'longue_piste',  100, '100 m',  'individuelle', 0.25),
    (p_compte_id, 'longue_piste',  300, '300 m',  'individuelle', 0.75),
    (p_compte_id, 'longue_piste',  400, '400 m',  'individuelle', 1),
    (p_compte_id, 'longue_piste',  500, '500 m',  'individuelle', 1.25),
    (p_compte_id, 'longue_piste', 1000, '1000 m', 'individuelle', 2.5),
    (p_compte_id, 'longue_piste', 1500, '1500 m', 'individuelle', 3.75),
    (p_compte_id, 'longue_piste', 3000, '3000 m', 'individuelle', 7.5),
    (p_compte_id, 'longue_piste', 5000, '5000 m', 'individuelle', 12.5),
    (p_compte_id, 'longue_piste', 3200, 'Mass start 3200 m', 'mass_start', 8)
  on conflict do nothing;

  insert into circuit (compte_id, nom, type_piste, organisme) values
    (p_compte_id, 'InterRégional', 'courte_piste', 'Patinage de vitesse Québec'),
    (p_compte_id, 'Circuit québécois longue piste', 'longue_piste', 'Patinage de vitesse Québec')
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- 14. Realtime (optionnel, utile pour la sync multi-appareils)
-- ---------------------------------------------------------------------
-- alter publication supabase_realtime add table chrono, tour, participation, course;

-- ---------------------------------------------------------------------
-- 15. Droits d'accès via l'API Supabase (PostgREST). Le schéma doit aussi
--     être ajouté aux « Exposed schemas » (Project Settings → Data API).
-- ---------------------------------------------------------------------
grant usage on schema patinage to anon, authenticated, service_role;
grant all on all tables in schema patinage to anon, authenticated, service_role;
grant all on all sequences in schema patinage to anon, authenticated, service_role;
grant execute on all functions in schema patinage to anon, authenticated, service_role;
alter default privileges in schema patinage grant all on tables to anon, authenticated, service_role;
alter default privileges in schema patinage grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema patinage grant execute on functions to anon, authenticated, service_role;

-- Exposition du schéma à l'API (équivalent du réglage « Exposed schemas »)
-- alter role authenticator set pgrst.db_schemas = 'public, graphql_public, patinage';
-- notify pgrst, 'reload config';
