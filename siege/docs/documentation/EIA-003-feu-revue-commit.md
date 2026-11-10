# EIA-003 — Feu de revue posé sur le commit relu (C6)

## Ce que fait la fonctionnalité
Le feu `agents/revue` ou `agents/securite` est posé sur le commit que l'agent a relu, et non sur la tête courante de la PR.

## Comment l'utiliser
```
node siege/github.js statut --role reviewer --filiale <Nom> --pr <N> --sha <commit relu> --contexte revue --etat success
```
- `--sha` est obligatoire : 40 caractères hexadécimaux.
- Si la tête de la PR a bougé depuis la relecture, le feu est refusé et une nouvelle relecture est nécessaire.

## Où c'est dans le code
- `siege/github.js` : fonction `verifierTeteRelue(p, sha, pr)`, appelée par la commande `statut`.
- `siege/test/feu-revue.test.js` : deux tests (commit relu accepté, tête bougée refusée).

## Limites connues
- Le feu n'est posé qu'après vérification de la tête ; une course entre la vérification et la pose reste théoriquement possible.

## Validation
- Recette, revue de code et sécurité validées par le CEO, sans rapport écrit.
