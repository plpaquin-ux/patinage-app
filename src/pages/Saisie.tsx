import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Field, Page } from '../components/Layout'
import { TimeInput } from '../components/TimeInput'
import { db } from '../lib/db'
import { alive, create, update } from '../lib/repo'
import {
  getDefaultAthleteId,
  setDefaultAthleteId,
  useAthletes,
  useCircuitDistances,
  useCircuits,
  useCompetitions,
  useDistances,
  usePistes,
  useSaisons,
} from '../lib/hooks'
import { fmtLongueur, fmtMs, longueurPiste, nbToursAttendus, todayIsoDate } from '../lib/time'
import { LIBELLES, mancheLabel, type StatutResultat, type TypeManche, type TypePiste } from '../lib/types'
import { NumInput } from '../components/ChronoFiche'

/**
 * Saisie rapide d'un résultat passé (sans chrono) : crée au besoin la compétition,
 * l'épreuve et la manche, puis un chrono « saisie manuelle » avec le temps final et le résultat.
 */
export default function SaisiePage() {
  const [params] = useSearchParams()
  const athletes = useAthletes()
  const competitions = useCompetitions()
  const circuits = useCircuits()
  const pistes = usePistes()
  const saisons = useSaisons()
  const distances = useDistances()
  const liens = useCircuitDistances()

  const [athleteId, setAthleteId] = useState(params.get('athlete') ?? getDefaultAthleteId() ?? '')
  const [competitionId, setCompetitionId] = useState(params.get('competition') ?? '')
  // Nouvelle compétition
  const [nc, setNc] = useState({ nom: '', date: todayIsoDate(), circuit_id: '', piste_id: '', type_piste: 'courte_piste' as TypePiste })
  // Résultat
  const [distanceId, setDistanceId] = useState('')
  const [typeManche, setTypeManche] = useState<TypeManche>('finale')
  const [lettre, setLettre] = useState('A')
  const [temps, setTemps] = useState<number | null>(null)
  const [rang, setRang] = useState<number | null>(null)
  const [statut, setStatut] = useState<StatutResultat>('termine')
  const [points, setPoints] = useState<number | null>(null)
  const [nbPatineurs, setNbPatineurs] = useState<number | null>(null)
  const [commentaire, setCommentaire] = useState('')
  const [urlVideo, setUrlVideo] = useState('')
  const [rangFinal, setRangFinal] = useState<number | null>(null)
  const [nbParticipants, setNbParticipants] = useState<number | null>(null)
  const [journal, setJournal] = useState<{ id: string; texte: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!athleteId && athletes?.[0]) setAthleteId(athletes[0].id)
  }, [athletes, athleteId])

  const competition = competitions?.find((c) => c.id === competitionId)
  const nouvelle = competitionId === 'nouvelle'
  const circuitId = nouvelle ? nc.circuit_id : (competition?.circuit_id ?? '')
  const circuit = circuits?.find((c) => c.id === circuitId)
  const piste = pistes?.find((p) => p.id === (nouvelle ? nc.piste_id : competition?.piste_id))
  const longueur = longueurPiste(nouvelle ? null : competition, circuit)
  const typePiste: TypePiste | null = circuit?.type_piste ?? piste?.type_piste ?? (nouvelle ? nc.type_piste : null)

  // Distances proposées : programme du circuit, sinon type de piste, sinon toutes
  const distancesProposees = useMemo(() => {
    if (!distances) return []
    const ids = new Set((liens ?? []).filter((l) => l.circuit_id === circuitId).map((l) => l.distance_id))
    if (circuitId && ids.size > 0) return distances.filter((d) => ids.has(d.id))
    return typePiste ? distances.filter((d) => d.type_piste === typePiste) : distances
  }, [distances, liens, circuitId, typePiste])
  useEffect(() => {
    if (!distancesProposees.some((d) => d.id === distanceId)) setDistanceId(distancesProposees[0]?.id ?? '')
  }, [distancesProposees, distanceId])
  const distance = distances?.find((d) => d.id === distanceId)
  const nbTours = nbToursAttendus(distance?.metres, longueur, distance?.nb_tours_defaut)

  const pret = !!athleteId && !!distanceId && (nouvelle ? !!nc.nom.trim() && !!nc.date : !!competitionId) && (temps != null || statut !== 'termine')

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!pret || !distance) return
    setBusy(true)
    setErreur(null)
    try {
      setDefaultAthleteId(athleteId)
      // 1. Compétition
      let compId = competitionId
      if (nouvelle) {
        const saison = saisons?.find((s) => s.date_debut <= nc.date && s.date_fin >= nc.date)
        const c = await create('competition', {
          saison_id: saison?.id ?? null,
          circuit_id: nc.circuit_id || null,
          piste_id: nc.piste_id || null,
          nom: nc.nom.trim(),
          date_debut: nc.date,
          date_fin: null,
          niveau: null,
          longueur_piste_m: null,
          url_resultats: null,
          commentaire: null,
        })
        compId = c.id
        setCompetitionId(c.id)
      }
      // 2. Inscription (résultat global, si absente)
      const inscriptions = alive(await db.inscription_competition.where('competition_id').equals(compId).toArray())
      const ins = inscriptions.find((i) => i.athlete_id === athleteId)
      if (!ins) {
        await create('inscription_competition', { competition_id: compId, athlete_id: athleteId, groupe_id: null, dossard: null, rang_final: rangFinal, nb_participants: nbParticipants, points_total: null, commentaire: null })
      } else if ((rangFinal != null && ins.rang_final == null) || (nbParticipants != null && ins.nb_participants == null)) {
        await update('inscription_competition', ins.id, { rang_final: ins.rang_final ?? rangFinal, nb_participants: ins.nb_participants ?? nbParticipants })
      }
      // 3. Épreuve (réutilisée si la même distance existe déjà dans la compétition)
      const epreuves = alive(await db.epreuve.where('competition_id').equals(compId).toArray())
      let epreuve = epreuves.find((x) => x.distance_id === distance.id)
      if (!epreuve) {
        epreuve = await create('epreuve', {
          competition_id: compId,
          groupe_id: null,
          distance_id: distance.id,
          type_course: distance.type_course,
          nom: null,
          ordre: epreuves.length + 1,
          commentaire: null,
        })
      }
      // 4. Manche (réutilisée si même type + lettre)
      const courses = alive(await db.course.where('epreuve_id').equals(epreuve.id).toArray())
      const lettreFinale = typeManche === 'finale' ? lettre.trim().toUpperCase() || null : null
      let course = courses.find((x) => x.type_manche === typeManche && (x.lettre_finale ?? null) === lettreFinale)
      if (!course) {
        course = await create('course', {
          epreuve_id: epreuve.id,
          type_manche: typeManche,
          lettre_finale: lettreFinale,
          ordre_manche: courses.length + 1,
          numero_course: null,
          prevue_a: null,
          debutee_a: null,
          nb_patineurs: nbPatineurs,
          regle_qualification: null,
          temperature_c: null,
          vent: null,
          etat_glace: null,
          url_video: null,
          commentaire: null,
        })
      } else if (nbPatineurs != null && course.nb_patineurs == null) {
        await update('course', course.id, { nb_patineurs: nbPatineurs })
      }
      // 5. Déjà un résultat pour cet athlète dans cette manche ?
      const parts = alive(await db.participation.where('course_id').equals(course.id).toArray())
      if (parts.some((p) => p.athlete_id === athleteId)) {
        setErreur(`Un résultat existe déjà pour cette manche (${mancheLabel(course)}). Ouvre-le depuis la compétition pour le modifier.`)
        return
      }
      // 6. Chrono (temps final seulement) + participation
      const chrono = await create('chrono', {
        athlete_id: athleteId,
        contexte: 'competition',
        seance_entrainement_id: null,
        distance_id: distance.id,
        equipement_id: null,
        source: 'saisie_manuelle',
        debute_a: null,
        termine_a: null,
        nb_tours_prevus: nbTours,
        longueur_piste_m: longueur,
        nb_tours_enregistres: 0,
        temps_calcule_ms: null,
        temps_ajuste_ms: null,
        temps_officiel_ms: temps,
        chrono_incomplet: false,
        note_ajustement: null,
        commentaire: null,
      })
      await create('participation', {
        course_id: course.id,
        athlete_id: athleteId,
        chrono_id: chrono.id,
        couloir_depart: null,
        type_couloir: null,
        partenaire_paire: null,
        position_arrivee: null,
        rang_officiel: rang,
        statut,
        qualifie_suivant: null,
        points,
        points_sprint: null,
        segments_relais: null,
        coequipiers_relais: null,
        ressenti: null,
        url_video: urlVideo.trim() || null,
        commentaire: commentaire.trim() || null,
      })
      setJournal((j) => [
        { id: chrono.id, texte: `${distance.libelle} · ${mancheLabel(course!)} · ${fmtMs(temps)}${rang ? ` · ${rang}ᵉ` : ''}${statut !== 'termine' ? ` · ${LIBELLES.statut[statut]}` : ''}` },
        ...j,
      ])
      // Prêt pour le suivant : on garde compétition et distance, on vide le résultat
      setTemps(null)
      setRang(null)
      setPoints(null)
      setStatut('termine')
      setCommentaire('')
      setUrlVideo('')
      setNbPatineurs(null)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Résultat passé" back={params.get('athlete') ? '/plus/athletes' : competitionId && !nouvelle ? `/competitions/${competitionId}` : '/competitions'}>
      <p className="muted">Pour entrer des résultats sans le chrono (saison passée, temps officiel seulement). La compétition, l'épreuve et la manche sont créées au besoin ; tu pourras compléter les détails plus tard.</p>
      <form onSubmit={enregistrer}>
        <div className="card">
          <Field label="Athlète">
            <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
              {athletes?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.prenom} {a.nom}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Compétition">
            <select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} required>
              <option value="">— Choisir —</option>
              <option value="nouvelle">+ Nouvelle compétition…</option>
              {competitions?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.date_debut} · {c.nom}
                </option>
              ))}
            </select>
          </Field>
          {nouvelle && (
            <>
              <Field label="Nom de la compétition">
                <input value={nc.nom} onChange={(e) => setNc({ ...nc, nom: e.target.value })} required placeholder="ex. InterRégional #3 – Trois-Rivières" />
              </Field>
              <div className="grid2">
                <Field label="Date">
                  <input type="date" value={nc.date} onChange={(e) => setNc({ ...nc, date: e.target.value })} required />
                </Field>
                <Field label="Circuit">
                  <select value={nc.circuit_id} onChange={(e) => setNc({ ...nc, circuit_id: e.target.value })}>
                    <option value="">—</option>
                    {circuits?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid2">
                <Field label="Aréna">
                  <select value={nc.piste_id} onChange={(e) => setNc({ ...nc, piste_id: e.target.value })}>
                    <option value="">—</option>
                    {pistes?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}
                      </option>
                    ))}
                  </select>
                </Field>
                {!nc.circuit_id && !nc.piste_id && (
                  <Field label="Type de piste">
                    <select value={nc.type_piste} onChange={(e) => setNc({ ...nc, type_piste: e.target.value as TypePiste })}>
                      <option value="courte_piste">Courte piste</option>
                      <option value="longue_piste">Longue piste</option>
                    </select>
                  </Field>
                )}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="grid2">
            <Field label="Distance" hint={nbTours ? `${nbTours} tours de ${fmtLongueur(longueur)}` : longueur ? undefined : 'Longueur du tour inconnue (choisis un circuit)'}>
              <select value={distanceId} onChange={(e) => setDistanceId(e.target.value)} required>
                {distancesProposees.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.libelle}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Manche">
              <select value={typeManche} onChange={(e) => setTypeManche(e.target.value as TypeManche)}>
                {(Object.keys(LIBELLES.type_manche) as TypeManche[]).map((t) => (
                  <option key={t} value={t}>
                    {LIBELLES.type_manche[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {typeManche === 'finale' && (
            <Field label="Finale (A, B, C…)">
              <input value={lettre} onChange={(e) => setLettre(e.target.value)} maxLength={2} />
            </Field>
          )}
          <div className="grid2">
            <Field label="Temps officiel" hint="ex. 48.512 ou 1:42.30">
              <TimeInput value={temps} onChange={setTemps} />
            </Field>
            <Field label="Rang">
              <NumInput key={journal.length + '-rang'} value={rang} onChange={setRang} />
            </Field>
            <Field label="Statut">
              <select value={statut} onChange={(e) => setStatut(e.target.value as StatutResultat)}>
                {(Object.keys(LIBELLES.statut) as StatutResultat[]).map((s) => (
                  <option key={s} value={s}>
                    {LIBELLES.statut[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Points">
              <NumInput key={journal.length + '-pts'} value={points} onChange={setPoints} decimal />
            </Field>
            <Field label="Patineurs au départ">
              <NumInput key={journal.length + '-nb'} value={nbPatineurs} onChange={setNbPatineurs} />
            </Field>
          </div>
          <Field label="Commentaire">
            <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="ex. chute au 3e tour, repêchée" />
          </Field>
          <Field label="Vidéo (lien YouTube)" hint="Visible dans la page partagée avec la famille">
            <input type="url" inputMode="url" value={urlVideo} onChange={(e) => setUrlVideo(e.target.value)} placeholder="https://youtu.be/…" />
          </Field>
          <div className="grid2">
            <Field label="Classement final (compétition)" hint="Facultatif, une seule fois par compétition">
              <NumInput key={competitionId + '-rf'} value={rangFinal} onChange={setRangFinal} />
            </Field>
            <Field label="Patineurs dans la catégorie">
              <NumInput key={competitionId + '-np'} value={nbParticipants} onChange={setNbParticipants} />
            </Field>
          </div>
          {erreur && <div className="error">{erreur}</div>}
          <button className="btn-primary btn-block" disabled={!pret || busy} style={{ minHeight: 56 }}>
            {busy ? '…' : 'Enregistrer et saisir le suivant'}
          </button>
        </div>
      </form>

      {journal.length > 0 && (
        <>
          <h3>Saisis dans cette session</h3>
          <ul className="list">
            {journal.map((j) => (
              <li key={j.id}>
                <Link className="row" to={`/chrono/${j.id}`}>
                  <span className="grow">{j.texte}</span>
                  <span className="chev">›</span>
                </Link>
              </li>
            ))}
          </ul>
          {competitionId && !nouvelle && (
            <Link className="btn btn-block" to={`/competitions/${competitionId}`} style={{ marginTop: 12 }}>
              Voir la compétition (classement final, points)
            </Link>
          )}
        </>
      )}
    </Page>
  )
}
