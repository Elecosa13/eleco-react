# Eleco SA — Document d'Architecture Complet

> Version 1.0 — Avril 2026 | Confidentiel

---

## 1. Stack Technique

| Composant | Technologie |
|---|---|
| Frontend | React + Vite (PWA) |
| Base de données | Supabase (PostgreSQL) |
| Déploiement | Inspiring (inspire.ch) |
| Code source | GitHub — `Elecosa13/eleco-react` |
| Email | Infomaniak (IMAP port 993 SSL) |
| Agent IA | Claude API (Anthropic) |

---

## 2. Structure Supabase Actuelle

### Tables existantes

| Table | RLS | Usage |
|---|---|---|
| `utilisateurs` | ✅ Activé | Gestion des comptes (admin/employé) — colonne `email` ajoutée ✅ |
| `chantiers` | ✅ Activé | Liste des chantiers actifs |
| `depannages` | ✅ Activé | Bons de Régie / interventions |
| `factures` | ✅ Activé | Facturation |
| `catalogue` | ✅ Activé | Liste de prix / matériaux |
| `rapport_materiaux` | ✅ Activé | Rapports matériaux par chantier |
| `rapports` | ✅ Activé | Rapports d'intervention |
| `sous_dossiers` | ✅ Activé | Sous-dossiers par chantier |
| `absences` | ✅ Activé | Gestion des absences |
| `time_entries` | ✅ Activé | Saisie des heures |

### ✅ Sécurité — 3 tables UNRESTRICTED corrigées

`depannages`, `absences`, `time_entries` — RLS activé. Corrigé avant déploiement agent.

### Utilisateurs actuels (rôles)
- **Admin** : carlos, david, lucas (ton père et toi)
- **Employés** : bruno, ivo, paulo, noylan

### ✅ Mots de passe migrés vers Supabase Auth

Authentification via `signInWithPassword`. Les mots de passe ne sont plus stockés en clair.

> 🗑️ **TODO : supprimer la colonne `mot_de_passe`** de la table `utilisateurs` (obsolète depuis la migration vers Supabase Auth)

---

## 3. Architecture Double App — RÈGLE NON NÉGOCIABLE

```
┌─────────────────────────────────────────────────────┐
│                    SUPABASE                          │
│              (source de vérité unique)               │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
┌─────────▼──────────┐   ┌─────────▼──────────┐
│   APP EMPLOYÉS     │   │   APP ADMIN         │
│   (accès limité)   │   │   (accès complet)   │
│                    │   │                     │
│ - Pointer rapports │   │ - Tout voir         │
│ - Saisir heures    │   │ - Gérer chantiers   │
│ - Voir tâches      │   │ - Valider bons      │
│ - Voir planning    │   │ - Générer factures  │
│                    │   │ - Accès agents IA   │
└────────────────────┘   └─────────────────────┘
```

**Règle de sécurité absolue :**
- Un employé avec le rôle `employe` ne peut JAMAIS accéder aux vues admin
- La restriction est au niveau des **Supabase RLS policies**, pas juste l'interface
- Même en connaissant l'URL admin, un employé voit une page d'erreur/vide
- Authentification séparée par rôle dès la connexion

---

## 4. Système Agent IA — Vue d'ensemble

### 4.1 Agent Email (Bons de Régie)

**Déclencheur :** Nouvel email reçu sur Infomaniak  
**Mode actuel :** Silencieux (phase test) — aucune modification côté Infomaniak

```
Infomaniak IMAP
      │
      ▼ (polling toutes les X minutes)
Agent Claude
      │
      ├─ Analyse l'email
      │   ├─ C'est un bon de Régie ? → OUI
      │   │     ├─ Identifie le client (matching avec table `chantiers`)
      │   │     ├─ Crée le dossier dans `depannages`
      │   │     ├─ Importe le bon (PDF) dans `sous_dossiers`
      │   │     └─ Envoie notification à tous les employés
      │   │
      │   └─ C'est autre chose ? → Ignorer (phase test)
      │
      └─ Log de l'action dans une table `agent_logs` (à créer)
```

**Règles phase test :**
- Emails restent NON LUS sur Infomaniak
- Rien n'est déplacé/supprimé côté email
- Chaque action est loggée pour validation manuelle
- Ton père travaille normalement, sans perturbation

---

### 4.2 Agent Facturation

**Déclencheur :** Manuel (bouton dans app admin)  
**Input :** Liste de prix catalogue + données chantier/dépannage

```
Admin clique "Générer facture"
      │
      ▼
Agent Claude
      │
      ├─ Récupère les données du chantier/dépannage
      ├─ Récupère le catalogue de prix correspondant
      ├─ Génère la facture au format Excel (template existant)
      ├─ Sauvegarde dans `factures`
      └─ PDF disponible pour téléchargement
```

**Format de sortie :** Identique aux Excel existants (Naef, Bersier, Comptoir, etc.)

---

