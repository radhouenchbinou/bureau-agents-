---
name: backlog-siege
description: Lire et faire vivre le backlog de l'entreprise (Features, Bugs, commentaires, questions au CEO) avec l'outil node siege/backlog.js, quelle que soit la source (Notion ou fichiers locaux).
---
# Backlog du Siège

Le backlog ne se touche **que** par `node siege/backlog.js` (jamais en éditant `portfolio/*.json`, jamais par
un autre accès à Notion). La garde vérifie que tu n'utilises que les sous-commandes de ton rôle.

## Lire
- `file` : l'ordre officiel de traitement.
- `voir <ID>` : un ticket (champ `prete` = dépendances livrées).
- `commentaires <ID>` : le fil ; **lis-le avant de commencer** (réponses du CEO, consignes).

## Écrire (selon ton rôle)
- Commentaire de suivi, à la fin de chaque mission :
  `commenter <ID> --auteur <ton-nom> --texte "Fait : … · Fichier : … · Reste : …"`
- Question au CEO (une règle métier ou un choix que toi seul ne peux pas trancher) :
  `commenter <ID> --auteur <ton-nom> --question --texte "…"` puis arrête-toi et signale-le au directeur.
- `--auteur` doit être **ton propre nom** : la garde refuse tout autre auteur.

## Bon commentaire
Court, factuel, utile à celui qui reprend : ce qui est fait, où, ce qui reste, ce qui bloque.
Pas de recopie du livrable : donne son chemin.
