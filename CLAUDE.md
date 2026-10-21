# Consignes pour ce dépôt

- Lire `docs/ARCHITECTURE.md` avant toute modification : c'est l'état de référence de l'application (infrastructure, structure du code, modèle de données, règles métier, synchronisation, écrans, conventions, historique).
- **À chaque modification livrée**, mettre à jour `docs/ARCHITECTURE.md` dans le même commit : section concernée, date de « Dernière mise à jour », ligne dans l'historique des changements, migrations appliquées si la base a changé.
- Base de données : Supabase, projet `ph2-datalake`, schéma `patinage`. Toute migration est appliquée sur Supabase (nom `patinage_*`) puis copiée dans `supabase/migrations/`.
- Langue : français (interface, commentaires, commits).
- Avant de pousser : `npm run typecheck`, `npm run build`. Un push sur `main` déploie automatiquement sur GitHub Pages.
