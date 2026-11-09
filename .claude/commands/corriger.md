---
description: Corriger un bug du tableau Bugs (circuit court), avec validation du CEO à chaque étape
argument-hint: [BUG-ID] (sans argument : le premier bug de la file)
---
Bug : $ARGUMENTS

1. `node siege/backlog.js voir <BUG-ID>` (ou le premier bug de `file`) et `commentaires <BUG-ID>`.
   Retrouve la story liée et sa filiale.
2. **Cadrage** : gravité, cause probable, filiale ; demande validation.
3. **Correction** : `maj <BUG-ID> --statut "En correction" --agent dev-backend` (ou dev-frontend), puis
   délègue avec `Filiale : … — dossier …`, `Ticket : <BUG-ID>`, la story liée et le rapport QA.
   Le dev écrit d'abord un test qui reproduit le bug, corrige sur la branche de la story (ou
   `fix/<BUG-ID>`), passe le bug « À vérifier » et commente. 🔒
4. **Vérification** : délègue à `qa` (mode recette, ce bug seulement) ; Fermé ou retour en correction. 🔒
5. **Revue** : `reviewer` sur le correctif. 🔒
6. Fin : bilan en 3 lignes. Aucun push ni déploiement.
