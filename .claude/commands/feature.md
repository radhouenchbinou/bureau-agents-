---
description: Faire passer une feature par le circuit complet de l'entreprise, avec validation du CEO à chaque étape
argument-hint: [ID de feature, ou demande en texte libre]
---
Demande : $ARGUMENTS

1. Lis `process/workflow-feature.md` et `portfolio/filiales.md`.
2. Trouve le ticket :
   - aucun argument → le premier ticket feature de `node siege/backlog.js file` ;
   - un ID → `node siege/backlog.js voir <ID>` (refuse s'il dépend d'une feature non livrée) ;
   - un texte libre → crée d'abord le ticket (`creer feature --filiale … --titre …`) après accord du CEO.
   Lis aussi `node siege/backlog.js commentaires <ID>` (réponses du CEO, historique).
3. **Étape 0 — cadrage** : filiale(s), impact inter-filiales, circuit (complet, court, ou Groupe).
   Crée une liste de tâches avec les étapes retenues. Demande validation.
4. Pour chaque étape suivante :
   - mets à jour le ticket : `maj <ID> --statut … --etape "<n> · <nom>" --agent <agent>` ;
   - délègue à l'agent prévu, en tête de mission : `Filiale : <nom> — dossier <chemin>`, `Ticket : <ID>`,
     le mode pour `qa`, et les chemins des livrables précédents ;
   - relis le livrable (complet ? conforme à la spec ?) et vérifie que l'agent a commenté le ticket ;
   - présente au CEO : 5 lignes max + chemin du fichier + **Valider / Corriger (précisez) / Arrêter** ;
   - n'avance qu'après « Valider ». Sur « Corriger », renvoie au même agent avec la remarque.
5. Questions : si un agent a posé une question (`questions`), passe le ticket « Bloqué », relaie-la au CEO,
   écris sa réponse en commentaire (`commenter <ID> --auteur CEO --texte "…"`), puis reprends.
6. Bugs remontés en recette : Bloquant ou Majeur → propose `/corriger` avant de continuer ; Mineur → reste
   dans la file.
7. Fin : ticket « Livré », étape « 9 · Documentation » ; bilan en 5 lignes (livrables, branche, bugs ouverts).
   Aucun push, merge ou déploiement.
