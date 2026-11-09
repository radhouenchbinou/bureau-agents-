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

## Variantes

- **Ticket Groupe (`GRP-…`)** : 0 → 2 (l'architecte écrit le contrat dans `portfolio/interfaces.md` et la
  décision dans `portfolio/decisions/`) → 6 (le reviewer relit le contrat) → Livré.
- **Circuit court** (petit changement sans impact métier, sur accord du CEO) : 0 → 1 → 4 → 6 → 7 → Livré.
- **Bug** : voir `/corriger` : 0 → 4 (correction + test qui reproduit) → 5 (le testeur vérifie) → 6 → Fermé.

## Boucles

- Un bug **Bloquant** ou **Majeur** remonté en étape 5 : la feature reste « En cours » ; le directeur
  enchaîne sur `/corriger` de ce bug, puis reprend la recette. Un bug **Mineur** est rangé dans la file.
- « CHANGEMENTS DEMANDÉS » en 6 ou « NO-GO » en 7 : retour à l'étape 4 (même dev), puis on repasse
  uniquement les étapes concernées.
- Une question ouverte au CEO (commentaire `--question`) met le ticket « Bloqué » jusqu'à la réponse.

## Identifiants

`<PRÉFIXE>-001` pour une feature (préfixe de la filiale dans `portfolio/filiales.md`, `GRP` pour le
groupe) ; `BUG-001` pour un bug. L'outil attribue l'identifiant suivant à la création.
