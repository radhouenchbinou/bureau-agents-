# Entreprise IA — diagnostic et conception préliminaire

Nov 9, 2026 · @Radhouen Chbinou

## Synthèse

Le dépôt est un bon socle d'organisation (rôles, backlog, garde, circuit en 10 étapes, livraison groupée), mais il s'arrête à la fusion dans `main` et repose sur des consignes là où un pilote réel exige des contrôles techniques. Inspection en lecture seule de `bureau-agents-` au commit `f91a2bb`.

Cinq défauts sont à corriger avant tout pilote, indépendamment des nouvelles fonctionnalités :

1. **Fusion de PR trop permissive** : n'importe quel compte humain qui approuve suffit, l'approbation n'est pas liée au dernier commit, et les contrôles CI (check runs) ne sont pas lus.
2. **Usurpation possible du CEO** : un agent peut commenter « en tant que CEO » en répétant `--auteur` (vérifié sur la garde), et le directeur peut le faire directement.
3. **Transitions non contrôlées** : statut et étape s'écrivent librement ; le directeur ou le PO peuvent passer un ticket à « Livré » sans preuve.
4. **Stockage du backlog local non sûr entre processus** : la file d'écriture est propre à chaque processus, donc le Siège et les agents peuvent s'écraser mutuellement.
5. **Garde = filtre, pas isolation** : un agent qui peut écrire du code et lancer `npm test` exécute ce qu'il veut ; seule la sandbox de Claude Code (V1) limite réellement le réseau, et elle peut être désactivée depuis l'interface.

Les manques les plus structurants pour une startup sont ensuite : pas de notion d'exécution distincte du ticket, pas d'environnement ni de déploiement, pas d'exploitation, pas de mesure de coût ni de valeur.

## Diagnostic par axe

Légende : **Impl.** = imposé par le code ; **Partiel** = code incomplet ; **Consigne** = décrit dans un `.md` d'agent, de skill ou de process, sans contrôle ; **Absent**.

| Axe | État | Ce qui existe (références) | Ce qui manque |
| --- | --- | --- | --- |
| 1. Cadrage produit | Consigne | Skill user story INVEST (`.claude/skills/ecrire-une-user-story/SKILL.md:18`) ; rang et dépendances en code (`siege/lib/backlog.js:99-130`) | Problème utilisateur, hypothèse, indicateur de succès, effort / valeur / risque : aucun champ ; dette et incidents absents du backlog |
| 2. Gouvernance | Partiel | Porte CEO à chaque étape (`CLAUDE.md`, `process/workflow-feature.md:3`) ; circuit court « sur accord du CEO » (`workflow-feature.md:23`) | Un seul humain ; pas de circuit selon le risque ; décision non tracée (qui, quelle version) ; validation = texte dans la conversation |
| 3. Exécution des agents | Partiel | Demandes : file d'attente, une session à la fois, plafond, délai 10 min (`siege/lib/messagerie.js:147-160`, `:210-212`) ; liaison session → étape (`siege/lib/garde.js:161-171`) ; journal (`siege/garde.js:11-14`) | Pas d'identifiant d'exécution ; file en mémoire perdue au redémarrage (`messagerie.js:36`) ; `SIGTERM` au seul parent ; pas de worktree, de verrou de dépôt, de reprise ni d'anti-doublon |
| 4. Qualité GitHub | Partiel | Jeton App par rôle et par repo (`siege/lib/github.js:66-70`) ; feux posés sur le SHA de tête (`siege/github.js:60-61`) ; fusion avec `sha` imposé (`github.js:71`) | Approbateur non vérifié, approbation non liée au commit, check runs ignorés (voir Risques) ; aucune vérification de la protection de branche |
| 5. Livraison | Consigne | DevOps « prépare, ne déploie jamais » (`.claude/agents/devops.md:23`) ; fusion groupée tout-ou-rien en vérification, échec partiel signalé (`siege/github.js:79-103`) | Environnements, artefacts, staging, production, vérification, retour arrière ; « Livré » = doc écrite, pas « en production » |
| 6. Exploitation | Absent | — | Catalogue de services, santé, alertes, incidents, sauvegardes |
| 7. Coûts | Partiel | Plafond de sessions automatiques par jour (`messagerie.js:152`) ; modèles activables (`siege/lib/moteurs.js:77-85`) | Aucune mesure de jetons, durée ou coût ; le plafond compte des sessions, pas de l'argent |
| 8. Accès humain | Impl. (local) | Écoute 127.0.0.1, contrôle d'origine et jeton CSRF (`siege/server.js:49`, `:310-311`) | Ni comptes, ni rôles humains, ni audit nominatif |
| 9. Stockage | Partiel | Écriture atomique par renommage (`backlog.js:200-208`) ; verrous fichiers inter-processus pour demandes et exceptions (`siege/lib/demandes.js:21-35`, `siege/lib/exceptions.js:20-30`) | Backlog local sans verrou inter-processus ; identifiants calculés en lisant la liste (`siege/backlog.js:114`) donc collisions possibles, y compris sur Notion et Jira ; limite à 999 tickets par préfixe (`backlog.js:9`) |
| 10. Workflow et preuves | Consigne | Étapes listées (`backlog.js:7-8`) ; machine d'états réelle pour les demandes (`demandes.js:82-102`) | Aucune transition contrôlée pour les tickets (`backlog.js:213-216`, `siege/backlog.js:118-121`) ; pas de preuve attachée |
| 11. Sécurité | Partiel | Garde fail-closed (`siege/garde.js:71`) ; zones protégées, secrets illisibles (`garde.js:115-127`) ; sandbox réseau V1 (`siege/lib/parametres.js:42-47`) ; exceptions tracées | Garde contournable par le code exécuté ; usurpation par `--auteur` ; exceptions liées au rôle, pas à la tâche ; sandbox désactivable (`parametres.js:82`) ; pas de filtrage des données envoyées aux modèles |
| 12. Responsabilités | Absent | Méthodes écrites pour dev, PO et QA (`process/roles/`), les autres rôles dans leur fiche d'agent | Produit et UX, SRE, données |
| 13. Pilotage | Partiel | Compteurs du Siège (livrées, bugs, questions, exceptions) ; journal des missions | Délais, attente des validations, taux de reprise, défauts après livraison, DORA, coût |

