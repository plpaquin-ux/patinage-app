# Patinage – Suivi de performance

PWA mobile (hors ligne) pour chronométrer et suivre les performances en patinage de vitesse
(courte piste et longue piste) : chrono par tour, compétitions → épreuves → manches, résultats,
entraînements, historique et évolution des temps.

- **Front** : Vite + React 19 + TypeScript, `vite-plugin-pwa` (installable, fonctionne hors ligne)
- **Données locales** : IndexedDB (Dexie) avec file d'envoi (outbox) et synchronisation
- **Serveur** : Supabase (projet `ph2-datalake`, schéma `patinage`), RLS par compte
- **Hébergement** : GitHub Pages (workflow `.github/workflows/deploy.yml`)

## Développement

```bash
cp .env.example .env   # URL + clé publishable Supabase
npm install
npm run dev
```

## Déploiement

Pousser sur `main` déclenche la construction et la publication sur GitHub Pages.
L'URL et la clé publishable Supabase sont dans le workflow (valeurs par défaut) ; elles peuvent être
surchargées par des variables de dépôt `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Modèle de données

Voir `supabase/migrations/0001_init_patinage.sql` : compte → athlète → compétition → épreuve → course
→ participation → chrono → tours ; séance d'entraînement → chrono → tours.
Chaque tour conserve sa valeur captée (immuable) et une valeur éditable ; le chrono garde un temps
calculé, un total ajusté et un temps officiel (`temps_retenu = officiel ?? ajusté ?? calculé`).
