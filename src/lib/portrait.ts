import { db } from './db'
import { alive } from './repo'
import { longueurPiste, retenu, todayIsoDate } from './time'
import type { StatutResultat, TypeCourse, TypeManche, TypePiste } from './types'

/**
 * « Portrait » d'un athlète : la structure JSON de `fn_partage_lecture` (page publique),
 * reconstruite ici à l'identique à partir d'IndexedDB pour le tableau de bord interne (hors ligne).
 * Toute évolution de la forme doit être faite des deux côtés (SQL + `portraitLocal`).
 */
export interface PCourse {
  epreuve_id: string
  epreuve_ordre: number | null
  /** Distance nominale de l'épreuve (titre du regroupement) ; `distance` est celle réellement courue. */
  epreuve_distance: string
  epreuve_metres: number
  course_id: string
  type_manche: TypeManche
  lettre_finale: string | null
  ordre_manche: number | null
  course_a: string | null
  nb_patineurs: number | null
  distance_id: string
  distance: string
  metres: number
  type_piste: TypePiste
  type_course: TypeCourse
  participation_id: string
  statut: StatutResultat
  rang_officiel: number | null
  position_arrivee: number | null
  points: number | null
  url_video: string | null
  commentaire: string | null
  chrono_id: string
  temps_retenu_ms: number | null
  temps_officiel_ms: number | null
  longueur_piste_m: number | null
  nb_tours_prevus: number | null
  chrono_incomplet: boolean
  tours: number[] | null
}
export interface PCompetition {
  id: string
  nom: string
  date_debut: string
  date_fin: string | null
  niveau: string | null
  circuit: string | null
  type_piste: TypePiste | null
  arena: string | null
  ville: string | null
  saison: string | null
  longueur_piste_m: number | null
  rang_final: number | null
  nb_participants: number | null
  points_total: number | null
  dossard: string | null
  courses: PCourse[] | null
}
export interface Portrait {
  athlete: { prenom: string; nom: string; categorie: string | null; club: string | null; saison: string | null } | null
  libelle: string | null
  genere_a: string
  competitions: PCompetition[]
}

