---
description: Corriger un bug du tableau Bugs (circuit court), avec validation du CEO à chaque étape
argument-hint: [BUG-ID] (sans argument : le premier bug de la file)
---
Bug : $ARGUMENTS

Une session = **une étape** de ce bug (contexte propre, voir CLAUDE.md). Étapes numérotées comme le circuit Bug du workflow :
0 Cadrage, 4 Correction, 5 Vérification, 6 Revue ; reprends à celle qu'indique le dernier commentaire `Validé par le CEO · Étape suivante : <n>`.
Chaque mission porte `Ticket : <BUG-ID>` et `Étape : <n> · <nom>` et lance un **nouvel** agent. Après « Valider » :
commente l'étape suivante et termine ton tour (`/clear` puis `/corriger <BUG-ID>`).

- `node siege/backlog.js voir <BUG-ID>` (ou le premier bug de `file`) et `commentaires <BUG-ID>`.
   Retrouve la story liée et sa filiale.
- **0 · Cadrage** : gravité, cause probable, filiale ; demande validation.
- **4 · Correction** : `maj <BUG-ID> --statut "En correction" --agent dev-backend` (ou dev-frontend), puis
   délègue avec `Filiale : … — dossier …`, `Ticket : <BUG-ID>`, la story liée et le rapport QA.
   Le dev écrit d'abord un test qui reproduit le bug, corrige sur la branche de la story (ou
   `fix/<BUG-ID>`), passe le bug « À vérifier » et commente. 🔒
- **5 · Vérification** : délègue à `qa` (mode recette, ce bug seulement) ; Fermé ou retour en correction. 🔒
- **6 · Revue** : `reviewer` sur le correctif. 🔒
- Fin : bilan en 3 lignes. Aucun push ni déploiement.
