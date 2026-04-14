# ROADMAP — Eleco SA
> Version reconstruite — Avril 2026

---

## Phase 1 — Sécurité (PRIORITÉ ABSOLUE)

- [ ] Vérifier et corriger RLS sur toutes les tables Supabase
- [ ] Supprimer définitivement les mots de passe en clair
- [ ] Utiliser uniquement Supabase Auth
- [ ] Vérifier qu’un employé ne peut jamais accéder aux données admin

---

## Phase 2 — Auth & rôles

- [ ] Redirection automatique selon rôle après login
- [ ] Guards propres sur toutes les routes
- [ ] Blocage total accès admin côté employé

---

## Phase 3 — Déploiement & stabilité

- [ ] Stabiliser Cloudflare Pages
- [ ] Corriger définitivement le routing (SPA)
- [ ] Vérifier les variables d’environnement
- [ ] Tester tous les liens (/login, /admin, /employe)

---

## Phase 4 — PWA (APP TÉLÉPHONE)

- [ ] Rendre l’app installable (manifest + icône)
- [ ] Ajout écran d’accueil Samsung
- [ ] Test réel avec ton père
- [ ] Vérifier comportement mobile

---

## Phase 5 — Interface employé

- [x] Saisie simplifiée (durée uniquement)
- [x] Suppression “Mes heures”
- [x] Bouton heures supplémentaires (+)
- [ ] Module vacances / absences
- [ ] Améliorer UX terrain

---

## Phase 6 — Heures & logique métier

- [ ] Stabiliser time_entries
- [ ] Gérer passage minuit
- [ ] Crédit heures journalier fiable
- [ ] Cohérence chantier / dépannage

---

## Phase 7 — Dépannages & chantiers

- [ ] Navigation propre
- [ ] Accès rapide aux bons
- [ ] Structure claire des données

---

## Phase 8 — Admin (déjà avancé)

- [x] Vue employés
- [x] Calendrier admin
- [x] Fiche employé complète
- [ ] Améliorer lisibilité globale

---

## Phase 9 — Rapports & édition

- [x] Modification admin après validation
- [ ] Stabiliser édition (date, remarques)
- [ ] Ajout matériel manuel

---

## Phase 10 — PDF

- [x] PDF hebdomadaire corrigé
- [ ] Optimiser rendu final
- [ ] Vérification usage réel

---

## Phase 11 — Charte numérique

- [x] Signature
- [x] PDF admin
- [ ] Gestion complète du statut

---

## Phase 12 — Vacances / absences

- [ ] Saisie employé
- [ ] Validation admin
- [ ] Décompte automatique
- [ ] Vue globale calendrier

---

## Phase 13 — Catalogue matériaux

- [ ] Stabiliser catalogue
- [ ] Gestion favoris
- [ ] Corriger ref_article vs id
- [ ] Gestion erreurs Supabase

---

## Phase 14 — Facturation

- [ ] Génération facture PDF
- [ ] Lien avec catalogue
- [ ] Structure client / chantier

---

## Phase 15 — Export comptable

- [ ] Export CSV
- [ ] Export Excel
- [ ] Préparation comptabilité

---

## Phase 16 — Notifications

- [ ] Notifications PWA
- [ ] Nouveaux bons
- [ ] Planning
- [ ] Remplacer WhatsApp

---

## Phase 17 — Agent Email (future)

- [ ] Connexion IMAP Infomaniak
- [ ] Lecture bons de Régie
- [ ] Création auto dépannages
- [ ] Logs actions

---

## Phase 18 — Agent Facturation

- [ ] Génération Excel facture
- [ ] Conversion PDF
- [ ] Sauvegarde Supabase

---

## Phase 19 — Automatisation

- [ ] Analyse heures
- [ ] Détection anomalies
- [ ] Suggestions IA

---

## Phase 20 — Dashboard

- [ ] CA par chantier
- [ ] Suivi rentabilité
- [ ] Vue globale admin

---

## Phase 21 — UX & refactor

- [ ] Supprimer styles inline
- [ ] Améliorer TopBar
- [ ] Améliorer modales

---

## Phase 22 — Performance

- [ ] Optimisation requêtes Supabase
- [ ] Chargements plus rapides
- [ ] Gestion loading propre

---

## Phase 23 — Stabilisation finale

- [ ] Tests complets
- [ ] Correction bugs
- [ ] Version stable production

---

## Notes techniques

- Ne jamais masquer les erreurs Supabase
- Toujours utiliser ref_article correctement
- Attention localStorage non synchronisé
- time_entries basé sur date_travail + durée
- Sécurité > fonctionnalités

---

## Règles projet

- Ne jamais faire de force push
- Toujours faire git save après modification
- Toujours tester avant déploiement
- Sécurité toujours prioritaire

---

*Document vivant — à mettre à jour régulièrement*
