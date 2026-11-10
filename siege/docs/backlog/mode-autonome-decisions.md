# Mode autonome du Siège : décisions du CEO (2026-11-10)

## Objectif
Le Siège exécute et implémente le backlog sans arrêt et sans intervention humaine, sauf quand une décision dépasse le seuil de criticité.

## Décisions
1. **Criticité** : un agent-modèle calcule le taux de criticité de chaque décision. La règle de base est fixe (décisions touchant garde, github, droits, secrets ou fusion : 100 %). Le modèle ne s'écarte de cette base que pour les exceptions. Seuil : au-delà de 90 %, le ticket passe en attente et le directeur prend le suivant.
2. **Fusion** : le mode autonome peut fusionner dans `main` si le taux est sous 90 % et que les feux `agents/revue` et `agents/securite` sont verts. C'est une dérogation à la règle « rien en production sans accord du CEO ». Elle doit être reportée dans `process/` et dans `CLAUDE.md` avant d'être activée.
3. **Parallélisme** : autant d'instances de dev que la machine peut supporter, avec une marge de sécurité. La limite est dynamique (charge CPU et mémoire mesurées), et non un nombre fixe.

4. **Isolation** : chaque agent travaille dans son propre git worktree, sur sa propre branche (`feature/…` ou `fix/…`). Deux instances ne partagent jamais le même répertoire de travail.

## Rôle du directeur
Le directeur orchestre : il choisit le ticket suivant dans `file`, répartit les missions entre les agents et suit les instances. Les agents dev peuvent tourner en plusieurs instances, chacune dans sa propre copie de travail.

## Affichage
Le Bureau montre toutes les instances de tous les modèles, en cours et terminées.

## Prérequis techniques
- Branchement de la file d'exécutions (EIA-007) au serveur, pour suivre les instances.
- Isolation de chaque instance dans sa copie de travail (EIA-008 ou équivalent).
- Mesure de la charge machine pour la limite dynamique.

## Premier lot proposé
Boucle autonome du directeur sur une seule instance, criticité à règles fixes, ouverture de PR sans fusion. La fusion automatique et le parallélisme viennent dans des lots suivants.

## Rapport du directeur (demande du CEO, 2026-11-10)
Le directeur rédige un rapport pour chaque tâche validée et fusionnée. S'il manque des détails, il peut demander aux
agents responsables de les fournir. Le rapport est écrit dans `docs/rapports/<ID>-directeur.md` : ticket, branche,
fichiers modifiés, taux de criticité et son motif, instance, résultat des tests, décision de fusion, questions posées
aux agents et leurs réponses. Lot 1 : le rapport est produit à partir des données de la boucle ; la demande de
détails aux agents viendra dans un lot suivant.

## Articulation avec ADR-001 (questions du product-owner)
- ADR-001 (statut « Proposé ») : le product-owner découpe les specs, et un juge externe (Codex, autre famille de modèles) note les réponses aux questions ouvertes. Seuil de 80 pour retenir une réponse ; désaccord ou panne = escalade au CEO.
- Ce document : le taux de criticité d'une tâche du mode autonome, seuil de 90 %. C'est un autre seuil, sur une autre décision : ne pas les confondre.