### 4.3 Notifications Employés (remplacement WhatsApp)

**Déclencheur :** Agent Email après création d'un dossier de Régie

```
Nouveau bon de Régie créé
      │
      ▼
Notification push (PWA) → tous les employés
      │
      Contenu :
      ├─ Nom du client
      ├─ Adresse de l'intervention
      ├─ Date
      └─ Lien direct vers le dossier dans l'app
```

---

## 5. Gestion des Heures

### 5.1 Saisie des heures par l'employé
- Remplace les feuilles papier signées à la main
- L'employé sélectionne : chantier, date, heure début, heure fin, pause (minutes), commentaire optionnel
- Calcul automatique des heures nettes : (fin - début) - pause
- Sauvegarde dans `time_entries`

### 5.2 Colonnes à ajouter à `time_entries`
- `semaine` int — numéro de semaine ISO (calculé auto selon la date)
- `annee` int — année
- `heures_nettes` numeric — (fin - début) - pause

### 5.3 Cumul heures par chantier
- Vue admin : total heures par chantier en temps réel
- Somme des `heures_nettes` groupée par `chantier_id`

### 5.4 Feuille hebdomadaire automatique (PDF)
- Admin sélectionne : employé + semaine
- PDF généré avec : tableau lundi→dimanche, total heures semaine, signature numérique de l'employé
- Remplace le papier signé à la main

---

## 6. Signature Numérique

### 6.1 Capture
- Canvas tactile à la première connexion de l'employé
- Convertie en PNG base64 et stockée dans Supabase

### 6.2 Table `signatures` (à créer)
- `id` uuid PK
- `employe_id` uuid unique FK → `utilisateurs`
- `signature_base64` text
- `signee_le` timestamptz
- `ip_address` text
- `device_info` text

### 6.3 Usage
- Intégrée automatiquement dans les feuilles hebdomadaires PDF
- Intégrée dans le PDF de la charte numérique
- Non modifiable par l'employé sans validation admin

---

## 7. Charte Numérique Employé

### 7.1 Objectif
Remplace le document papier signé à l'embauche.

### 7.2 Clauses
1. Confidentialité — aucune info client/chantier/prix ne peut être divulguée
2. Usage exclusif professionnel
3. Interdiction de partager ses identifiants
4. Aucun screenshot ou export partagé hors entreprise
5. Signalement de tout accès suspect à l'admin
6. Données et documents = propriété exclusive de Eleco SA
7. Valable pour toute la durée du contrat
8. Violation = mesures disciplinaires (droit suisse du travail)

### 7.3 Flux
- Première connexion → affichage charte complète (scroll obligatoire)
- Bouton "J'ai lu et j'accepte" activé seulement après scroll complet
- Employé signe via canvas → signature sauvegardée dans `signatures`
- PDF généré (charte + signature + date + IP) → archivé dans Supabase Storage
- Employé bloqué sur cette page tant qu'il n'a pas signé

### 7.4 Table `chartes_acceptees` (à créer)
- `id` uuid PK
- `employe_id` uuid FK → `utilisateurs`
- `version_charte` text (ex: "v1.0")
- `acceptee_le` timestamptz
- `ip_address` text
- `device_info` text
- `pdf_url` text

### 7.5 Vue admin
- Liste employés avec statut : ✅ signé / ❌ en attente
- Date + IP de signature
- Téléchargement PDF par employé

---

## 8. Roadmap — Ordre de priorité

### Phase 1 — Sécurité (URGENT, avant tout le reste)
- ✅ Activer RLS sur `depannages`, `absences`, `time_entries`
- ✅ Migrer mots de passe vers Supabase Auth (hachage bcrypt)
- [ ] Définir les policies par rôle (admin vs employé)
- [ ] Tester qu'un employé ne peut pas accéder aux données admin

