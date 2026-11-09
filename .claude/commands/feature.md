---
description: Faire passer une feature par le circuit complet de l'entreprise, avec validation du CEO à chaque étape
argument-hint: [ID de feature, ou demande en texte libre]
---
Demande : $ARGUMENTS

Une session = **une étape** de ce ticket (contexte propre, voir CLAUDE.md) : tout l'état est dans le ticket et les
fichiers, rien ne doit venir d'une session précédente.

1. Lis `process/workflow-feature.md` et `portfolio/filiales.md`.
2. Trouve le ticket :
   - aucun argument → le premier ticket feature de `node siege/backlog.js file` ;
   - un ID → `node siege/backlog.js voir <ID>` (refuse s'il dépend d'une feature non livrée) ;
   - un texte libre → crée d'abord le ticket (`creer feature --filiale … --titre …`) après accord du CEO.
   Lis `node siege/backlog.js commentaires <ID>` : la **dernière passation**, la dernière validation du CEO et ses
   réponses suffisent ; ne relis pas tout l'historique des livrables.
3. **Reprise** : le champ `etape` du ticket dit où l'on en est.
   - Ticket « À faire » sans étape → **étape 0, cadrage** : filiale(s), impact inter-filiales, circuit (complet, court
     ou Groupe), étapes retenues (commente-les sur le ticket). Demande validation.
     Plusieurs filiales → propose le découpage : ce ticket devient le **parent**, un ticket enfant par filiale
     (`creer feature --filiale <Nom> --parent <ID> --dependances <producteur>`) ; voir « Feature sur plusieurs
     filiales » dans le workflow. Après validation, chaque enfant passe par `/feature <enfant>` (1 → 7).
   - Ticket parent dont les enfants ne sont pas tous validés en 7 → donne leur avancement (`voir <ID>`, champ `lot`) et
     termine ton tour. Tous validés en 7 → étape **8 · Livraison groupée** par le devops (`fusionner --ticket <ID>`).
   - Sinon → l'étape inscrite. Si le dernier commentaire est `Validé par le CEO · Étape suivante : <n>`, c'est l'étape <n>.
     Si l'étape est en cours avec une demande de correction du CEO, refais-la avec cette remarque.
4. **L'étape de cette session** :
   - `maj <ID> --statut … --etape "<n> · <nom>" --agent <agent>` ;
   - lance un **nouvel** agent du rôle prévu, mission courte : `Filiale : <nom> — dossier <chemin>`, `Ticket : <ID>`,
     `Étape : <n> · <nom>`, le mode pour `qa`, et les **chemins** des livrables précédents (jamais leur contenu) ;
   - contrôle le livrable (complet ? conforme à la spec ?) sans le relire en entier, et vérifie la passation sur le ticket ;
   - présente au CEO : 5 lignes max + chemin du fichier + **Valider / Corriger (précisez) / Arrêter** ;
   - « Corriger » → un **nouvel** agent du même rôle, même étape, avec le chemin du livrable et la remarque ;
   - « Valider » → `maj <ID>` à l'étape suivante, `commenter <ID> --auteur directeur --texte "Validé par le CEO · Étape
     suivante : <n> · <nom>"`, puis **termine ton tour** : « Étape validée. Pour continuer à contexte propre :
     `/clear` puis `/feature <ID>` (ou « Lancer » dans le Siège). »
5. Questions : si un agent a posé une question (`questions`), passe le ticket « Bloqué », relaie-la au CEO,
   écris sa réponse en commentaire (`commenter <ID> --auteur CEO --texte "…"`), puis relance l'étape avec un nouvel agent.
6. Bugs remontés en recette : Bloquant ou Majeur → propose `/corriger` (dans une nouvelle session) avant de continuer ;
   Mineur → reste dans la file.
7. Dernière étape validée : ticket « Livré », étape « 9 · Documentation » ; bilan en 5 lignes (livrables, branche,
   bugs ouverts). Aucun push, merge ou déploiement.