Tests : 15 fichiers dans `siege/test/`, tous contre de fausses API (Notion, Jira, GitHub, Telegram, Slack, Teams). Ils prouvent la logique, pas le comportement réel des services ni des agents.

## Risques et incohérences vérifiés

Chaque point a été lu dans le code ; ceux marqués « essayé » ont été rejoués sur la garde (`decider`), sans rien modifier.

| # | Constat | Référence | Gravité | Type |
| --- | --- | --- | --- | --- |
| R1 | `fusionnable()` accepte l'approbation de **tout** compte `User`, pas d'un approbateur autorisé | `siege/lib/github.js:86-87` | Haute | Défaut |
| R2 | L'approbation n'est pas comparée au `commit_id` du SHA de tête : une approbation ancienne vaut pour un nouveau push, sauf si GitHub l'écarte (réglage « Dismiss stale approvals », non vérifié) | `github.js:85-87` | Haute | Défaut |
| R3 | Seuls `agents/revue` et `agents/securite` sont lus, via l'API des statuts ; les check runs (GitHub Actions) sont ignorés, donc une CI rouge n'empêche pas la fusion | `github.js:88-92` | Haute | Défaut |
| R4 | `mergeable === null` (pas encore calculé) passe ; avis non paginés au-delà de 100 | `github.js:85`, `:93` | Moyenne | Défaut |
| R5 | Le feu de revue est posé sur le SHA de tête **au moment de l'appel**, pas sur le SHA relu : un push entre la relecture et le feu passe | `siege/github.js:60-61` | Moyenne | Défaut |
| R6 | Usurpation : `commenter X --auteur qa --texte … --auteur CEO` est autorisé (essayé) ; le dernier `--auteur` gagne (`siege/backlog.js:22`, `:126`). Même motif pour `--role` dans `github.js pr` | `droits/roles.json:29`, `:143` | Haute | Défaut |
| R7 | Le directeur peut écrire `--auteur CEO` et `maj … --statut Livré` (essayé) ; le PO aussi pour le statut (essayé) | `droits/roles.json:70`, `:92` | Haute | Défaut |
| R8 | File d'écriture du backlog local propre à chaque instance : Siège + agents = mises à jour perdues | `siege/lib/backlog.js:170`, `:189`, `:198-209` | Haute | Défaut |
| R9 | Identifiant = maximum lu + 1, sans réservation : deux créations simultanées donnent le même ID (fichiers, Notion, Jira) | `siege/backlog.js:114` | Moyenne | Défaut |
| R10 | Exceptions liées au **rôle**, pas à la tâche : deux `dev-backend` en parallèle partagent l'exception, et la fin de l'un la ferme pour l'autre | `siege/lib/exceptions.js:59-63`, `siege/garde.js:50-51` | Moyenne | Défaut |
| R11 | La garde filtre les commandes, mais `npm test`, `python3 projets/x.py` ou `mvn test` exécutent du code que l'agent a lui-même écrit : seul le bac à sable système isole réellement | `droits/roles.json:134-139` | Haute | Limite de conception |
| R12 | Le bac à sable peut être désactivé depuis l'interface ; l'édition Copilot n'en a pas | `siege/lib/parametres.js:44`, `:82` | Haute | Limite |
| R13 | File des sessions de demandes en mémoire ; `kill` du seul parent, pas du groupe de processus | `siege/lib/messagerie.js:36`, `:212` | Moyenne | Défaut |
| R14 | Méthodes de rôle écrites pour dev, PO et QA seulement (`process/roles/`) ; architecte, reviewer, RSSI, devops et rédacteur n'ont que leur fiche d'agent et leurs skills | `process/roles/` | Faible | Incohérence |
| R15 | État « Livré » = après la documentation ; aucun lien avec un déploiement | `process/workflow-feature.md:16` | Haute | Manque |

La livraison groupée est déjà honnête sur un point : elle vérifie tout avant de fusionner, puis bloque le parent et décrit l'état exact si une fusion échoue en route (`siege/github.js:99-102`). Ce n'est pas une transaction, et rien ne garantit la compatibilité entre services pendant le décalage.

## Conception préliminaire

