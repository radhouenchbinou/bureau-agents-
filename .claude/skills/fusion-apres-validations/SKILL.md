---
name: fusion-apres-validations
description: Fusionner une pull request dans main seulement quand le CEO l'a approuvée sur GitHub et que les feux agents/revue et agents/securite sont au vert.
---
# Fusion après validations

Seul le devops fusionne, et seulement par l'outil du Siège :
```
node siege/github.js fusionner --role devops --filiale <Nom> --pr <N>
```
L'outil refuse la fusion s'il manque l'un de ces points (il les vérifie lui-même sur GitHub) :
1. une **approbation du CEO** (revue « Approve » d'une personne, pas d'un bot) et aucune demande de
   changements en cours ;
2. le feu **agents/revue** au vert (posé par le reviewer) ;
3. le feu **agents/securite** au vert (posé par le RSSI) ;
4. aucun conflit avec `main`.

Avant de lancer : la CI de la PR est verte et le ticket est à l'étape 8. Après : commentaire de suivi
sur le ticket avec le numéro de PR et le commit de fusion. En cas de refus, ne contourne jamais : signale
au directeur ce qui manque.
