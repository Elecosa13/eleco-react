# ROADMAP — Eleco SA
> Dernière mise à jour : 14 avril 2026

---

## Phase 1 — Infrastructure & Sécurité ✅ Complétée

- [x] Stack React + Vite + Supabase PostgreSQL
- [x] Authentification Supabase Auth (suppression mots de passe en clair)
- [x] RLS activé sur toutes les tables (depannages, absences, time_entries corrigés)
- [x] Double app employé / admin avec isolation stricte des rôles
- [x] Charte numérique employé avec signature électronique + PDF
- [x] Déploiement Cloudflare Pages (suppression plugin CF, env vars configurées)

---

## Phase 2 — Saisie terrain employé ✅ Complétée

- [x] Module Chantier (liste active, sous-dossiers, navigation)
- [x] Module Rapport (durée par boutons, matériaux catalogue, remarques)
- [x] Module Dépannage (adresse, durée, matériaux catalogue, remarques)
- [x] Catalogue articles avec système de favoris (localStorage)
- [x] Crédit heures journalier avec barre de progression colorée

---

## Phase 3 — Interface employé (améliorations) ✅ 14 avril 2026

- [x] Suppression module "Mes heures" séparé — heures saisies uniquement depuis Chantier ou Dépannage (2026-04-14) ✅
- [x] Simplification saisie : suppression champs heure_debut / heure_fin / pause côté employé (2026-04-14) ✅
- [x] Bouton "+" dans la barre crédit pour les heures supplémentaires (2026-04-14) ✅
  - Champs : nombre d'heures, justification obligatoire, chantier ou dépannage optionnel
- [ ] Saisie des absences / vacances par l'employé lui-même

---

## Phase 4 — Administration ✅ 14 avril 2026

- [x] Refonte menu admin : 4 entrées — Chantiers, Dépannages, Calendrier, Employés (2026-04-14) ✅
- [x] Fiche employé complète : heures, feuilles hebdomadaires, charte, signature, absences (2026-04-14) ✅
- [x] Correction PDF hebdomadaires : "Semaine du X au Y", détail par jour, chantiers et dépannages avec adresse/bon, aucun horaire précis ni pause affiché, samedi/dimanche discrets si vides (2026-04-14) ✅
- [x] Correction charte numérique : PDF accessible depuis l'admin quand statut "signé", actions admin (réinitialiser charte, réinitialiser signature, remettre à "non signé") (2026-04-14) ✅
- [x] Modification des rapports après validation : édition date/remarques, ajout/suppression matériel, article manuel hors catalogue (2026-04-14) ✅
- [ ] Génération de factures (bons de dépannage → PDF facture)
- [ ] Export comptabilité (CSV / Excel)
- [ ] Validation des rapports en lot

---

## Phase 5 — Fonctionnalités avancées

- [ ] Notifications push (planning, nouveaux rapports à valider)
- [ ] Mode hors-ligne (PWA avec cache Supabase)
- [ ] Agent IA (Claude API Anthropic) pour analyse des heures et suggestions
- [ ] Intégration email Infomaniak (IMAP port 993 SSL) — envoi automatique PDF
- [ ] Application mobile native (React Native ou PWA installable)
- [ ] Tableau de bord financier (chiffre d'affaires par chantier, marges)

---

## Notes techniques

| Sujet | Statut |
|---|---|
| Colonne `mot_de_passe` dans `utilisateurs` | À supprimer (obsolète depuis migration Supabase Auth) |
| `time_entries.semaine` / `annee` | Non remplis pour type='chantier' et 'depannage' — filtrer par date_travail |
| `rapports.heure_debut` / `heure_fin` | Hardcodés '07:30'/'17:00' — utiliser time_entries.duree pour les calculs |
| Table `absences` | Schéma à définir (date_debut, date_fin, type, commentaire) |
