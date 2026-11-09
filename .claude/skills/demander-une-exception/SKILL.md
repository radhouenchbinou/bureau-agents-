---
name: demander-une-exception
description: Que faire quand la garde du Siège refuse une action (commande, écriture, lecture, accès web) nécessaire à ta tâche - demander une exception justifiée au directeur, jamais contourner.
---
# Demander une exception

L'environnement est fermé : chaque rôle n'a que les droits de son métier. Un refus de la garde n'est pas
une panne, c'est une règle.

## Quand tu es refusé
1. Demande-toi si l'action est **vraiment nécessaire** à ta tâche. Souvent une autre voie autorisée existe
   (un outil d'écriture au lieu d'une redirection, l'outil backlog au lieu du fichier, `git -C` au lieu de `cd`).
2. Si elle est nécessaire : **arrête-toi** et termine ta réponse au directeur par un bloc :
   ```
   DEMANDE D'EXCEPTION
   Type : bash | ecriture | lecture | web | outil   (repris du message de refus)
   Motif : <la commande, le chemin ou le domaine exact, le plus étroit possible>
   Justification : <pourquoi c'est indispensable à <ID>, ce que tu feras avec, ce qui se passe sans>
   ```
3. Le directeur l'enregistre, le CEO accorde ou refuse, le directeur l'active et te relance.
   L'exception se ferme **automatiquement** quand tu termines cette tâche.

## Interdit
- Chercher un contournement (autre commande équivalente, script qui fait la même chose, autre chemin).
- Élargir le motif au-delà du besoin (`npm *` au lieu de `npm install left-pad`).
- Réessayer la même action en boucle.