Principe : garder le Siège comme **chef d'orchestre déterministe** et faire des agents des exécutants. Toute transition, approbation et preuve passe par du code ; les agents produisent des livrables, jamais des décisions. Rien n'est figé avant vos réponses ; les hypothèses sont marquées **(H)**.

### Parcours d'une demande

1. **Demande** (Siège, Teams ou backlog) → cadrage : problème, hypothèse, indicateur de succès, valeur / effort / risque, **classe de risque**.
2. **Classe de risque** → circuit : *simple* (CI + 1 revue humaine), *habituel* (spec, plan de tests, revue, CI), *sensible* (paiement, auth, données personnelles, infra, migration : + revue sécurité humaine, plan de retour arrière, approbation du déploiement).
3. **Exécutions** d'agents dans un worktree dédié, une par étape, avec état persistant, délai et budget.
4. **PR** → CI requise sur le dernier commit + approbation d'un humain habilité sur ce commit.
5. **Fusion** → artefact versionné → **staging** → recette → **approbation de déploiement** → **production** → vérification de santé.
6. **Clôture** = en production, vérifié, retour arrière documenté ; puis **mesure** de l'indicateur à J+N.

### Composants : garder, faire évoluer, ajouter

| Composant | Décision | Évolution |
| --- | --- | --- |
| Siège (`siege/server.js`) | Garder | Devient le seul écrivain des transitions ; accès partagé selon votre réponse Q3 |
| Backlog (`siege/lib/backlog.js`) | Faire évoluer | Champs de cadrage, classe de risque ; transitions contrôlées comme dans `demandes.js` |
| Garde (`siege/lib/garde.js`) | Garder, corriger | Analyse des options sans doublon ; exceptions liées à l'exécution ; reste une couche de politique, pas d'isolation |
| Isolation | Ajouter | Conteneur par exécution (réseau fermé sauf liste) en plus de la garde **(H)** |
| Exécutions | Ajouter | Moteur généralisé à partir de la file des demandes (`messagerie.js:147-160`) |
| GitHub (`siege/lib/github.js`) | Corriger | Approbateurs autorisés, `commit_id` = tête, check runs requis, protection de branche vérifiée |
| Livraison (`siege/lib/livraison.js`) | Faire évoluer | Fusion → déploiement par la CI existante du produit **(H)**, pas par un agent |
| Exploitation | Ajouter, minimal | Fiche service, santé, alerte, incident, sauvegarde testée |
| Mesure | Ajouter | Coût et durée par exécution, délais par ticket, 4 indicateurs DORA |

### Modèle de données minimal

| Entité | Champs clés | Rôle |
| --- | --- | --- |
| Ticket | id, type (feature, bug, dette, incident), problème, hypothèse, indicateur, valeur, effort, risque, classe, état | Le besoin, une seule source de vérité pour l'état |
| Transition | ticket, de, vers, acteur, motif, preuves, version (SHA), date | Historique ajout seul ; seule voie pour changer l'état |
| Exécution | id, ticket, étape, agent, moteur, modèle, SHA de départ, worktree, état, essai n, début, fin, jetons, coût, erreur, passation | Une tentative d'un agent |
| Approbation | objet (spec, PR, déploiement), version approuvée (SHA ou hash), personne, rôle humain, date, origine | Invalidée dès que la version change |
| Preuve | type (CI, test, scan, revue), lien, SHA, résultat | Rattachée au commit |
| Déploiement | service, environnement, version, artefact, déclenché par, résultat, santé, retour arrière | Historique des mises en production |
| Service | nom, repo, responsable, dépendances, santé, alertes | Catalogue minimal |
| Personne | identité, rôles humains (CEO, produit, tech lead, dev, approbateur de déploiement) | Pour l'audit et la délégation |

Quand le backlog est dans Jira ou Notion, ils restent la vue de travail des humains ; l'état de workflow, les approbations et les preuves restent dans le Siège, qui recopie l'état vers Jira. Un seul moteur de workflow.

### Frontières de sécurité

| Frontière | Contrôle technique visé | Aujourd'hui |
| --- | --- | --- |
| Agent → machine | Conteneur ou VM par exécution, réseau en liste blanche | Garde + sandbox V1 désactivable |
| Agent → workflow | Pas d'écriture d'état ; seulement « livrable prêt » + preuves | `maj` libre |
| Agent → identité humaine | Auteur imposé par le processus, jamais par un argument | `--auteur` usurpable |
| PR → main | Protection de branche + vérification par le Siège des approbateurs et du SHA | Partiel |
| main → production | Approbation de déploiement par un humain habilité, liée à la version | Absent |
| Données → modèles | Pas de données de production dans les worktrees ; secrets hors du contexte | Secrets illisibles par la garde seulement |
| Tickets, messages → agents | Contenu traité comme donnée ; actions sensibles jamais décidées par un agent | Consigne |

## Décisions structurantes

Cinq décisions changent l'architecture. Les recommandations sont provisoires : elles dépendent de vos réponses.

**D1. Stockage de l'état du Siège**

