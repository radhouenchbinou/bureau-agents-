# EIA-006 — Profils de stack et types d'agents configurables (N18)

## Ce que fait la fonctionnalité
Les stacks techniques (image de conteneur, commandes de build, test, lint, scan, chemins sensibles) sont décrites dans un fichier de configuration. Trois profils sont fournis : `java-spring`, `node-ts`, `python`. Chacun est associé à un type d'agent (`dev-java`, `dev-node`, `dev-python`).

## Configuration
Fichier : `siege/config/profils-stack.json`.
- `profils` : identifiant en minuscules, libellé, image (`eclipse-temurin:21-jdk`, `node:22-slim`, `python:3.12-slim`), listes de commandes pour `build`, `test`, `lint`, `scan`, et `chemins_sensibles`.
- `types_agents` : chaque type référence un profil existant.

## Règle d'autorisation
Une commande n'est autorisée que si elle figure mot pour mot dans la liste de son profil (`commandeAutorisee`). Aucune commande libre.

## Où c'est dans le code
- `siege/lib/profils.js` : `charger`, `valider`, `commandeAutorisee`, `CHAMPS_COMMANDES`.
- `siege/test/profils.test.js` : les trois profils sont chargés, une commande hors liste est refusée, un profil ou un type mal formé est rejeté avec un message clair.

## Limites connues
- Les profils ne sont pas encore branchés aux conteneurs d'exécution : c'est le périmètre de N2 (EIA-008).

## Validation
- Recette, revue de code et sécurité validées par le CEO, sans rapport écrit.
