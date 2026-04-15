# ROADMAP — Eleco SA
> Mis à jour — Avril 2026

---

## STATUT SÉCURITÉ / AUTH / RLS — PRIORITAIRE CRITIQUE

> **RLS Supabase non fonctionnel.** L'app utilise une auth custom (localStorage) sans session Supabase Auth. Toutes les RLS basées sur `auth.uid()` sont inactives. La seule protection est le filtre `employe_id` côté client, contournable par modification du localStorage.
>
> **À traiter avant toute mise en production réelle.** Les phases 1 et 2 ci-dessous doivent être prioritaires.

---

## Phase 1 — Sécurité (PRIORITÉ ABSOLUE)

- [ ] Migrer vers Supabase Auth (remplacer login custom)
- [ ] Supprimer les mots de passe en clair dans la table `utilisateurs`
- [ ] Activer et tester RLS sur toutes les tables
- [ ] Vérifier qu'un employé ne peut jamais accéder aux données admin côté serveur
- [ ] Sécuriser la clé Supabase via variable d'environnement (ne pas committer)

---

## Phase 2 — Auth & rôles

- [ ] Redirection automatique selon rôle après login
- [ ] Guards propres sur toutes les routes
- [ ] Blocage total accès admin côté employé

---

## Phase 3 — Déploiement & stabilité

- [ ] Stabiliser Netlify / Cloudflare Pages
- [ ] Corriger définitivement le routing SPA
- [ ] Vérifier les variables d'environnement
- [ ] Tester tous les liens (/login, /admin, /employe)

---

## Phase 4 — PWA (APP TÉLÉPHONE)

- [ ] Rendre l'app installable (manifest + icône)
- [ ] Ajout écran d'accueil Samsung
- [ ] Test réel avec le patron
- [ ] Vérifier comportement mobile

---

## Phase 5 — Interface employé

- [x] Saisie simplifiée (durée uniquement)
- [x] Suppression "Mes heures"
- [x] Heures supplémentaires avec justification obligatoire
- [x] Module vacances : saisie employé, quota, blocages admin
- [ ] Améliorer UX terrain (retours usage réel)

---

## Phase 6 — Heures & logique métier

- [ ] Stabiliser time_entries
- [ ] Gérer passage minuit
- [ ] Crédit heures journalier fiable dans SaisieHeures.jsx
- [ ] Cohérence chantier / dépannage

---

## Phase 7 — Dépannages & chantiers

- [ ] Navigation propre
- [ ] Accès rapide aux bons
- [ ] Structure claire des données

---

## Phase 8 — Admin

- [x] Vue employés
- [x] Calendrier admin
- [x] Fiche employé complète
- [x] Heures supplémentaires visibles par admin
- [ ] Améliorer lisibilité globale

---

## Phase 9 — Rapports & matériaux

- [x] Modification admin après validation
- [x] Ajout matériel manuel (hors catalogue)
- [x] Sauvegarde matériaux sécurisée (gestion erreur delete/insert)
- [ ] Stabiliser édition (date, remarques)

---

## Phase 10 — PDF

- [x] PDF hebdomadaire corrigé (inclut heures supp)
- [ ] Optimiser rendu final
- [ ] Vérification usage réel

---

## Phase 11 — Charte numérique

- [x] Signature employé
- [x] PDF admin
- [ ] Gestion complète du statut

---

## Phase 12 — Vacances / absences

- [x] Saisie employé avec quota et blocages
- [x] Séparation blocage strict / fermeture collective
- [x] Validation / refus admin
- [x] Décompte automatique jours ouvrables
- [x] Avertissement couverture (non bloquant)
- [ ] Vue calendrier global vacances
- [ ] Gestion absences maladie / autres

---

## Phase 13 — Catalogue matériaux

- [ ] Stabiliser catalogue
- [ ] Gestion favoris par employé
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
- [ ] Export Excel au format patron
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
- Attention localStorage non synchronisé avec Supabase Auth
- time_entries basé sur date_travail + durée
- vacances_blocages : colonne `type` = 'blocage' (strict) ou 'fermeture_collective' (informatif)
- sauvegarderMateriaux : delete puis insert avec gestion d'erreur sur chaque étape
- Sécurité > fonctionnalités — ne pas déployer en production sans RLS actif

---

## Règles projet

- Ne jamais faire de force push
- Toujours tester avant déploiement
- Sécurité toujours prioritaire
- Ne jamais supprimer de données en base

---

*Document vivant — à mettre à jour régulièrement*
