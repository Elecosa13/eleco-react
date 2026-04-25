# Eleco SA — Contexte projet

## Stack
- Frontend: React + Vite (PWA)
- DB: Supabase (PostgreSQL) — projet `snbnjkmxtuuhsjaortxa.supabase.co`
- Déploiement: Cloudflare Pages — `eleco-react.pages.dev`
- Repo: GitHub `Elecosa13/eleco-react`
- Email: Infomaniak IMAP port 993 SSL
- Agent IA: Claude API (Anthropic)

## Utilisateurs
- Admin: lucas, david, carlos
- Employés: paulo, bruno, ivo, noylan

## Tables Supabase
- RLS activé: `utilisateurs`, `chantiers`, `factures`, `catalogue`, `rapport_materiaux`, `rapports`, `sous_dossiers`
- UNRESTRICTED (à corriger): `depannages`, `absences`, `time_entries`
- Mots de passe en clair — migration Supabase Auth en attente

## Architecture
Deux vues sur la même URL, séparées par rôle:
- App employé: rapport de fin de journée (chantier, heures, travail effectué, matériaux)
- App admin: gestion chantiers, bons de Régie, factures, agents IA
- Séparation hermétique via RLS Supabase

## Règles absolues
- Jamais supprimer de fichiers
- Jamais commit/push automatiquement
- Jamais modifier la DB production sans backup
- Jamais installer un package sans l'annoncer
- Fichiers complets uniquement, jamais de patches partiels
- Explications courtes après chaque modification

## Workflow
Travaille uniquement sur les fichiers mentionnés. Une tâche à la fois. Confirme avant de passer à la suivante.

## Docs supplémentaires (charger si besoin)
- `.claude/ROADMAP.md` — phases et priorités
- `.claude/MISTAKES.md` — bugs déjà corrigés à ne pas reproduire
- `.claude/ARCHITECTURE.md` — détails techniques complets