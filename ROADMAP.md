# ROADMAP — Eleco SA
> Mis à jour — 19 Avril 2026

---

## STATUT SÉCURITÉ — ⚠️ PRÉ-PRODUCTION (audit 2026-04-15)

> **Auth Supabase réelle implémentée** — signInWithPassword, session JWT, PrivateRoute vérifié.
> **RLS audité** — politiques SECURITY DEFINER sur 12 tables, `USING(true)` supprimé.
> **⛔ Ne pas déployer en production sans appliquer `auth_rls_security.sql`**

---

## Phase 1 — Sécurité ✅ Pré-prod validée

- [x] Migrer vers Supabase Auth (signInWithPassword + session JWT)
- [x] RLS activé sur toutes les tables — migration prête
- [x] Politiques RLS séparées employé / admin avec SECURITY DEFINER
- [x] Vérifier qu’un employé ne peut jamais accéder aux données admin
- [x] Variables d’environnement Supabase via Vite env (`.env`)

### Checklist avant mise en production

- [ ] Exécuter `auth_rls_security.sql` EN DERNIER (après `sections_5_6_7.sql`)
- [ ] Créer les comptes Supabase Auth pour chaque employé
- [ ] Vérifier que chaque utilisateur a `auth_user_id` renseigné dans `utilisateurs`
- [ ] Supprimer le fallback email dans `Login.jsx` — utiliser `authData.user.id` uniquement
- [ ] Supprimer la colonne `mot_de_passe` de la table `utilisateurs`
- [ ] Corriger les policies `USING(true)` dans `sections_5_6_7.sql` (signatures + chartes_acceptees)
- [ ] Tester RLS réellement connecté avec un compte employé

---

## Phase 2 — Auth & rôles

- [x] Redirection automatique selon rôle après login
- [x] Guards propres sur toutes les routes (PrivateRoute + CharteGuard)
- [x] Blocage total accès admin côté employé
- [ ] Valider en test réel avec comptes Supabase Auth

---

## Prochain grand chantier prioritaire — Catalogue matériaux (Phase 13)

> **Refonte complète à faire avec le patron.** Le catalogue actuel est basé sur des données incomplètes.
> Prévoir une journée dédiée avant de coder quoi que ce soit.
>
> **À préparer :**
> - Récupérer la liste de prix Feller (remplace Legrand)
> - Définir la structure : ref_article, désignation, unité, prix fournisseur, prix perso optionnel
> - Décider qui peut modifier les prix (admin uniquement)
> - Valider le format avec le patron avant import
>
> **Ensuite :**
> - Importer le catalogue Feller en base
> - Gestion favoris par employé (localStorage actuel → Supabase)
> - Champ "article manquant" pour saisie libre par l'employé

---

## Phase 3 — Déploiement & stabilité

- [x] Variables d'environnement Supabase via Vite env
- [ ] Stabiliser Netlify / Cloudflare Pages
- [ ] Corriger définitivement le routing SPA
- [ ] Tester tous les liens (/login, /admin, /employe)

---

## Phase 4 — PWA (APP TÉLÉPHONE)

- [x] Fix white screen iOS Safari au boot
- [x] Hardening boot app iOS (écran blanc, init Auth)
- [x] Fix flux login cassé (2026-04-18)
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

- [x] Grouper dépannages par régie (admin)
- [x] Recherche admin avec debounce
- [x] Harden soumission workflow dépannage
- [x] Fix navigation retour détail dépannage
- [x] Fix statut admin / déblocage intervention
- [ ] Navigation propre (à revalider)
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
- [x] Gestion absences maladie / autres (saisie employé + approbation admin — 2026-04-18)

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
