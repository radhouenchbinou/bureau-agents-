# EIA-007 — Exécutions persistantes, périmètre P0 (N1)

## Ce que fait la fonctionnalité
Une file d'exécutions d'agents est tenue dans un fichier JSON, écrite atomiquement sous verrou.

## Règles
- Anti-doublon : une même clé `ticket|étape|essai` n'est jamais ajoutée deux fois.
- Une seule exécution `en_cours` par dépôt à la fois.
- Au plus 2 nouveaux essais après un échec ; au-delà, l'exécution passe à `escalade`.
- Au redémarrage, une exécution `en_cours` passe à `interrompu` et n'est jamais relancée automatiquement.

## Où c'est dans le code
- `siege/lib/executions.js` : classe `Executions` (`demander`, `demarrerSuivante`, `terminer`, `reprendre`, `lire`, `modifier`), constante `NOUVEAUX_ESSAIS_MAX = 2`.
- `siege/test/executions.test.js` : cinq tests (anti-doublon, une par dépôt, escalade, reprise sans relance, écritures concurrentes).

## Limites connues (hors périmètre P0, à reprendre)
- Stockage en JSON et non en SQLite.
- Pas d'arrêt de groupe de processus.
- Pas de délai d'exécution.
- Pas encore branché au serveur du Siège.

## Validation
- Recette, revue de code et sécurité validées par le CEO, sans rapport écrit.
