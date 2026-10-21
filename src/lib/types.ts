// Types miroir du schéma « patinage » (Supabase).

export type TypePiste = 'courte_piste' | 'longue_piste'
export type TypeCourse = 'individuelle' | 'relais' | 'mass_start' | 'poursuite' | 'contre_la_montre'
export type TypeManche = 'serie_unique' | 'qualification' | 'repechage' | 'quart_de_finale' | 'demi_finale' | 'finale'
export type StatutResultat = 'termine' | 'penalite' | 'disqualifie' | 'avance' | 'chute' | 'abandon' | 'absent' | 'non_classe'
export type ContexteChrono = 'competition' | 'entrainement'
export type SourceTemps = 'chrono_app' | 'saisie_manuelle' | 'import_officiel'
export type TypeCouloir = 'interieur' | 'exterieur'
export type RoleMembre = 'proprietaire' | 'editeur' | 'lecteur'
export type TypeEquipement = 'lames' | 'bottes' | 'patins' | 'combinaison' | 'autre'

export interface BaseRow {
  id: string
  compte_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Compte {
  id: string
  nom: string
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CompteMembre {
  id: string
  compte_id: string
  user_id: string
  role: RoleMembre
  created_at: string
  updated_at: string
}

export interface Athlete extends BaseRow {
  prenom: string
  nom: string
  date_naissance: string | null
  sexe: 'F' | 'M' | 'X' | null
  actif: boolean
  commentaire: string | null
}

export interface Saison extends BaseRow {
  libelle: string
  date_debut: string
  date_fin: string
}

export interface AthleteSaison extends BaseRow {
  athlete_id: string
  saison_id: string
  categorie: string | null
  club: string | null
  entraineur: string | null
  commentaire: string | null
}

export interface Circuit extends BaseRow {
  nom: string
  type_piste: TypePiste | null
  organisme: string | null
  /** Longueur d'un tour sur ce circuit (100 = InterRégional CP, 111.12 = provincial CP). */
  longueur_piste_m: number | null
  commentaire: string | null
}

/** Programme d'un circuit : distances qui s'y courent. */
export interface CircuitDistance extends BaseRow {
  circuit_id: string
  distance_id: string
}

export interface Piste extends BaseRow {
  nom: string
  ville: string | null
  province: string | null
  type_piste: TypePiste
  longueur_m: number | null
  interieur: boolean
  commentaire: string | null
}

export interface Distance extends BaseRow {
  type_piste: TypePiste
  metres: number
  libelle: string
  type_course: TypeCourse
  nb_tours_defaut: number | null
  actif: boolean
}

export interface Equipement extends BaseRow {
  athlete_id: string
  type: TypeEquipement
  nom: string
  details: string | null
  date_debut: string | null
  date_fin: string | null
}

export interface Competition extends BaseRow {
  saison_id: string | null
  circuit_id: string | null
  piste_id: string | null
  nom: string
  date_debut: string
  date_fin: string | null
  niveau: string | null
  /** Surcharge de la longueur du tour (sinon circuit, sinon piste). */
  longueur_piste_m: number | null
  url_resultats: string | null
  commentaire: string | null
}

export interface Groupe extends BaseRow {
  competition_id: string
  nom: string
  ordre: number | null
}

export interface InscriptionCompetition extends BaseRow {
  competition_id: string
  athlete_id: string
  groupe_id: string | null
  dossard: string | null
  rang_final: number | null
  /** Nombre de patineurs dans la catégorie / le groupe (pour lire le rang : 3 / 24). */
  nb_participants: number | null
  points_total: number | null
  commentaire: string | null
}

export interface Epreuve extends BaseRow {
  competition_id: string
  groupe_id: string | null
  distance_id: string
  type_course: TypeCourse
  nom: string | null
  ordre: number | null
  commentaire: string | null
}

export interface Course extends BaseRow {
  epreuve_id: string
  type_manche: TypeManche
  lettre_finale: string | null
  ordre_manche: number | null
  numero_course: string | null
  prevue_a: string | null
  debutee_a: string | null
  nb_patineurs: number | null
  regle_qualification: string | null
  temperature_c: number | null
  vent: string | null
  etat_glace: string | null
  url_video: string | null
  commentaire: string | null
}

export interface SeanceEntrainement extends BaseRow {
  athlete_id: string
  piste_id: string | null
  date_seance: string
  type_seance: string | null
  objectif: string | null
  ressenti: number | null
  commentaire: string | null
}

export interface Chrono extends BaseRow {
  athlete_id: string
  contexte: ContexteChrono
  seance_entrainement_id: string | null
  distance_id: string | null
  equipement_id: string | null
  source: SourceTemps
  debute_a: string | null
  termine_a: string | null
  nb_tours_prevus: number | null
  /** Longueur du tour au moment de la capture — figée, l'historique ne bouge pas. */
  longueur_piste_m: number | null
  nb_tours_enregistres: number
  temps_calcule_ms: number | null
  temps_ajuste_ms: number | null
  temps_officiel_ms: number | null
  /** Colonne générée côté serveur ; recalculée localement par retenu(). */
  temps_retenu_ms?: number | null
  ecart_officiel_ms?: number | null
  chrono_incomplet: boolean
  note_ajustement: string | null
  commentaire: string | null
}

export interface Tour extends BaseRow {
  chrono_id: string
  numero_tour: number
  temps_tour_ms: number
  temps_tour_capture_ms: number | null
  cumul_capture_ms: number | null
  capture_a: string | null
  position_peloton: number | null
  commentaire: string | null
}

export interface Participation extends BaseRow {
  course_id: string
  athlete_id: string
  chrono_id: string
  couloir_depart: number | null
  type_couloir: TypeCouloir | null
  partenaire_paire: string | null
  position_arrivee: number | null
  rang_officiel: number | null
  statut: StatutResultat
  qualifie_suivant: boolean | null
  points: number | null
  points_sprint: number | null
  segments_relais: string | null
  coequipiers_relais: string[] | null
  ressenti: number | null
  url_video: string | null
  commentaire: string | null
}

/** Tables synchronisées (ordre = ordre des dépendances parents → enfants). */
export const SYNC_TABLES = [
  'athlete',
  'saison',
  'athlete_saison',
  'circuit',
  'piste',
  'distance',
  'circuit_distance',
  'equipement',
  'competition',
  'groupe',
  'inscription_competition',
  'epreuve',
  'course',
  'seance_entrainement',
  'chrono',
  'tour',
  'participation',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

export interface TableMap {
  athlete: Athlete
  saison: Saison
  athlete_saison: AthleteSaison
  circuit: Circuit
  piste: Piste
  distance: Distance
  circuit_distance: CircuitDistance
  equipement: Equipement
  competition: Competition
  groupe: Groupe
  inscription_competition: InscriptionCompetition
  epreuve: Epreuve
  course: Course
  seance_entrainement: SeanceEntrainement
  chrono: Chrono
  tour: Tour
  participation: Participation
}

/** Colonnes générées/maintenues par le serveur qu'on ne doit jamais envoyer. */
export const SERVER_ONLY_COLUMNS: Partial<Record<SyncTable, string[]>> = {
  chrono: ['temps_retenu_ms', 'ecart_officiel_ms', 'nb_tours_enregistres', 'temps_calcule_ms'],
}

export const LIBELLES = {
  type_piste: { courte_piste: 'Courte piste', longue_piste: 'Longue piste' } as Record<TypePiste, string>,
  type_course: {
    individuelle: 'Individuelle',
    relais: 'Relais',
    mass_start: 'Mass start',
    poursuite: 'Poursuite',
    contre_la_montre: 'Contre-la-montre',
  } as Record<TypeCourse, string>,
  type_manche: {
    serie_unique: 'Série unique',
    qualification: 'Qualification',
    repechage: 'Repêchage',
    quart_de_finale: 'Quart de finale',
    demi_finale: 'Demi-finale',
    finale: 'Finale',
  } as Record<TypeManche, string>,
  statut: {
    termine: 'Terminé',
    penalite: 'Pénalité',
    disqualifie: 'Disqualifié (DQ)',
    avance: 'Avancé (ADV)',
    chute: 'Chute',
    abandon: 'Abandon (DNF)',
    absent: 'Absent (DNS)',
    non_classe: 'Non classé',
  } as Record<StatutResultat, string>,
  type_couloir: { interieur: 'Intérieur', exterieur: 'Extérieur' } as Record<TypeCouloir, string>,
  type_equipement: {
    lames: 'Lames',
    bottes: 'Bottes',
    patins: 'Patins',
    combinaison: 'Combinaison',
    autre: 'Autre',
  } as Record<TypeEquipement, string>,
}

export function mancheLabel(c: Pick<Course, 'type_manche' | 'lettre_finale'>): string {
  const base = LIBELLES.type_manche[c.type_manche]
  return c.type_manche === 'finale' && c.lettre_finale ? `${base} ${c.lettre_finale}` : base
}