| Option | Avantages | Limites | Coût |
| --- | --- | --- | --- |
| Fichiers JSON + verrou inter-processus | Aucun changement d'outillage ; modèle déjà utilisé pour demandes et exceptions | Pas de requêtes ni de transactions multi-objets ; fragile au-delà d'une machine | Faible |
| **SQLite (`node:sqlite`, mode WAL)** | Transactions, identifiants sûrs, historique requêtable, un seul fichier à sauvegarder | Une seule machine ; `node:sqlite` récent (Node 22.5+) | Moyen |
| PostgreSQL | Multi-utilisateurs, hébergeable, sauvegardes gérées | Un service de plus à exploiter et payer | Plus élevé |

Recommandation : SQLite si le Siège reste sur une machine (local ou VM d'équipe) ; PostgreSQL seulement si plusieurs instances écrivent. Correction immédiate dans tous les cas : verrou inter-processus sur le backlog local.

**D2. Mode d'usage**

| Option | Avantages | Limites | Coût |
| --- | --- | --- | --- |
| Local, un responsable technique | Rien à sécuriser côté réseau ; déjà en place | Un seul valideur, dépend de son poste allumé | Faible |
| **VM d'équipe privée** (accès par VPN ou proxy d'identité type SSO) | Validations déléguées, poste toujours allumé pour les agents, audit nominatif | Comptes, rôles humains, sessions et révocation à construire | Moyen |
| Application SaaS multi-équipes | Multi-projets cloisonnés | Disproportionné pour une startup | Élevé |

Recommandation provisoire : local pour le pilote, VM privée derrière l'authentification de l'entreprise pour l'usage d'équipe. Jamais par un simple changement d'adresse d'écoute.

**D3. Isolation des agents**

| Option | Avantages | Limites | Coût |
| --- | --- | --- | --- |
| Garde + sandbox de Claude Code (actuel) | Existe ; bloque le réseau en V1 | Désactivable ; absente avec Copilot ; même machine que les secrets | Faible |
| **Conteneur par exécution** (worktree monté, réseau en liste blanche, sans secrets) | Isolation réelle quel que soit le moteur ; nettoyage garanti | Image à maintenir ; Docker requis | Moyen |
| VM éphémère par exécution | Isolation maximale | Lent et coûteux | Élevé |

Recommandation : conteneur par exécution dès que les agents touchent un vrai produit.

**D4. Déploiement**

| Option | Avantages | Limites | Coût |
| --- | --- | --- | --- |
| **La CI/CD du produit déploie ; le Siège déclenche, attend et enregistre** | Réutilise votre chaîne, secrets hors des agents, traçable | Dépend de votre CI existante | Faible à moyen |
| L'agent DevOps déploie lui-même | Autonomie | Secrets de production exposés à un agent ; difficile à auditer | Risqué |

Recommandation : première option, sans exception pour le pilote.

**D5. Approbations**

| Option | Avantages | Limites | Coût |
| --- | --- | --- | --- |
| Porte CEO à chaque étape (actuel) | Contrôle maximal | Goulot : 10 validations par feature | — |
| **Portes selon la classe de risque** | 2 à 3 portes humaines pour un changement simple, davantage pour un sensible | Règles de classement à écrire et à contrôler | Moyen |

Recommandation : portes par classe de risque, chaque approbation liée à la version approuvée (SHA ou hash du livrable).

## Questions de cadrage

Le dépôt ne dit rien de votre produit ni de votre équipe : ces sept réponses décident du stockage, de l'isolation, des portes et du périmètre du pilote. Répondez librement, une ligne suffit par question.

1. **Produit et stack** — Quel produit (web, mobile, API), quelle stack, où est-il hébergé, et combien de dépôts ? *Impact* : image d'isolation, commandes de test, mode de déploiement, besoin réel de livraison multi-dépôts.
2. **Équipe et responsabilités** — Combien de personnes, et qui porte CEO, produit, CTO / tech lead, développement, approbation des déploiements ? *Impact* : rôles humains, délégation, nombre de portes. Choix : (a) 1 personne porte tout, (b) 2-3 personnes, (c) 4 et plus.
3. **Local ou partagé** — Le Siège sert-il une personne ou toute l'équipe ? Avez-vous un SSO (Google Workspace, Microsoft Entra) ou un VPN ? *Impact* : D1 et D2, authentification et audit. Recommandation : local pour le pilote, VM privée ensuite.
4. **Outillage existant** — GitHub.com ou Enterprise ; CI (Actions ou autre) déjà requise sur `main` ; un staging existe-t-il ; où vit le backlog (Jira, Notion, autre) ; quelle supervision (logs, alertes) ? *Impact* : ce qu'on réutilise au lieu de construire.
5. **Autonomie souhaitée pour le pilote** — (a) les agents ouvrent des PR, les humains fusionnent et déploient ; (b) fusion automatique des changements simples si CI verte et approbation ; (c) déploiement en staging automatique. *Impact* : portes, droits GitHub, risque. Recommandation : (a), puis (c).
6. **Budget et moteur** — Budget mensuel pour les modèles, et moteur imposé : Claude (API ou abonnement), GitHub Copilot (licences entreprise) ou libre ? *Impact* : édition V1 ou V2, mesure du coût (jetons réels ou seulement durée), plafonds.
7. **Données et disponibilité** — Le produit traite-t-il des données personnelles, de santé ou de paiement ? Le code peut-il être envoyé aux fournisseurs de modèles ? Quelle indisponibilité et quelle perte de données tolérez-vous ? *Impact* : classe « sensible », hébergement, objectifs de reprise, périmètre autorisé du pilote.

