---
name: branche-et-commit
description: Travailler sur une branche feature/<ID> ou fix/<BUG-ID>, faire des commits atomiques bien nommés, pousser et ouvrir une pull request avec l'outil GitHub du Siège.
---
# Branche, commit, pull request

- Branche : `feature/<ID>-<slug>` pour une feature, `fix/<BUG-ID>` pour un bug, créée depuis `main` à jour.
  Jamais de travail sur `main`.
- Commits atomiques, message : `<ID> : <ce qui change, au présent>` + une ligne vide + le pourquoi si utile,
  puis la ligne `Agent: <ton-nom>`.
- Avant de commiter : `git -C <repo> status` et `git -C <repo> diff --staged` ; pas de fichier de données,
  de secret, de fichier généré.
- Pousser et ouvrir la PR uniquement par l'outil du Siège (jamais `git push` direct) :
  ```
  node siege/github.js pousser --role <ton-nom> --filiale <Nom> --branche feature/<ID>-<slug>
  node siege/github.js pr --role <ton-nom> --filiale <Nom> --ticket <ID> --branche feature/<ID>-<slug> --titre "<ID> : …" --corps "…"
  ```
- Corps de PR : lien vers la spec, résumé, comment tester, risques. La fusion n'est jamais de ton ressort.
