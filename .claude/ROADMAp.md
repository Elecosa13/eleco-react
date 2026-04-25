# Roadmap Eleco SA

## Phase 1 — Sécurité (PRIORITÉ ABSOLUE)
- [ ] Activer RLS sur `depannages`, `absences`, `time_entries`
- [ ] Migrer mots de passe vers Supabase Auth (bcrypt)
- [ ] Policies par rôle admin / employé
- [ ] Test: un employé ne peut pas accéder aux données admin

## Phase 2 — Architecture double vue
- [ ] Séparer routes admin / employé
- [ ] Page connexion avec redirection selon rôle
- [ ] Guards de navigation

## Phase 3 — Catalogue de prix
- [ ] Importer Excel existants dans `catalogue`
- [ ] Interface admin pour modifier les prix
- [ ] Lier catalogue aux chantiers/dépannages

## Phase 4 — Agent Email (mode test silencieux)
- [ ] Connexion IMAP Infomaniak (lecture seule)
- [ ] Détection bons de Régie
- [ ] Création auto dossier dans `depannages`
- [ ] Import bon PDF dans `sous_dossiers`
- [ ] Table `agent_logs`

## Phase 5 — Notifications push PWA
- [ ] Remplacement progressif groupe WhatsApp

## Phase 6 — Facturation automatique
- [ ] Générateur facture sur base catalogue
- [ ] Template identique aux Excel existants (Naef, Bersier, Comptoir…)
- [ ] Export PDF + sauvegarde Supabase

## Phase 7 — Dashboard admin
- [ ] Tableaux de bord et stats pour Carlos/David