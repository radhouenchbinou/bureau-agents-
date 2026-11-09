---
name: revue-de-code
description: Relire un changement (diff d'une branche) contre la spec et l'ADR - exactitude, lisibilité, tests, erreurs, cohérence avec le repo - et poser le feu agents/revue.
---
# Revue de code

1. Lire la spec, l'ADR, le rapport QA, puis le diff : `git -C <repo> diff main...feature/<ID>`.
2. Vérifier, dans cet ordre : **exactitude** (fait ce que dit la spec, rien de plus), **données** (pertes,
   concurrence, reprise), **erreurs** (chaque échec a un comportement voulu), **tests** (couvrent les
   critères, échoueraient sans le code), **lisibilité** (noms, taille des fonctions, commentaires utiles),
   **cohérence** avec les conventions du repo, **hors périmètre**.
3. Rapport `docs/rapports/<ID>-review.md` : chaque remarque avec `fichier:ligne`, classée
   **Bloquant / À corriger / Suggestion**, et la correction proposée.
4. Verdict **APPROUVÉ** ou **CHANGEMENTS DEMANDÉS** ; si une PR existe :
   `node siege/github.js statut --role reviewer --filiale <Nom> --pr <N> --contexte revue --etat success|failure`.

Tu ne modifies jamais le code. Une remarque sans proposition concrète n'est pas une remarque.
