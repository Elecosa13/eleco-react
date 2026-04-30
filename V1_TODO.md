# Eleco SA - TODO V1

Objectif : obtenir une V1 manuelle propre, stable, securisee et utilisable en interne avant d'ajouter des automatisations.

## Priorite V1

- Corriger les bugs visibles dans les parcours employe et admin.
- Simplifier la logique Depannages pour la V1.
- Ameliorer la navigation retour entre les vues principales.
- Verifier la securite Supabase et les policies RLS.
- Verifier que les employes ne voient jamais les prix ni les donnees sensibles.
- Verifier les acces admin et employe.
- Verifier creation, edition et suppression des depannages.
- Verifier rapports, photos, heures et materiel.
- Verifier la stabilite PWA et mobile.
- Lister les failles restantes avant diffusion interne.
- Lister et executer les tests manuels V1.

## Depannages V1

Pour la V1, les employes creent eux-memes un depannage uniquement pour envoyer un rapport aux admins.

### A simplifier ou cacher

- Prendre un depannage.
- Planifier un depannage.
- Prendre sans date.
- Logique d'assignation automatique.
- Toute logique avancee qui suppose une automatisation future.

### A garder

- Creation manuelle d'un depannage par un employe.
- Choix de la regie.
- Saisie de l'adresse.
- Saisie des informations utiles au depannage.
- Saisie du rapport.
- Saisie des heures.
- Saisie du materiel.
- Ajout de photos.
- Envoi ou validation du rapport vers les admins.
- Statut clair cote admin :
  - rapport recu
  - a traiter
  - archive
  - a facturer

## Navigation

- Verifier que chaque ecran important possede un retour clair.
- Verifier que le retour ne fait pas perdre les donnees saisies sans avertissement.
- Verifier la navigation mobile sur les parcours employe.
- Verifier la navigation admin entre chantiers, depannages, rapports et factures.

## Securite Supabase / RLS

- Verifier que RLS est active sur toutes les tables sensibles.
- Verifier les policies de `utilisateurs`.
- Verifier les policies de `chantiers`.
- Verifier les policies de `factures`.
- Verifier les policies de `catalogue`.
- Verifier les policies de `rapport_materiaux`.
- Verifier les policies de `rapports`.
- Verifier les policies de `sous_dossiers`.
- Corriger ou documenter les tables encore unrestricted :
  - `depannages`
  - `absences`
  - `time_entries`
- Verifier qu'un employe ne peut pas lire les donnees admin via l'interface.
- Verifier qu'un employe ne peut pas lire les prix, marges, factures ou informations sensibles.
- Verifier qu'un admin conserve les droits necessaires pour gerer les donnees.

## Acces et roles

- Tester connexion admin avec `lucas`.
- Tester connexion admin avec `david`.
- Tester connexion admin avec `carlos`.
- Tester connexion employe avec `paulo`.
- Tester connexion employe avec `bruno`.
- Tester connexion employe avec `ivo`.
- Tester connexion employe avec `noylan`.
- Verifier que la vue admin n'est jamais accessible a un employe.
- Verifier que la vue employe reste simple et limitee aux actions utiles.

## Rapports employes

- Verifier creation d'un rapport de fin de journee.
- Verifier choix du chantier ou depannage.
- Verifier saisie des heures.
- Verifier saisie du travail effectue.
- Verifier ajout de materiel.
- Verifier ajout de photos.
- Verifier envoi du rapport.
- Verifier affichage cote admin apres envoi.
- Verifier qu'un rapport incomplet affiche une erreur claire.

## Depannages admin

- Verifier affichage des depannages avec statut clair.
- Verifier consultation d'un rapport recu.
- Verifier passage en statut `a traiter`.
- Verifier passage en statut `archive`.
- Verifier passage en statut `a facturer`.
- Verifier edition des informations utiles.
- Verifier suppression si elle est autorisee en V1.
- Verifier qu'une suppression accidentelle est evitee ou confirmee.

## PWA et mobile

- Verifier installation PWA sur mobile.
- Verifier lancement depuis l'icone mobile.
- Verifier fonctionnement sur petit ecran.
- Verifier formulaires longs sur mobile.
- Verifier ajout de photos depuis mobile.
- Verifier comportement en reseau faible.
- Verifier absence de blocage visible apres rafraichissement.

## Failles restantes a lister

- Tables Supabase encore unrestricted.
- Mots de passe encore geres hors Supabase Auth.
- Donnees sensibles visibles ou accessibles par erreur.
- Actions admin accessibles depuis un compte employe.
- Suppressions sans confirmation suffisante.
- Statuts ambigus ou non synchronises.
- Bugs mobiles bloquants.
- Cas ou un rapport peut etre perdu avant envoi.

## Tests manuels avant diffusion interne

- Parcours employe complet : creation depannage, rapport, heures, materiel, photos, envoi.
- Parcours admin complet : reception rapport, lecture, traitement, archivage ou mise a facturer.
- Test role employe : verifier absence de prix, factures et donnees sensibles.
- Test role admin : verifier acces aux donnees necessaires.
- Test mobile : saisie complete depuis telephone.
- Test PWA : installation, ouverture, navigation et rafraichissement.
- Test erreur : formulaire incomplet, photo manquante, reseau instable.
- Test securite : acces direct aux URLs admin depuis un compte employe.
- Test donnees : verifier que les informations saisies restent correctes apres rechargement.
- Test final avec un cas reel interne avant diffusion plus large.