Aucune implémentation ne commence avant vos réponses. Ensuite : conception affinée, feuille de route P0 / P1 / P2 (corrections séparées des nouveautés) et proposition de pilote, à valider avant tout développement.

## Workflow générique

Le workflow est le même pour toute entreprise ; ce qui change d'une entreprise à l'autre est de la **configuration**, jamais du code. Le Siège est le seul moteur de workflow : il applique les transitions, les agents produisent des livrables et des preuves, les humains décident aux portes.

### Ce que chaque entreprise configure

| Point de configuration | Contenu | Valeur par défaut |
| --- | --- | --- |
| Personnes et rôles humains | Qui porte chaque rôle ci-dessous ; une personne peut en porter plusieurs | Une seule personne porte tout |
| Règles de risque | Chemins, étiquettes et types de changement qui font monter la classe, par service (`risque.json`) | Auth, paiement, données personnelles, migrations, infra, dépendances = critique |
| Portes | Pour chaque transition et chaque classe : automatique, 1 humain ou 2 humains distincts | Tableau des portes ci-dessous |
| Profils de stack | Image d'exécution, commandes de build, test, lint et scan autorisées | Java / Spring Boot, Node / TypeScript, Python |
| Types d'agents | Rôles d'agents, droits, skills, moteur et modèle | Les 9 rôles actuels |
| Services et environnements | Dépôt, responsable, dépendances, environnements, adaptateur de déploiement, sonde de santé | GitHub Deployments / Actions |
| Outil de backlog | Fichiers, Jira, Notion ou GitHub Issues, synchronisé à sens unique | Fichiers locaux |
| Budgets | Mensuel, par ticket, par exécution ; alerte et arrêt | Non fixé : mesure seule |
| Objectifs de fiabilité | Arrêt et perte de données tolérés par service, seuils de retour arrière | À définir par service |

### Rôles humains

| Rôle | Décide |
| --- | --- |
| Sponsor (CEO) | Priorités, arbitrages, exceptions de droits |
| Responsable produit | Cadrage, spec, acceptation en recette, mesure du résultat |
| Tech lead | Conception, classe de risque contestée, approbation des changements critiques |
| Développeur habilité | Approbation des PR de classe faible et moyenne |
| Responsable sécurité | Revue des changements critiques (peut être le tech lead) |
| Approbateur de déploiement | Mise en production |
| Astreinte | Incidents, retour arrière |

Règle de séparation : pour un changement critique, celui qui approuve n'est ni l'auteur ni l'agent qui l'a produit, et deux humains distincts interviennent si l'entreprise en compte au moins deux.

### États et transitions

Chaque transition enregistre : acteur, conditions vérifiées, preuves, version (SHA ou empreinte du livrable), horodatage, et motif en cas d'échec ou de dérogation.

| État atteint | Condition d'entrée (vérifiée par le Siège) | Livrable ou preuve | Produit par |
| --- | --- | --- | --- |
| Cadré | Problème, hypothèse, indicateur de succès, valeur, effort, classe de risque renseignés | Fiche de cadrage | Agent PO, validé par le responsable produit |
| Spécifié | Critères d'acceptation testables | Spec versionnée | Agent PO |
| Conçu | ADR, contrat d'interface si plusieurs services, plan de retour arrière si critique | ADR versionné | Agent architecte |
| Prêt | Dépendances livrées, plan de tests | Plan de tests | Agent QA |
| En développement | Exécution lancée dans un espace isolé, budget alloué | Branche, commits | Agents dev |
| En revue | PR ouverte, CI verte sur le dernier commit, classe recalculée sur le diff | Rapport de revue, scans, résultats de tests | Agents reviewer et sécurité |
| Fusionné | Approbations requises sur le dernier commit, contrôles requis verts | Commit dans `main` | Siège |
| En staging | Artefact versionné déployé, santé OK | Déploiement enregistré | CD de l'entreprise |
| Recetté | Critères d'acceptation vérifiés en staging | Rapport de recette | Agent QA, validé par le responsable produit |
| En production | Approbation de déploiement sur cette version, sauvegarde vérifiée si migration | Déploiement enregistré | CD de l'entreprise |
| Vérifié | Santé et erreurs dans les seuils pendant la fenêtre d'observation | Mesures de supervision | Siège |
| Clos | Documentation à jour ; indicateur de succès mesuré à J+N | Mesure du résultat | Responsable produit |

États de sortie : *Rejeté*, *Annulé*, *Revenu en arrière* (retour à En développement avec motif). *Bloqué* est un drapeau posé sur n'importe quel état (question ouverte, exception, dépendance), pas un état.

### Portes par classe de risque (valeurs par défaut)

| Transition | Faible | Moyenne | Critique |
| --- | --- | --- | --- |
| → Cadré, Spécifié | Automatique | Responsable produit | Responsable produit |
| → Conçu | Sans objet | Automatique | Tech lead |
| → Fusionné | 1 humain (automatique si l'entreprise l'autorise) | Développeur habilité | Tech lead + responsable sécurité |
| → Recetté | Automatique | Responsable produit | Responsable produit |
| → En production | Approbateur de déploiement | Approbateur de déploiement | Approbateur de déploiement, fenêtre choisie |

