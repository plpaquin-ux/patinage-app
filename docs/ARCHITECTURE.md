# Patinage – Suivi de performance : état de l'application

> Document de référence, **à mettre à jour à chaque modification** (voir `CLAUDE.md`).
> Dernière mise à jour : 2026-10-25 (page de manche fusionnée, redirection des liens profonds). Version déployée : https://plpaquin-ux.github.io/patinage-app/

## 1. Objectif

PWA mobile (hors ligne) pour chronométrer et suivre les performances d'un ou plusieurs athlètes en patinage de vitesse (courte piste et longue piste) : chrono par tour en aréna, résultats par compétition / épreuve / manche, saisie de résultats passés, entraînements, historique et évolution des temps. Base transactionnelle Postgres (Supabase) pensée pour l'analyse.

## 2. Infrastructure

| Élément | Détail |
|---|---|
| Base de données | Supabase, projet **ph2-datalake** (`lzogxnoagzrcabariqix`, ca-central-1, plan Pro), schéma dédié **`patinage`** (isolé des schémas d'affaires `core`, `raw`, `sync`) |
| API | PostgREST ; schéma exposé via `alter role authenticator set pgrst.db_schemas = 'public, graphql_public, patinage'` (le champ « Exposed schemas » du tableau de bord n'est plus maître ; `alter role authenticator reset pgrst.db_schemas` pour lui redonner la main) |
| Auth | Supabase Auth, courriel + mot de passe, session persistante (`localStorage`), fonctionne hors ligne une fois connecté |
| Front | Vite 8 + React 19 + TypeScript, `vite-plugin-pwa` (service worker, manifeste, installable), Dexie 4 (IndexedDB), `@supabase/supabase-js`, `react-router-dom` (HashRouter, compatible GitHub Pages) |
| Dépôt | https://github.com/plpaquin-ux/patinage-app (public ; l'app GitHub « Claude » y est installée) |
| Hébergement | GitHub Pages, source « GitHub Actions », workflow `.github/workflows/deploy.yml` : chaque push sur `main` construit et publie. URL et clé *publishable* Supabase en valeurs par défaut dans le workflow (clé publique par conception ; la sécurité repose sur le RLS) |
| Base path | `/patinage-app/` (variable `VITE_BASE`) |

## 3. Structure du code

```
src/
  main.tsx                 Point d'entrée, enregistrement du service worker
  App.tsx                  Routes + « Gate » (chargement → connexion → onboarding → app)
  index.css                Design system (tokens, sombre/clair, boutons chrono, listes, formulaires)
  auth/AuthContext.tsx     Session Supabase, comptes de l'usager, création/sélection de compte
  components/Layout.tsx    Page (barre du haut + pastille sync + nav du bas), Field, Empty, SyncPill
  components/TimeInput.tsx Saisie de temps en texte libre (« 45.123 », « 1:23.45 ») → ms
  components/Chart.tsx     Graphique SVG d'évolution (partagé par Historique et la page publique)
  components/VideoModal.tsx Lecteur vidéo en modale (YouTube intégré, lien externe sinon) + icône ▶
  components/TableauDeBord.tsx Vue « tableau de bord » d'un athlète (onglets Portrait / Compétitions, vidéos) — partagée par /tableau et /partage
  components/ChronoFiche.tsx Fiche complète d'un chrono (en-tête, résultat, tours, détail du temps, ressenti/vidéo/commentaire) — intégrée à la page de manche et à /chrono/:id ; exporte Pliable, NumInput, Ressenti
  lib/types.ts             Types miroir des tables, enums, libellés FR, SYNC_TABLES, SERVER_ONLY_COLUMNS
  lib/supabase.ts          Client Supabase (schema: 'patinage')
  lib/db.ts                Schéma Dexie (v2), tables + outbox + meta
  lib/sync.ts              Push de l'outbox, pull incrémental, planification, état de sync
  lib/repo.ts              create / update / softDelete (local + mise en file), compte courant, uuid
  lib/hooks.ts             Requêtes réactives (useLiveQuery) par table, athlète par défaut
  lib/time.ts              fmtMs, parseTime, dates locales, retenu(), longueurPiste(), nbToursAttendus()
  lib/video.ts             Reconnaissance des liens YouTube (watch, youtu.be, shorts, t=) → URL d'intégration
  lib/partage.ts           Liens de partage public (table `partage`, en ligne seulement) + urlPartage()
  lib/portrait.ts          Types du « portrait » (JSON de fn_partage_lecture) + portraitLocal() : même structure calculée depuis IndexedDB
  lib/stopwatch.ts         Chrono à horodatages absolus, persistant, Wake Lock, fusion de tours
  pages/
    Login.tsx              Connexion / inscription ; OnboardingPage (choix ou création de compte)
    Home.tsx               Accueil : raccourcis, à venir, derniers chronos, compétitions récentes
    TableauDeBord.tsx      Page /tableau : tableau de bord interne (choix de l'athlète, hors ligne, liens vers les fiches chrono)
    Chrono.tsx             Préparation (athlète, contexte, distance, longueur du tour) + chrono en direct
    ChronoEdit.tsx         Page /chrono/:id : fiche d'un chrono d'entraînement ; un chrono de compétition y est redirigé vers /courses/:id (state `retour`)
    Competitions.tsx       Liste, formulaire, détail (épreuves, résultat global, groupes), EpreuveForm
    Epreuve.tsx            EpreuvePage (manches) et CoursePage (page unique de la manche : fiche par athlète + détails de la manche repliés)
    Saisie.tsx             Saisie rapide d'un résultat passé (sans chrono)
    Entrainement.tsx       Séances d'entraînement et leurs chronos
    Historique.tsx         Records, graphique d'évolution, tableau, filtres (piste, distance, longueur)
    Plus.tsx               Menu, compte, Athlètes (+ liens de partage), Pistes, Circuits, Distances (programme), Saisons
    Partage.tsx            Page publique /partage/:jeton (sans connexion) : charge le portrait via RPC et rend TableauDeBord
supabase/migrations/       Copies des migrations appliquées (la source de vérité est Supabase)
.github/workflows/         Déploiement GitHub Pages
```

### Routes (HashRouter)
`/` accueil · `/tableau` tableau de bord · `/chrono` · `/chrono/:id` révision · `/competitions` · `/competitions/nouvelle` · `/competitions/:id` · `/competitions/:id/modifier` · `/epreuves/:id` · `/courses/:id` · `/saisie?athlete=&competition=` · `/entrainement` · `/entrainement/:id` · `/historique` · `/plus` · `/plus/{athletes|pistes|circuits|distances|saisons}`

**Route publique** (hors « Gate », sans connexion) : `/partage/:jeton` → `PartagePage`. `App.tsx` route vers elle avant la vérification de session.

## 4. Modèle de données (schéma `patinage`)

```
compte ─┬─ compte_membre (user_id, role: proprietaire | editeur | lecteur)
        ├─ athlete ─── athlete_saison (catégorie, club, entraîneur par saison)
        │             └─ equipement
        ├─ saison
        ├─ circuit (type_piste, longueur_piste_m) ─── circuit_distance ─── distance (metres, type_course, nb_tours_defaut)
        ├─ bareme_points ─── bareme_points_ligne
        ├─ piste (aréna : ville, type_piste, intérieur)
        ├─ competition (saison, circuit, piste, dates, longueur_piste_m surcharge)
        │    ├─ groupe
        │    ├─ inscription_competition (athlète : dossard, rang_final, nb_participants, points_total)
        │    └─ epreuve (distance, type_course, groupe)
        │         └─ course (type_manche, lettre_finale, ordre, heure, nb_patineurs, conditions)
        │              └─ participation (athlète, chrono, statut, rangs, points, couloir…)
        ├─ partage (athlète, jeton secret, libellé, actif, nb_acces, dernier_acces_a) — lien public
        ├─ seance_entrainement (athlète, piste, date, type, objectif, ressenti)
        └─ chrono (athlète, contexte, séance|participation, distance, source, longueur_piste_m, temps…)
             └─ tour (numero, temps_tour_ms éditable, *_capture_* figés, position_peloton)
```

### Règles métier
- **Temps en millisecondes entières.** `temps_retenu_ms = coalesce(officiel, ajusté, calculé)` (colonne générée) ; `ecart_officiel_ms` idem.
- **Tours** : `temps_tour_capture_ms`, `cumul_capture_ms`, `capture_a` sont figés par trigger à l'insertion ; `temps_tour_ms` est éditable. `chrono.temps_calcule_ms` et `nb_tours_enregistres` recalculés par trigger.
- **Manches libres** : une épreuve a 0..n courses typées (`serie_unique`, `qualification`, `repechage`, `quart_de_finale`, `demi_finale`, `finale` + lettre) sans séquence imposée.
- **Statuts de résultat** : `termine`, `penalite`, `disqualifie`, `avance` (ADV), `chute`, `abandon`, `absent`, `non_classe`. Les records n'incluent que `termine` et `avance`.
- **Longueur du tour** : compétition > circuit (InterRégional 100 m, Provincial CP 111,12 m, LP 400 m). Copiée dans `chrono.longueur_piste_m` à la capture → l'historique ne bouge pas si les référentiels changent. Tours attendus = ⌈distance ÷ longueur⌉ (1000 m : 10 à 100 m, 9 à 111,12 m). Records distingués par longueur.
- **Programme par circuit** (`circuit_distance`) : le formulaire d'épreuve et la saisie rapide ne proposent que les distances du circuit ; repli sur le type de piste.
- **Résultat global** (`inscription_competition`) : classement final + nombre de patineurs dans la catégorie (« 3ᵉ / 24 ») + points cumulés.
- **Suppression logique** (`deleted_at`) partout ; UUID générés côté client ; `updated_at` par trigger.
- **RLS** sur toutes les tables par `compte_id` (`fn_mes_comptes`, `fn_mes_comptes_ecriture`) ; `compte` / `compte_membre` : propriétaire seulement pour gérer (`fn_mes_comptes_proprietaire`). **Règle : une politique ne lit jamais sa propre table directement** (récursion infinie → erreur 500) ; toujours passer par une fonction `security definer`.
- **Filet de sécurité `compte_id`** : trigger `trg_corriger_compte` (`fn_corriger_compte`, BEFORE INSERT/UPDATE, toutes les tables à `compte_id` sauf `compte_membre`) : si la ligne arrive avec un `compte_id` null ou qui n'appartient pas à l'usager (compte supprimé, cache périmé), il est remplacé par le compte valide le plus récent de l'usager au lieu de refuser l'écriture. Toute nouvelle table doit recevoir ce trigger (le `do` de la migration 8 est idempotent et peut être rejoué).
- **Partage public** : un lien `#/partage/<jeton>` donne accès en lecture seule au portrait d'un athlète. Seule `fn_partage_lecture(jeton)` est appelable sans session ; elle retourne un JSON unique (athlète + catégorie/club de la saison courante, compétitions ordonnées par date décroissante avec résultat global et courses, temps des tours, vidéo = `participation.url_video` sinon `course.url_video`) et incrémente `nb_acces`. Jeton inconnu ou lien désactivé → `null`. La table `partage` n'est pas synchronisée hors ligne (gestion en ligne via `lib/partage.ts`) ; `anon` ne peut pas la lire. Un lien se désactive (réversible) ou se supprime (`deleted_at`).
- **Fonctions** : `fn_creer_compte(nom)` (RPC, compte + membre + amorçage), `fn_amorcer_compte`, `fn_amorcer_programme`, `fn_points_bareme`, `fn_chrono_recalc`.
- **Vues d'analyse** (security_invoker) : `v_participation_detail` (ligne plate par course avec contexte, longueur, tours théoriques, résultat global), `v_tour_detail`, `v_meilleur_temps`, `v_meilleur_temps_saison`, `v_entrainement_detail`.

### Migrations appliquées (Supabase, dans l'ordre)
1. `patinage_init` – schéma complet, RLS, vues, amorçage
2. `patinage_fn_creer_compte` – création atomique d'un compte (contourne le RLS au RETURNING)
3. `patinage_longueur_piste` – `longueur_piste_m` sur circuit / compétition / chrono, vues par longueur
4. `patinage_longueur_sans_piste` – la piste ne participe plus au calcul de la longueur
5. `patinage_circuit_distance` – programme par circuit + `fn_amorcer_programme`
6. `patinage_nb_participants` – `inscription_competition.nb_participants`, vue enrichie du résultat global
7. `patinage_partage_public` – table `partage` (jeton base64url de 24 caractères généré par `fn_partage_jeton`), fonction `fn_partage_lecture(jeton)` (security definer, exécutable par `anon`)
8. `patinage_corriger_compte_orphelin` – `fn_corriger_compte` + trigger `trg_corriger_compte` sur toutes les tables (filet de sécurité `compte_id`)
9. `patinage_compte_membre_sans_recursion` – `fn_mes_comptes_proprietaire`, politique `compte_membre_manage` réécrite sans récursion
10. `patinage_fusion_comptes_famille` – migration de données (une fois) : fusion des deux comptes « Famille », dédoublonnage des référentiels, repointage des clés étrangères

## 5. Synchronisation hors ligne

- Toute écriture passe par `repo.create/update/softDelete` : ligne écrite dans IndexedDB **puis** mise en file (`outbox`, une entrée par ligne, la dernière version gagne).
- `sync.ts` : **push** (upsert par ligne, dans l'ordre, arrêt à la première erreur réseau ; une erreur de données persistante — RLS, contrainte — est **sautée après 5 tentatives mais jamais supprimée** de la file : la sync continue, l'erreur reste visible dans la pastille) puis **pull** incrémental par table (`updated_at > dernier pull`, pages de 1000, les lignes avec une entrée en attente ne sont pas écrasées).
- **Principe : la base locale n'est jamais effacée tant que la file (`outbox`) n'est pas vide.** La bascule automatique de compte (compte mémorisé devenu invalide) réassigne le compte sans vider la base ; « Changer de compte » force une sync et refuse s'il reste des éléments en attente ; « Se déconnecter » affiche le nombre réel d'éléments non synchronisés avant de confirmer.
- `reenvoyerTout()` (Plus › Compte › « Renvoyer les données locales ») : remet toutes les lignes locales dans la file (upsert idempotent côté serveur) — à utiliser si des données n'ont jamais atteint le serveur.
- Colonnes jamais envoyées (`SERVER_ONLY_COLUMNS`) : `temps_retenu_ms`, `ecart_officiel_ms`, `nb_tours_enregistres`, `temps_calcule_ms`.
- Déclencheurs : démarrage, retour en ligne, retour au premier plan, toutes les 2 min, 0,8 s après chaque écriture. Pastille d'état dans la barre du haut (Synchronisé / N en attente / Hors ligne / Erreur).
- `localStorage` : compte courant, cache des comptes, athlète par défaut, dernière longueur de tour, état du chrono en cours.
- L'app installée (écran d'accueil iOS) a un stockage distinct de Safari : au premier lancement, la liste des comptes est chargée **avant** d'afficher l'écran de bienvenue, et le compte existant est sélectionné automatiquement.

## 6. Chrono (usage en aréna)

- Horodatages absolus (`Date.now()`) : exact même écran verrouillé ou onglet suspendu ; état dans `localStorage` (survit à un rechargement) ; Wake Lock ; vibration.
- Préparation : athlète, contexte (entraînement → séance ; compétition → compétition / épreuve / manche), longueur du tour (déduite du circuit, saisie libre en entraînement), tours attendus (calculés, modifiables).
- Écran de course : compteur, tour en cours, tours n / attendus, meilleur tour ; boutons DÉPART / **TOUR** / **ARRIVÉE** fixes sous le compteur, liste des tours défilante (dernier en haut) ; « Annuler le dernier tour ».
- Arrivée : « Enregistrer et réviser », « Recommencer », « Abandonner » ; **fusion de deux tours** (appui de trop) avant enregistrement.
- Enregistrement : chrono + tours (captés figés) + participation si compétition ; `debutee_a` de la course renseignée au premier chrono. En compétition, on retombe directement sur la **page de la manche** (`/courses/:id`) ; en entraînement, sur `/chrono/:id`. Un chrono de compétition n'a qu'un seul écran : `/chrono/:id` redirige vers sa manche (liens de l'accueil, de l'historique, du tableau de bord, de la saisie rapide) avec `state.retour`, et le bouton retour de la manche ramène alors à la page d'origine (`nav(-1)`) plutôt qu'à l'épreuve.
- **Fiche de chrono** (`ChronoFiche`, sections ordonnées selon l'usage en aréna) : en-tête (athlète, temps retenu, « 4ᵉ / 5 », badges) ; *Résultat* (rang officiel, patineurs au départ — champ de la manche —, statut, points, temps officiel + écart) ; *Tours* éditables (capté affiché à côté, ajout/suppression/fusion tracés) ; *Détail du temps* repliable (calculé, ajusté, tours attendus, longueur, incomplet, note — ouvert en entraînement) ; *Ressenti, vidéo et commentaire* ; *Autres détails du résultat* repliable (position à l'arrivée, position de départ, couloir LP, sprint mass start, relais, qualifiée). Date de la course et date de saisie affichées séparément.

## 7. Autres écrans

- **Compétitions** : liste filtrable CP/LP avec résultat global ; formulaire (circuit, aréna, saison déduite, longueur surchargeable, inscriptions) ; détail : épreuves (manches créées au choix : qualif + finale / finale directe / série unique), résultat global par athlète, groupes, « Saisir un résultat ».
- **Épreuve** : liste des manches avec les temps et rangs par athlète ; « + Manche ».
- **Manche** (`/courses/:id`, page unique) : en-tête de compétition ; la **fiche complète de chaque athlète** (voir § 6) directement dans la page ; « Chrono » ou « Saisir un temps » par athlète inscrit sans résultat (la saisie manuelle crée la fiche sur place) ; **Détails de la manche** repliés par défaut (numéro officiel, heure prévue, heure réelle — renseignée par le premier chrono —, règle de qualification, conditions LP, glace, commentaire ; résumé affiché sur l'en-tête fermé). La vidéo n'a plus qu'un seul champ à l'écran (`participation.url_video`) ; `course.url_video` reste en base comme repli du portrait mais n'est plus saisi. Les tables `course` et `participation` restent distinctes : c'est l'écran qui fusionne, pas le modèle.
- **Saisie rapide** (`/saisie`) : compétition existante ou nouvelle, distance (programme du circuit), manche, temps officiel, rang, statut, points, patineurs au départ, commentaire, classement final / nb dans la catégorie ; « Enregistrer et saisir le suivant » ; refus des doublons.
- **Entraînement** : séances (date, piste, type, objectif, ressenti) et chronos libres.
- **Historique** : par athlète, type de piste, distance ; record et dernier temps ; filtre par longueur de tour (avertissement si mélange) ; option entraînements ; graphique SVG (une série, infobulle au toucher) ; tableau.
- **Plus** : compte (changer, recharger les données, renvoyer les données locales, déconnexion), Athlètes (+ bloc « Partage avec la famille » : créer / partager (Web Share) / copier / désactiver / supprimer un lien, nombre d'ouvertures), Arénas et pistes, Circuits (longueur du tour), Distances (libellé, tours par défaut, circuits où elle se court), Saisons — tous modifiables.
- **Tableau de bord** (`/tableau`, 2ᵉ onglet de la barre du bas, icône grille) : même vue que la page publique, calculée hors ligne par `portraitLocal()` (réactive via `useLiveQuery`), sélecteur d'athlète (mémorisé comme athlète par défaut), liens vers la fiche chrono (date dans le tableau d'évolution, bouton dans le détail d'une course). **La structure du portrait existe en deux exemplaires (SQL `fn_partage_lecture` et `portraitLocal`) : toute évolution se fait des deux côtés.**
- **Page publique** (`/partage/:jeton`) : sans connexion ni barre de navigation ; recharge au retour au premier plan (suivi en direct pendant une compétition) et bouton ↻. Onglet *Portrait* : compteurs (compétitions, courses, meilleur classement final en compétition « 7ᵉ / 20 », vidéos), CP/LP, cartes « Meilleurs temps » par distance (distinguées par longueur de tour si plusieurs ; dernier temps et écart), touche → graphique d'évolution + tableau. Onglet *Compétitions* : cartes repliables (la plus récente ouverte ; badges « En cours » / « À venir »), résultat global, courses regroupées par épreuve (manche, rang / nb, temps, statut, ▶ vidéo), touche une course → temps des tours, commentaire, points. Médailles 🥇🥈🥉 seulement sur le classement final et les finales A (un top 3 en finale D n'est pas un podium). Vidéos : modale avec lecteur YouTube intégré (`youtube-nocookie`, autoplay, `t=` respecté) sans quitter la page ; lien non YouTube → bouton d'ouverture. Champ « Vidéo (lien YouTube) » dans la révision de chrono, la fiche de manche et la saisie rapide.

## 8. Conventions

- Français partout (UI, commentaires, commits) ; dates affichées en `fr-CA`, dates seules parsées en heure locale (`parseDateLocale`) pour éviter le décalage UTC.
- Toute nouvelle table : UUID, `compte_id`, `created_at/updated_at/deleted_at`, trigger `updated_at`, RLS via `fn_enable_rls_compte`, grants ; ajouter à `SYNC_TABLES`, `TableMap`, Dexie (nouvelle version de schéma), hooks.
- Migrations : appliquées sur Supabase (nommées `patinage_*`), copie dans `supabase/migrations/`.
- Vérification avant déploiement : `npm run typecheck`, `npm run build`, test de fumée Playwright (Supabase simulé : session préchargée dans `localStorage` sous `sb-<ref>-auth-token`, `patinage.compte_id`, `patinage.comptes` ; routes `/auth/v1/*` et `/rest/v1/<table>` interceptées) sur viewport mobile et bureau.

## 9. Historique des changements

| Date | Changement |
|---|---|
| 2026-10-20 | Modèle de données et migration initiale ; PWA (chrono, compétitions, sync hors ligne, historique) ; déploiement GitHub Pages |
| 2026-10-20 | `fn_creer_compte` (erreur RLS à la création de compte) |
| 2026-10-20 | Longueur du tour par circuit / compétition, figée sur chaque chrono ; tours calculés |
| 2026-10-20 | Chrono : boutons fixes au-dessus des tours ; fusion de deux tours |
| 2026-10-21 | Référentiels modifiables ; longueur retirée des arénas |
| 2026-10-21 | Programme par circuit (`circuit_distance`) ; correctif onboarding (3 comptes « Famille » créés par erreur, 2 vides supprimés) |
| 2026-10-21 | Saisie rapide de résultats passés |
| 2026-10-21 | Dates seules en heure locale ; fiche chrono : date de course vs date de saisie |
| 2026-10-21 | Nombre de patineurs dans la catégorie (résultat global) |
| 2026-10-21 | Tableau de bord interne (`/tableau`, onglet « Tableau » après Accueil) réutilisant la vue partagée ; correctif d'alignement des en-têtes de compétition (`.grow` générique, `.comp-head` aligné à gauche) |
| 2026-10-21 | Page publique : « Podiums » remplacé par « Meilleur classement » (rang final), médailles limitées aux finales A |
| 2026-10-21 | Page publique de partage (`/partage/:jeton`) : portrait, records, évolution, courses par compétition, lecteur YouTube en modale ; liens gérés dans Plus › Athlètes ; champ vidéo dans la saisie rapide |
| 2026-10-24 | **Incident en compétition** : `compte_id` périmé en `localStorage` → toutes les écritures refusées par le RLS, file de sync purgée après 5 tentatives (données intactes sur le téléphone seulement). Correctifs : trigger `fn_corriger_compte` (migration 8) ; la file ne jette plus rien ; bouton « Renvoyer les données locales » |
| 2026-10-25 | `/chrono/:id` redirige un chrono de compétition vers sa page de manche (retour vers la page d'origine) ; la fiche seule ne sert plus qu'aux entraînements |
| 2026-10-25 | **Page de manche fusionnée** : la fiche de chrono (`ChronoFiche`) s'intègre à `/courses/:id` (une par athlète), le chrono y retombe directement, détails de la manche repliés (`Pliable`), champ vidéo unique, patineurs au départ à côté du rang. Point de retour : commit `6b59303` |
| 2026-10-25 | Cause racine : politique `compte_membre_manage` récursive (erreur 500 depuis le 23) réécrite (migration 9). Fusion des deux comptes « Famille » et dédoublonnage des référentiels (migration 10). App : la base locale n'est jamais effacée s'il reste des éléments en attente (bascule de compte, changement de compte, déconnexion) |

## 10. Pistes d'évolution

- Calcul automatique des points via `bareme_points` (tables prêtes, pas d'écran).
- Import des résultats officiels PVQ (`url_resultats`, `numero_course` prévus).
- Partage en lecture **authentifié** (rôle `lecteur` dans le modèle) ; invitation d'un membre. (Le partage public par lien existe.)
- Page publique : entraînements, comparaison d'une saison à l'autre, expiration des liens.
- Équipement (lames, affûtage) : table prête, pas d'écran.
- Position dans le peloton par tour (`tour.position_peloton`) : champ prêt, pas de saisie.
- Export CSV / tableau de bord d'analyse (vues SQL prêtes).
