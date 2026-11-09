---
name: passation
description: Terminer une tâche à contexte propre - laisser une passation courte sur le ticket et rendre un compte rendu de 10 lignes au directeur, pour que l'étape suivante reparte de zéro sans relire toute l'histoire.
---
# Passation : finir une tâche à contexte propre

Chaque tâche se fait dans un contexte neuf, et chaque contexte s'arrête avec la tâche : l'agent suivant (ou toi,
relancé sur une correction) ne voit **rien** de ce que tu as lu ou essayé. Ce qui doit survivre passe par les fichiers et
par le ticket. C'est ce qui économise les jetons : personne ne transporte l'historique des autres.

## En commençant
- Lis seulement ce que la mission cite : la fiche de la filiale, le ticket, **la dernière passation**
  (`node siege/backlog.js commentaires <ID>`) et les fichiers listés. Pas de lecture « au cas où » de tout le dépôt :
  cherche (Grep, Glob) puis lis la partie utile d'un fichier.
- Une correction demandée par le CEO arrive avec le chemin du livrable et la remarque : pars du fichier, pas d'un souvenir.

## En terminant (obligatoire, avant ton dernier message)
1. **Livrable dans un fichier** (spec, ADR, rapport, code) : c'est lui qui fait foi, pas ton message.
2. **Passation sur le ticket**, 6 lignes au plus :
   ```
   node siege/backlog.js commenter <ID> --auteur <ton-nom> --texte "Passation · Fait : … · Livrables : <chemins> · Décisions : … · Reste : … · Attention : …"
   ```
   Seulement ce dont l'étape suivante a besoin. Pas de récit de ce que tu as essayé.
3. **Compte rendu au directeur : 10 lignes au plus** — verdict (fait / bloqué / question), chemins des livrables,
   points à valider par le CEO. Ne recopie jamais le contenu d'un fichier, d'un diff ou d'une sortie de commande :
   donne le chemin. Le directeur garde ton message dans son contexte ; ton fichier, non.

Ensuite tu t'arrêtes : une autre tâche, même proche, sera confiée à un nouvel agent.
