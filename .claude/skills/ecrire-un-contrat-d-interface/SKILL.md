---
name: ecrire-un-contrat-d-interface
description: Définir un contrat d'échange entre filiales (fichier, événement, API) dans portfolio/interfaces.md - producteur, consommateurs, format exact avec exemple, invariants, versionnement, erreurs, sécurité.
---
# Écrire un contrat d'interface

Un contrat existe **avant** tout code qui en dépend. Il se lit seul, sans le code.

## Sections obligatoires
1. **Producteur → consommateurs** (filiales et jobs nommés).
2. **Chemin / point d'accès** exact.
3. **Format** : schéma champ par champ (type, obligatoire, sens) + un **exemple complet** valide.
4. **Invariants** : ce qui est toujours vrai (ordre, unicité, ajout seul, atomicité, encodage).
5. **Versionnement** : champ `version`, ce qui est compatible (ajout facultatif) ou non (renommage,
   changement de type → version + 1, mise à jour du contrat avant le code), comportement d'un lecteur
   face à une version inconnue.
6. **Erreurs** : fichier absent, tronqué, incohérent ; que fait chaque consommateur.
7. **Sécurité** : droits des fichiers, secrets jamais exposés, aucun chemin construit depuis une donnée
   reçue.

## Pièges à vérifier
Écritures concurrentes (deux écrivains, fichiers temporaires au nom fixe), reprise après coupure brutale,
lecture pendant une écriture, horloges et fuseaux, taille maximale des fichiers.