Une porte « automatique » reste conditionnée aux preuves de la ligne États et transitions : CI verte, contrôles verts, classe recalculée. Une approbation est invalidée dès que la version approuvée change.

### Types de tickets

| Type | Parcours |
| --- | --- |
| Feature | Tous les états |
| Bug | Cadré (reproduction) → En développement → En revue → Fusionné → staging → production → Vérifié |
| Dette technique | Comme une feature, cadrage centré sur le risque ou le coût évité |
| Incident | Ouvert → Mitigé → Résolu → Compte rendu ; les actions correctives deviennent des bugs ou de la dette |
| Changement multi-services | Un ticket parent (contrat, ordre de déploiement) et un enfant par service ; déploiement producteur d'abord, en version rétrocompatible ; reprise tracée en cas d'échec partiel |

&#91;embedded content: workflow générique · 12 états, portes selon le risque\]

Les sections suivantes (réponses, feuille de route, pilote) sont un **exemple de configuration** de ce workflow pour une entreprise donnée.

## Réponses reçues et conception affinée

Vos réponses confirment un usage réel et exigeant : plusieurs services, une équipe de 4 personnes ou plus, une chaîne CI / staging / déploiement / supervision déjà en place, et des données personnelles, de paiement et de santé.

| Réponse | Ce qu'elle décide |
| --- | --- |
| Plusieurs services | Catalogue des services utile dès P1 ; livraison multi-dépôts par compatibilité (le producteur déploie d'abord une version rétrocompatible), jamais par fusion « atomique » |
| 4 personnes ou plus | Rôles humains distincts et délégation : le CEO ne valide plus chaque étape ; audit nominatif nécessaire |
| Local puis VM | D1 : SQLite pour le pilote (une machine) ; D2 : VM privée derrière le SSO en P1 |
| CI, staging, CD, supervision existants | D4 confirmé : le Siège déclenche et enregistre, votre chaîne déploie ; on lit votre supervision au lieu d'en construire une |
| Autonomie selon le risque calculé | Classe de risque déterministe (ci-dessous) ; automatisme seulement pour la classe faible, humain obligatoire pour les tâches critiques |
| Claude et Copilot permis | Moteurs interchangeables par exécution ; coût réel en jetons pour Claude API, durée et requêtes seulement pour Copilot |
| Données personnelles, paiement, santé | Toute modification qui les touche est critique ; aucune donnée de production dans un worktree ni dans un prompt ; données de test synthétiques ; hébergement de santé certifié HDS à vérifier côté production **(H)** |

### Classe de risque calculée

La classe retenue est la plus haute entre celle déclarée au cadrage et celle calculée sur le diff ; un agent peut la relever, jamais la baisser. Le calcul lit un fichier `risque.json` par service (chemins sensibles), versionné dans le dépôt du service et protégé par CODEOWNERS.

| Classe | Déclencheurs | Fusion | Staging | Production |
| --- | --- | --- | --- | --- |
| Faible | Docs, tests, textes d'interface, code hors zones sensibles, sans migration ni nouvelle dépendance, diff limité | CI verte sur le dernier commit + revue d'agent OK + contrôles déterministes verts + approbation humaine pendant le pilote ; automatique ensuite si les mesures le justifient | Automatique | Approbateur de déploiement (automatique en P2 si les indicateurs le justifient) |
| Moyenne | Fonctionnalité habituelle | CI verte + approbation d'un développeur habilité sur le dernier commit | Automatique | Approbateur de déploiement |
| Critique | Authentification, paiement, données de santé ou personnelles, schéma et migrations, infrastructure, dépendances de sécurité | CI verte + revue sécurité humaine + approbation du tech lead, spec validée par le produit, plan de retour arrière | Automatique, recette humaine | Approbateur de déploiement, fenêtre choisie, vérification renforcée |

Décidé : pour la classe faible, un humain approuve pendant le pilote ; la fusion sans humain viendra après, sur mesures.

## Feuille de route

P0 = nécessaire avant le pilote ; P1 = usage régulier par l'équipe ; P2 = autonomie et optimisation. Effort relatif : S (jours), M (1 à 2 semaines), L (plus). Les corrections de défauts (C) sont séparées des nouvelles fonctionnalités (N).

### P0 · Corrections de défauts existants

| ID | Problème traité | Périmètre | Dépend de | Effort | Risque | Critère d'acceptation vérifiable |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Fusion trop permissive (R1-R4) | `fusionnable()` : approbateurs autorisés, approbation sur le SHA de tête, check runs requis, `mergeable` inconnu = refus, pagination | — | S | Faible | Tests sur faux GitHub : fusion refusée pour un approbateur non habilité, une approbation sur un ancien commit, une CI rouge ou en attente, un `mergeable` nul |
| C2 | Usurpation d'identité (R6, R7) | Option répétée = refus ; auteur et rôle imposés par le contexte de la garde, plus par un argument ; aucun agent ne parle au nom d'un humain | — | S | Faible | `--auteur qa … --auteur CEO` refusé ; directeur `--auteur CEO` refusé ; tests de garde |
| C3 | Mises à jour perdues, identifiants en double (R8, R9) | Verrou inter-processus sur le backlog local ; réservation d'identifiant sous verrou | — | S | Faible | 20 processus créent en parallèle : 20 identifiants distincts, aucune modification perdue |
| C4 | Statuts libres, « Livré » sans preuve (R7, R15) | `maj` ne touche plus statut ni étape ; une commande `transition` vérifie acteur et conditions | C2 | M | Moyen | PO ou directeur ne peut pas passer un ticket à « Livré » ; chaque transition est historisée avec acteur et motif |
| C5 | Exceptions partagées entre exécutions (R10) | Exception liée à l'exécution, fermée à sa fin | N1 | S | Faible | Deux agents du même rôle : l'exception de l'un n'autorise pas l'autre et ne se ferme pas par lui |
| C6 | Feu de revue sur le mauvais commit (R5) | `statut` exige `--sha` = commit relu, refus si la tête a bougé | — | S | Faible | Push entre revue et feu : feu refusé |
| C7 | Isolation désactivable (R12) | Aucune exécution sans isolation en mode pilote | N2 | S | Faible | Lancement refusé si l'isolation n'est pas active |

### P0 · Nouvelles fonctionnalités

| ID | Problème traité | Périmètre | Dépend de | Effort | Risque | Critère d'acceptation vérifiable |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | Pas d'exécution distincte du ticket (axe 3) | Table Exécution en SQLite ; file persistante, 1 exécution par dépôt à la fois, délai, arrêt du groupe de processus, 2 nouveaux essais max, clé anti-doublon (ticket + étape + essai), escalade à un humain ; généralise la file des demandes | — | L | Moyen | Redémarrage du Siège : les exécutions en cours sont reprises ou marquées interrompues, jamais relancées en double |
| N2 | Garde ≠ isolation (R11) | Conteneur par exécution : worktree dédié monté, réseau en liste blanche, aucun secret ni donnée de production | N1 | M | Moyen | Depuis le conteneur, un appel vers un domaine hors liste échoue et `~/.siege` est invisible |
| N3 | Une seule porte pour tout (axe 2) | Classe de risque calculée (`risque.json` + diff), circuits faible / moyen / critique | C4 | M | Moyen | Un diff touchant un chemin de paiement est classé critique même déclaré faible |
| N4 | Approbations non liées à une version (axe 2) | Approbation = personne + rôle humain + version (SHA ou hash du livrable) ; invalidée si la version change | C2, C4 | M | Faible | Spec modifiée après validation : l'étape suivante est bloquée jusqu'à nouvelle validation |
| N5 | Pas de déploiement suivi (axe 5) | Pont avec votre CD : lecture des déploiements staging et production (GitHub Deployments ou équivalent), approbation via les environnements protégés de GitHub **(H)**, vérification de santé lue dans votre supervision, historique | C1 | M | Moyen | Le ticket passe « fusionné » → « en staging » → « en production vérifié » uniquement sur preuves lues, avec SHA et horodatage |
| N6 | Aucune mesure de coût (axe 7) | Par exécution : moteur, modèle, durée, jetons quand le moteur les donne, coût estimé ; budget par ticket avec arrêt au plafond | N1 | S | Faible | Une exécution qui dépasse son budget est arrêtée et escaladée |
| N7 | Données sensibles vers les modèles (axe 11) | Pas de données réelles dans les dépôts de travail ; données de test synthétiques ; scan de secrets avant lancement | N2 | S | Moyen | Un dépôt avec un `.env` ou un dump détecté bloque le lancement |

### P1 · Usage régulier par l'équipe

| ID | Problème traité | Périmètre | Dépend de | Effort | Risque | Critère d'acceptation vérifiable |
| --- | --- | --- | --- | --- | --- | --- |
| N8 | Accès d'équipe (axe 8) | VM privée, authentification par le SSO de l'entreprise, rôles humains, sessions révocables, audit nominatif | N4 | L | Élevé | Un utilisateur sans rôle d'approbateur ne peut pas approuver ; chaque action est attribuée ; révocation effective en moins de 5 min |
| N9 | Cadrage produit (axe 1) | Champs problème, hypothèse, indicateur, valeur, effort, risque ; types dette et incident ; mesure de l'indicateur à J+N | C4 | S | Faible | Un ticket sans indicateur ne passe pas l'étape 1 |
| N10 | Plusieurs services (axe 5) | Catalogue des services (responsable, dépendances, santé) ; ordre de déploiement producteur d'abord ; reprise d'un déploiement partiel | N5 | M | Moyen | Livraison sur deux services interrompue : l'état exact est tracé et la reprise ne redéploie pas ce qui l'est déjà |
| N11 | Incidents (axe 6) | Type de ticket incident (gravité, responsable, mitigation, communication, compte rendu) ; lien vers l'alerte de votre supervision ; test de restauration planifié | N10 | M | Faible | Un incident ouvert affiche responsable, chronologie et compte rendu avant clôture |
| N12 | Pilotage (axe 13) | Délai demande → production, attente des validations, travail en cours, reprises, défauts après livraison, 4 indicateurs DORA, coût par changement accepté | N1, N5, N6 | M | Faible | Chaque indicateur se recalcule à partir des tables Transition, Exécution et Déploiement |
| N13 | Jira ou Notion en parallèle (axe 10) | Synchronisation à sens unique de l'état du Siège vers l'outil ; une modification de statut dans l'outil est signalée, pas appliquée | C4 | M | Moyen | Un statut changé dans Jira ne contourne aucune condition |

### P2 · Autonomie et optimisation

| ID | Problème traité | Périmètre | Dépend de | Effort | Risque | Critère d'acceptation vérifiable |
| --- | --- | --- | --- | --- | --- | --- |
| N14 | Fiabilité des agents non mesurée (axe 4) | Jeu de tâches réelles de référence, rejoué à chaque changement de modèle ou de consigne | N1, N6 | M | Faible | Taux de réussite et coût par tâche publiés par moteur et modèle |
| N15 | Choix du moteur (axe 7) | Moteur et modèle choisis par type de tâche selon coût et réussite mesurés | N14 | S | Faible | Le choix se justifie par les mesures de N14 |
| N16 | Production sans humain pour la classe faible | Seulement si les indicateurs de P1 le justifient ; déploiement progressif et retour arrière automatique sur alerte | N5, N11, N12 | M | Élevé | Retour arrière déclenché automatiquement lors d'un exercice en staging |
| N17 | Feature flags | Seulement si un besoin de découplage déploiement / activation apparaît ; outil existant de préférence | N5 | S | Faible | Une fonctionnalité se désactive en production sans redéploiement |

## Pilote proposé

Le pilote porte sur **une fonctionnalité de classe moyenne, dans un seul service, hors données de santé, de paiement et personnelles**, livrée par le circuit complet après le P0. Objectif : un utilisateur l'utilise en production, son fonctionnement est observable et l'équipe sait revenir en arrière.

Critères de choix de la fonctionnalité (c'est à vous de la désigner, je ne connais pas votre produit) :

- visible par un utilisateur réel, utile, livrable en 1 à 2 semaines par un humain ;
- un seul service, sans migration de données ni nouvelle dépendance ;
- aucun chemin marqué sensible dans `risque.json` ;
- un indicateur d'usage mesurable dans votre supervision ou vos analytics ;
- désactivable ou réversible par redéploiement de la version précédente.

Exemples du bon calibre : un export CSV d'une liste existante, un filtre de recherche supplémentaire, une page d'aide contextuelle.

| Critère de succès | Preuve attendue |
| --- | --- |
| En production et utilisée | Déploiement enregistré (SHA, date, approbateur) + au moins un usage réel mesuré |
| Observable | Santé, erreurs et usage visibles dans votre supervision, lien sur le ticket |
| Retour arrière maîtrisé | Procédure écrite et **exercée en staging**, durée mesurée |
| Circuit respecté | Toutes les transitions, approbations et preuves tracées, aucune dérogation non motivée |
| Coût connu | Durée et coût des exécutions d'agents, temps humain de revue et de validation |

Périmètre minimal du pilote : C1 à C7, N1 à N7. Le reste attend les enseignements du pilote.

## Questions restantes

Un seul point bloque encore le démarrage du pilote :

1. Service et fonctionnalité du pilote, et la stack de ce service.

Déjà tranché le 9 novembre :

- **Code vers les fournisseurs de modèles** : autorisé pour tout le code. Les données réelles restent exclues (N7).
- **Revue des changements de classe faible** : un humain approuve pendant le pilote ; l'agent seul pourra suffire ensuite si les mesures le justifient (N16).
- **Budget** : pas encore fixé ; il doit être paramétrable (N6 : budget mensuel global, par ticket et par exécution, réglables dans le Siège, avec alerte à 80 % et arrêt à 100 %).

Conception validée le 9 novembre. Réponses complémentaires et leur effet sur la feuille de route :

| Réponse | Effet |
| --- | --- |
| N'importe quelle stack, Java / Spring Boot, Node / TypeScript et Python préconfigurés ; l'utilisateur ajoute ses types d'agents et la config de sa stack | Nouveau **N18 (P0)** : profils de stack (image de conteneur, commandes de build, test, lint et scan autorisées, chemins sensibles par défaut) et types d'agents déclarables depuis le Siège ; les 3 profils fournis servent d'exemples et de tests. N2 utilise l'image du profil |
| Tous les hébergements et toutes les offres GitHub | N5 devient un pont à **adaptateurs** : statut de déploiement lu par GitHub Deployments / Actions (commun à tous les clouds) d'abord, autres adaptateurs ensuite ; adresse GitHub configurable (déjà en place dans `siege/lib/github.js`) |
| Backlog dans Jira | N13 passe en **P0** : Jira = vue de travail des humains, état de workflow et preuves dans le Siège, synchronisation à sens unique |
| Tolérance stricte (quelques minutes d'arrêt, aucune perte) | Pour le pilote : déploiement sans interruption par votre CD (progressif ou bleu-vert), aucune migration destructive (schéma « étendre puis contracter »), sauvegarde vérifiée avant mise en production, retour arrière exercé et déclenché sur seuil d'erreurs ou de santé défini à l'avance |

Rien n'est développé avant votre validation de cette conception et du périmètre du pilote.
