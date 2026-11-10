# Circuit d'une feature

Chaque étape se termine par une **porte de validation CEO** (🔒). À chaque étape, le directeur met à jour
le ticket (`--statut`, `--etape`, `--agent`) et l'agent laisse un commentaire de suivi sur le ticket.

| # | Étape | Agent | Livrable | Statut du ticket |
|---|---|---|---|---|
| 0 | Cadrage | Directeur | Filiale(s), impact inter-filiales oui/non, circuit complet ou court | À faire |
| 1 | Spécification | `product-owner` | `docs/backlog/<ID>-<slug>.md` : user story, règles métier, critères d'acceptation 🔒 | → Spécifiée |
| 2 | Conception | `architecte` | ADR dans `docs/adr/` (+ `portfolio/interfaces.md` si inter-filiales) 🔒 | En cours |
| 3 | Plan de tests | `qa` (mode plan) | Section « Plan de tests » ajoutée à la spec 🔒 | En cours |
| 4 | Développement | `dev-backend` puis `dev-frontend` (si écran) | Code + tests, branche `feature/<ID>`, commit 🔒 | En cours |
| 5 | Recette | `qa` (mode recette) | `docs/rapports/<ID>-qa.md` ; **un ticket Bug par anomalie** 🔒 | En cours |
| 6 | Revue de code | `reviewer` | `docs/rapports/<ID>-review.md` 🔒 | → En revue |
| 7 | Sécurité | `rssi-devsecops` | `docs/rapports/<ID>-secu.md` : GO / NO-GO 🔒 | En revue |
| 8 | Livraison | `devops` | Pipeline / conteneur / procédure, **pas de déploiement** 🔒 | En revue |
| 9 | Documentation | `tech-writer` | Doc HTML de la filiale 🔒 | → Livré |

Chaque mission confiée à un agent commence par `Filiale : <nom> — dossier <chemin>`, puis
`Ticket : <ID>`, le mode pour `qa`, et les chemins des livrables précédents.

## Étapes désactivées

Le CEO peut désactiver une ou plusieurs étapes (1 à 9) pour un ticket, dans la fiche du ticket du Siège (cases « Étapes
du circuit ») : par exemple pas de plan de tests (3) ni de recette (5) pour un petit changement. L'étape 0 (cadrage)
reste obligatoire. Le directeur saute une étape désactivée : l'étape suivante est `node siege/backlog.js suivante <ID>
--apres <n>`. La garde refuse aussi une mission dont l'étape est désactivée (`node siege/backlog.js etapes <ID>`).
Désactiver la revue (6) ou la sécurité (7) reste possible, mais le Siège le signale : c'est une décision à assumer.

## Variantes

- **Ticket Groupe (`GRP-…`)** : 0 → 2 (l'architecte écrit le contrat dans `portfolio/interfaces.md` et la
  décision dans `portfolio/decisions/`) → 6 (le reviewer relit le contrat) → Livré.
- **Circuit court** (petit changement sans impact métier, sur accord du CEO) : 0 → 1 → 4 → 6 → 7 → Livré.
- **Bug** : voir `/corriger` : 0 → 4 (correction + test qui reproduit) → 5 (le testeur vérifie) → 6 → Fermé.

## Feature sur plusieurs filiales (un repo par filiale)

Une feature qui touche plusieurs filiales se découpe en un **ticket parent** (souvent `GRP-…`) et **un ticket enfant
par filiale** (`creer feature --filiale <Nom> --parent <PARENT> --dependances <producteur>`), décidés au cadrage.
- Parent : 0 Cadrage → 2 Conception (l'architecte écrit le contrat dans `portfolio/interfaces.md`) → attente des
  enfants → **8 Livraison groupée** → 9 Documentation. Une fois la conception validée, le parent est mis à
  « 8 · Livraison » : ses enfants qui dépendent de lui deviennent prêts dans la `file` (pour eux, dépendre du parent
  veut dire « contrat validé », pas « livré »).
- Chaque enfant suit 1 → 7 dans sa filiale, avec sa branche et **sa PR inscrite sur son ticket**
  (`github.js pr … --ticket <ID>`). Il s'arrête à 7 : pas de fusion seule (l'outil la refuse).
- 8 sur le parent, quand tous les enfants sont validés en 7 : le devops lance
  `node siege/github.js fusionner --role devops --ticket <PARENT>`. Chaque PR est vérifiée (approbation du CEO,
  revue, sécurité, pas de conflit) avec un jeton limité à son repo ; **s'il en manque une, rien n'est fusionné**.
  Sinon, fusion dans l'ordre des dépendances (producteur d'abord) et chaque enfant passe à « 8 · Livraison ».
- Si une fusion échoue en cours de route (main déplacée, conflit apparu), l'outil s'arrête, met le parent « Bloqué »
  et note exactement ce qui est fusionné ou non : le CEO décide (corriger et relancer, ou revert).

## Contexte propre

Chaque étape se fait dans une nouvelle session du directeur et chaque tâche dans un nouvel agent : rien ne passe de
l'une à l'autre en mémoire. Le relais, c'est le livrable (fichier), la **passation** de l'agent sur le ticket
(skill `passation`) et le commentaire `Validé par le CEO · Étape suivante : <n> · <nom>`. Une mission porte toujours
`Ticket : <ID>` et `Étape : <n> · <nom>` ; la garde refuse dans une même session une mission d'une autre étape,
la reprise d'un agent (`SendMessage`) et le `fork`.

## Boucles

- Un bug **Bloquant** ou **Majeur** remonté en étape 5 : la feature reste « En cours » ; le directeur
  fait `/corriger` de ce bug (nouvelle session), puis la recette reprend dans une autre. Un bug **Mineur** est rangé dans la file.
- « CHANGEMENTS DEMANDÉS » en 6 ou « NO-GO » en 7 : retour à l'étape 4 (un nouveau dev, avec le rapport de revue
  ou de sécurité), puis on repasse uniquement les étapes concernées.
- Une question ouverte au CEO (commentaire `--question`) met le ticket « Bloqué » jusqu'à la réponse.

## Identifiants

`<PRÉFIXE>-001` pour une feature (préfixe de la filiale dans `portfolio/filiales.md`, `GRP` pour le
groupe) ; `BUG-001` pour un bug. L'outil attribue l'identifiant suivant à la création.
