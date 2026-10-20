-- Longueur du tracé : définie par le circuit (InterRégional 100 m, Provincial 111,12 m),
-- surchargeable par compétition, et FIGÉE sur chaque chrono au moment de la capture.
-- (Migration appliquée sous le nom « patinage_longueur_piste » ; voir le détail dans Supabase.)
set search_path = patinage, public;
alter table circuit     add column if not exists longueur_piste_m numeric(7,2);
alter table competition add column if not exists longueur_piste_m numeric(7,2);
alter table chrono      add column if not exists longueur_piste_m numeric(7,2);
-- + mise à jour de fn_amorcer_compte (circuit « Provincial courte piste » à 111,12 m),
--   de v_participation_detail (longueur_piste_m, nb_tours_theorique, nb_tours_prevus)
--   et des vues v_meilleur_temps / v_meilleur_temps_saison (distinction par longueur de tour).
