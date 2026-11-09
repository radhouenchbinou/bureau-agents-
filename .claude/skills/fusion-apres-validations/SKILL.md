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

**Feature sur plusieurs filiales** (ticket parent et un enfant par filiale, une PR par repo) : jamais PR par PR —
l'outil le refuse. Une seule commande, sur le parent :
```
node siege/github.js fusionner --role devops --ticket <PARENT>
```
Tout le lot est vérifié d'abord ; s'il manque quoi que ce soit sur une seule PR, rien n'est fusionné et l'outil liste ce
qui manque. Sinon il fusionne dans l'ordre des dépendances. S'il s'arrête au milieu (fusion refusée par GitHub), le
parent est « Bloqué » avec l'état exact : ne relance rien, remonte au directeur pour décision du CEO.

Avant de lancer : la CI de la PR est verte et le ticket est à l'étape 8. Après : commentaire de suivi
sur le ticket avec le numéro de PR et le commit de fusion. En cas de refus, ne contourne jamais : signale
au directeur ce qui manque.