const cmp = (a: string | number | null | undefined, b: string | number | null | undefined) => {
  // nulls last
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Même contenu que `fn_partage_lecture`, calculé localement (IndexedDB) pour un athlète. */
export async function portraitLocal(athleteId: string): Promise<Portrait | null> {
  const athlete = await db.athlete.get(athleteId)
  if (!athlete || athlete.deleted_at) return null

  // Saison courante (ou la plus récente) pour catégorie / club
  const today = todayIsoDate()
  const saisons = alive(await db.saison.toArray())
  const liens = alive(await db.athlete_saison.where('athlete_id').equals(athleteId).toArray())
    .map((l) => ({ l, s: saisons.find((s) => s.id === l.saison_id) }))
    .filter((x): x is { l: (typeof x)['l']; s: NonNullable<(typeof x)['s']> } => !!x.s)
    .sort((a, b) => {
      const ca = a.s.date_debut <= today && today <= a.s.date_fin ? 1 : 0
      const cb = b.s.date_debut <= today && today <= b.s.date_fin ? 1 : 0
      return cb - ca || b.s.date_debut.localeCompare(a.s.date_debut)
    })
  const cour = liens[0]

  const [participations, inscriptions, distances, circuits, pistes] = await Promise.all([
    db.participation.where('athlete_id').equals(athleteId).toArray().then(alive),
    db.inscription_competition.where('athlete_id').equals(athleteId).toArray().then(alive),
    db.distance.toArray(),
    db.circuit.toArray(),
    db.piste.toArray(),
  ])

  // Courses de l'athlète, groupées par compétition
  const parComp = new Map<string, PCourse[]>()
  for (const p of participations) {
    const chrono = await db.chrono.get(p.chrono_id)
    if (!chrono || chrono.deleted_at) continue
    const course = await db.course.get(p.course_id)
    if (!course || course.deleted_at) continue
    const epreuve = await db.epreuve.get(course.epreuve_id)
    if (!epreuve || epreuve.deleted_at) continue
    const distance = distances.find((d) => d.id === course.distance_id)
    const distanceEpreuve = distances.find((d) => d.id === epreuve.distance_id) ?? distance
    if (!distance || !distanceEpreuve) continue
    const tours = alive(await db.tour.where('chrono_id').equals(chrono.id).toArray()).sort((a, b) => a.numero_tour - b.numero_tour)
    const ligne: PCourse = {
      epreuve_id: epreuve.id,
      epreuve_ordre: epreuve.ordre,
      epreuve_distance: distanceEpreuve.libelle,
      epreuve_metres: distanceEpreuve.metres,
      course_id: course.id,
      type_manche: course.type_manche,
      lettre_finale: course.lettre_finale,
      ordre_manche: course.ordre_manche,
      course_a: course.debutee_a ?? course.prevue_a,
      nb_patineurs: course.nb_patineurs,
      distance_id: distance.id,
      distance: distance.libelle,
      metres: distance.metres,
      type_piste: distance.type_piste,
      type_course: epreuve.type_course,
      participation_id: p.id,
      statut: p.statut,
      rang_officiel: p.rang_officiel,
      position_arrivee: p.position_arrivee,
      points: p.points,
      url_video: p.url_video ?? course.url_video,
      commentaire: p.commentaire,
      chrono_id: chrono.id,
      temps_retenu_ms: retenu(chrono),
      temps_officiel_ms: chrono.temps_officiel_ms,
      longueur_piste_m: chrono.longueur_piste_m,
      nb_tours_prevus: chrono.nb_tours_prevus,
      chrono_incomplet: chrono.chrono_incomplet,
      tours: tours.length ? tours.map((t) => t.temps_tour_ms) : null,
    }
    const list = parComp.get(epreuve.competition_id) ?? []
    list.push(ligne)
    parComp.set(epreuve.competition_id, list)
  }

  const compIds = new Set<string>([...parComp.keys(), ...inscriptions.map((i) => i.competition_id)])
  const competitions: PCompetition[] = []
  for (const id of compIds) {
    const cp = await db.competition.get(id)
    if (!cp || cp.deleted_at) continue
    const circuit = cp.circuit_id ? circuits.find((c) => c.id === cp.circuit_id) : undefined
    const piste = cp.piste_id ? pistes.find((p) => p.id === cp.piste_id) : undefined
    const saison = cp.saison_id ? saisons.find((s) => s.id === cp.saison_id) : undefined
    const insc = inscriptions.find((i) => i.competition_id === id)
    const courses = (parComp.get(id) ?? []).sort(
      (a, b) => cmp(a.course_a, b.course_a) || cmp(a.epreuve_ordre, b.epreuve_ordre) || a.epreuve_metres - b.epreuve_metres || cmp(a.ordre_manche, b.ordre_manche),
    )
    competitions.push({
      id: cp.id,
      nom: cp.nom,
      date_debut: cp.date_debut,
      date_fin: cp.date_fin,
      niveau: cp.niveau,
      circuit: circuit?.nom ?? null,
      type_piste: circuit?.type_piste ?? null,
      arena: piste?.nom ?? null,
      ville: piste?.ville ?? null,
      saison: saison?.libelle ?? null,
      longueur_piste_m: longueurPiste(cp, circuit),
      rang_final: insc?.rang_final ?? null,
      nb_participants: insc?.nb_participants ?? null,
      points_total: insc?.points_total ?? null,
      dossard: insc?.dossard ?? null,
      courses: courses.length ? courses : null,
    })
  }
  competitions.sort((a, b) => b.date_debut.localeCompare(a.date_debut))

  return {
    athlete: { prenom: athlete.prenom, nom: athlete.nom, categorie: cour?.l.categorie ?? null, club: cour?.l.club ?? null, saison: cour?.s.libelle ?? null },
    libelle: null,
    genere_a: new Date().toISOString(),
    competitions,
  }
}