### Phase 2 — Architecture double app
- ✅ Séparer les routes admin / employé proprement
- ✅ Page de connexion avec redirection selon le rôle
- ✅ Guards de navigation (impossible d'accéder à une route sans le bon rôle)

### Phase 3 — Signature numérique & Charte ✅
- ✅ Créer tables `signatures` et `chartes_acceptees` (`supabase/migrations/sections_5_6_7.sql`)
- ✅ Canvas signature tactile dans app employés (`src/pages/Charte.jsx`)
- ✅ Flux acceptation charte à la première connexion (guard `CharteGuard` dans `App.jsx`)
- ✅ Génération PDF charte signée + téléchargement auto (jsPDF dans `Charte.jsx`)
- ✅ Vue admin : statut charte par employé (`vue === 'chartes'` dans `Admin.jsx`)
- [ ] **TODO Lucas** : exécuter `supabase/migrations/sections_5_6_7.sql` dans Supabase SQL Editor

### Phase 4 — Gestion des heures ✅
- ✅ Ajouter colonnes `semaine`, `annee`, `heures_nettes`, `heure_debut`, `heure_fin`, `pause_minutes` à `time_entries`
- ✅ Interface saisie heures dans app employés (`src/pages/SaisieHeures.jsx` — route `/employe/heures`)
- ✅ Vue cumul heures par chantier (admin — `vue === 'heures'`)
- ✅ Générateur feuille hebdomadaire PDF avec signature intégrée (admin — `genererFeuilleHebdo()`)

### Phase 5 — Catalogue de prix
- [ ] Importer les Excel de facturation existants dans `catalogue`
- [ ] Interface admin pour modifier les prix
- [ ] Lier le catalogue aux chantiers/dépannages

### Phase 6 — Agent Email (mode test silencieux)
- [ ] Connexion IMAP Infomaniak (lecture seule)
- [ ] Détection automatique des bons de Régie
- [ ] Création automatique du dossier dans `depannages`
- [ ] Import du bon PDF dans `sous_dossiers`
- [ ] Table `agent_logs` pour traçabilité
- [ ] Tests pendant plusieurs semaines — validation manuelle en parallèle

### Phase 7 — Notifications
- [ ] Système de push notifications PWA
- [ ] Remplacement progressif du groupe WhatsApp
- [ ] Validation avec les employés

### Phase 8 — Facturation automatique
- [ ] Générateur de facture basé sur le catalogue
- [ ] Template identique aux Excel existants
- [ ] Export PDF + sauvegarde Supabase

### Phase 9 — Retard admin
- [ ] Audit complet de ce qui est en retard
- [ ] Automatisation des tâches répétitives identifiées
- [ ] Tableaux de bord pour ton père

---

## 9. Ce dont Claude Code a besoin pour travailler seul

| Feature | Peut faire seul | Nécessite ton input |
|---|---|---|
| Activer RLS Supabase | ✅ | Non |
| Guards de navigation | ✅ | Non |
| Page connexion par rôle | ✅ | Non |
| Connexion IMAP Infomaniak | ❌ | Credentials IMAP |
| Matching client email → chantier | ❌ | Logique métier à définir |
| Import catalogue Excel | ❌ | Les fichiers Excel finalisés |
| Template facture | ❌ | Validation du format exact |
| Notifications push | ✅ | Non |
| Canvas signature employé | ✅ | Non |
| Flux acceptation charte | ✅ | Non |
| Génération PDF charte signée | ✅ | Non |
| Interface saisie heures | ✅ | Non |
| Cumul heures par chantier | ✅ | Non |
| Générateur feuille hebdo PDF | ✅ | Non |
| Contenu final charte | ❌ | Validation recommandée |

---

## 10. Questions ouvertes à clarifier

1. **Matching Régie → Chantier** : comment l'agent identifie-t-il quel client correspond à un bon ? Par le nom dans l'email ? Un code ?
2. **Format des bons de Régie** : ils arrivent toujours en PDF joint ? Ou parfois dans le corps du mail ?
3. **Catalogue finalisé** : quand les Excel seront prêts, les envoyer pour import
4. **URL app admin** : elle est différente de l'app employés ? Ou même URL avec vue différente selon le rôle ?
5. **Déploiement** : confirmer si c'est Inspiring (inspire.ch) et si tu as accès aux variables d'environnement

---

## 11. Règles de comportement — TOUJOURS RESPECTER

### Actions interdites sans confirmation explicite de Lucas
- Ne jamais supprimer de fichiers ou dossiers
- Ne jamais faire de commit ou push vers GitHub automatiquement
- Ne jamais modifier les données en production Supabase sans backup préalable
- Ne jamais installer un package sans l'annoncer clairement

### Actions autorisées en autonomie
- Créer et modifier des fichiers de code
- Ajouter des règles RLS sur Supabase
- Créer de nouveaux composants React
- Refactoriser du code existant
- Créer des nouvelles branches Git

### Priorités du projet
- La sécurité passe avant tout (RLS, authentification, séparation des rôles)
- L'app admin et l'app employés sont hermétiquement séparées
- Un employé ne doit JAMAIS pouvoir accéder aux données admin, même en connaissant l'URL
- Les mots de passe ne sont JAMAIS stockés en clair

### Mode test agent email
- L'agent IMAP Infomaniak est en lecture seule
- Aucun email ne doit être marqué comme lu, déplacé ou supprimé
- Chaque action de l'agent est loggée dans la table `agent_logs`

### Style de code
- Fichiers complets uniquement, jamais de patches partiels
- Explications courtes et simples après chaque modification

---

## 12. Décisions techniques

### Email — Migration info@eleco-sa.ch vers Infomaniak

**Décision :** Transférer la gestion de `info@eleco-sa.ch` d'Area Publicité directement vers Infomaniak, sous Eleco SA.

**Quand :** Quand l'application est stable et validée en production.

**Règle absolue :** Ne perdre aucun email ni dossier pendant la migration.

---

*Document vivant — à mettre à jour à chaque session de travail*
