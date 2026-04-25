# Architecture détaillée Eleco SA

## Supabase
- URL: https://snbnjkmxtuuhsjaortxa.supabase.co
- Variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

## Cloudflare Pages
- Projet: eleco-react
- Dashboard: dash.cloudflare.com → Settings → Environment variables
- URL prod: eleco-react.pages.dev
- URL finale (future): app.eleco-sa.ch

## Stockage fichiers (Dropbox)
- Affaires: dossier par N° affaire (ex: 11803) avec Excel devis/facture + PDF QR
- Structure: .Eleco Sa > Eleco SA > Affaires > [plage] > [N° affaire]
- N°Affaires Eleco SA: fichier Excel de suivi global (date, N°, client, type, facture, montant)
- Supabase = données métier uniquement, pas de fichiers

## Système N° Affaire
- Format: 5 chiffres (ex: 11803)
- Type D = Devis, RDS = Bon de Régie
- Statuts: devis en attente / envoyé / validé / facturé / payé / en retard / clôturé / annulé

## Agent Email (phase test)
- IMAP Infomaniak — lecture seule, emails restent non lus
- Polling toutes les X minutes
- Actions loggées dans agent_logs
- Aucune action sans validation manuelle pendant la phase test

## App employé — rapport fin de journée
- Champs: chantier(s) travaillé(s), heures par chantier, description travail, matériaux utilisés
- Pas de pointage en temps réel — saisie en fin de journée ou moment creux