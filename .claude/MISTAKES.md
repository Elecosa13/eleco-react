# Bugs connus — à ne pas reproduire

## FK polymorphique rapport_materiaux
- Problème: PostgREST erreur dans chargerTout() sur admin dashboard
- Cause: clé étrangère polymorphique sur rapport_materiaux
- Fix: requête séparée, pas de join direct

## usePageRefresh — Dépannage catalogue
- Problème: catalogue ne se charge pas
- Cause: usePageRefresh déclenchait chargerCredit() au lieu de charger()
- Fix: appeler charger() complet au moment où auth devient disponible

## Variables d'environnement
- Ne jamais hardcoder les credentials Supabase
- Toujours utiliser .env.local en dev, Cloudflare env vars en prod