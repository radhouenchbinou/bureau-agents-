# Entreprise d'agents IA

Une organisation d'agents [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) calquée sur une
vraie entreprise, réutilisable sur n'importe quel écosystème de projets : un **directeur de programme**
orchestre des **équipes de filiale** (une par projet) et des **services partagés**, sous la validation d'un
**CEO** (vous) à chaque étape. Le backlog vit dans **Notion** (ou en local), et le **Siège** donne une vue
d'ensemble : bureau des agents en activité, backlog, agents modifiables.

```
Vous (CEO) ── valide chaque étape, répond aux questions dans Notion
 └─ Directeur de programme  (la session Claude Code ouverte dans le Siège)
     ├─ Services partagés : architecte · reviewer · rssi-devsecops · devops · tech-writer
     └─ Filiales (une par projet) : product-owner · dev-backend · dev-frontend · qa
```

> **Première installation ?** Suivez [ONBOARDING.md](ONBOARDING.md) : les 9 étapes, de l'installation à la routine du CEO.

## Ce qu'il y a dedans

| Dossier / fichier | Rôle |
|---|---|
| `CLAUDE.md` | Le règlement du siège : rôle du directeur, règles d'orchestration, backlog |
| `.claude/agents/` | Les 9 agents (rôles génériques, un fichier `.md` chacun) |
| `.claude/skills/` | Les skills du socle (une par méthode de travail) et celles de votre entreprise |
| `.claude/commands/` | `/feature`, `/corriger`, `/standup`, `/audit-secu`, `/nouvelle-filiale`, `/notion-init` |
| `.claude/settings.json` | Généré : garde, bac à sable, réseau limité à GitHub et Notion |
| `droits/` | `roles.json` (droits et skills de chaque rôle), `autorisations.json` (décisions du CEO) |
| `process/` | Le circuit d'une feature (10 étapes, portes de validation) et la méthode de chaque rôle |
| `templates/` | Fiche de filiale, ADR |
| `portfolio/` | Registre des filiales, contrats d'interface entre filiales, décisions de groupe, backlog local |
| `siege/` | Le Siège (interface web locale) et l'outil `backlog.js` utilisé par les agents |
| `exemples/cyclofix/` | Exemple fictif complet : 3 filiales, un repo chacune, backlog avec une livraison groupée |

Les rôles d'une filiale sont **génériques** : les mêmes agents servent toutes les filiales, et chacun lit la
**fiche** de la filiale (`<projet>/CLAUDE.md`) avant d'agir. Changer d'écosystème = changer le registre
`portfolio/filiales.md`.

## Prérequis

- Claude Code installé et connecté (`claude` dans un terminal).
- Node.js 18.17 ou plus (le Siège et l'outil backlog n'ont **aucune dépendance npm**).
- Git.
- Linux : `bubblewrap` et `socat` (bac à sable des agents ; `sudo apt install bubblewrap socat`). macOS : rien à installer.
  Sans bac à sable, Claude Code refuse de démarrer dans le Siège (`failIfUnavailable`).
- Facultatif : Notion ou Jira (backlog), une App GitHub, un bot Telegram.

## Démarrer en 5 minutes

```bash
git clone <ce repo> mon-siege && cd mon-siege
node siege/droits.js appliquer   # droits et skills appliqués aux agents, settings.json généré
node siege/server.js             # le Siège sur http://127.0.0.1:4848
claude                           # dans un autre terminal : le directeur de programme
```

Au premier lancement, Claude Code demande d'approuver le dossier (confiance de l'espace de travail) :
acceptez, sinon la garde n'est pas chargée.

Le Siège n'écoute que sur votre machine. Il lit l'activité de Claude Code dans `~/.claude` (lecture seule) :
les agents « s'allument » à leur poste quand une mission leur est confiée.

## Intégrer un nouveau projet (une filiale)

1. **Mettre le projet à portée du Siège.** Claude Code travaille dans le dossier où il est lancé : le projet
   doit être dans le Siège. Au choix :
   ```bash
   git clone git@github.com:moi/mon-api.git projets/mon-api      # copie de travail dédiée
   ln -s ~/code/mon-api projets/mon-api                          # ou lien vers votre copie existante
   ```
   (`projets/` est ignoré par git : chaque projet garde son propre dépôt.)
   Plusieurs projets qui se parlent = plusieurs filiales ; un gros projet peut aussi être découpé en
   plusieurs filiales (un dossier chacune), comme dans `exemples/cyclofix`.

2. **Intégrer la filiale** dans Claude Code :
   ```
   /nouvelle-filiale MonAPI projets/mon-api
   ```
   Le directeur explore le projet en lecture seule (pom.xml, package.json, Dockerfile, CI…), vous propose un
   préfixe d'identifiant (ex. `API`), rédige la **fiche** `projets/mon-api/CLAUDE.md` à partir de
   `templates/fiche-filiale.md`, crée `docs/backlog`, `docs/adr`, `docs/rapports` et inscrit la filiale dans
   `portfolio/filiales.md`.

3. **Compléter la fiche** (c'est le plus important) : règles métier critiques, commandes de build et de
   test, ce que les agents ne doivent jamais toucher, données sensibles. Tout ce qui est marqué
   `À COMPLÉTER` doit l'être avant la première feature.

4. **Déclarer les échanges avec les autres filiales** : le directeur confie à l'`architecte` un ticket
   `GRP-…` pour écrire les contrats dans `portfolio/interfaces.md` (format, exemple, versionnement,
   erreurs). Pas de contrat → pas de développement qui en dépend.

5. **Remplir le backlog** : dans le Siège (onglet Backlog › Nouvelle feature), dans Notion, ou en demandant
   au directeur. Fixez les **rangs** : 1 = le plus urgent.

6. **Lancer** : `/feature` prend le premier ticket de la file ; `/feature API-003` un ticket précis. Depuis le
   Siège, le bouton *Lancer* ouvre Claude Code dans un Terminal (macOS) ou copie la commande.

### Adapter l'équipe

- Un rôle propre à un projet (data engineer, mobile…) : onglet **Agents › Nouvel agent** du Siège, ou un
  fichier dans `.claude/agents/`. La **description** dit au directeur quand faire appel à lui.
- Une règle propre à un projet pour un rôle existant : section « Règles spécifiques par rôle » de la fiche
  de la filiale (pas besoin de dupliquer l'agent).
- Un circuit différent : `process/workflow-feature.md` (le directeur le relit à chaque `/feature`).

### Retirer un projet

Passez sa ligne à `Archivée` dans `portfolio/filiales.md` et retirez le dossier de `projets/`.

## Le backlog : Features et Bugs

Deux tableaux : **Features** (demandes et ajouts, `API-001`) et **Bugs** (remontés par les testeurs,
`BUG-001`, reliés à une feature, avec gravité Bloquant / Majeur / Mineur). Chaque ticket a un **rang**.

L'ordre de traitement est unique et calculé : **bugs bloquants**, puis **features prêtes** (toutes leurs
dépendances livrées) par rang, puis les **autres bugs**.

Les agents y accèdent tous par le même outil, que le backlog soit dans Notion ou en local :

```bash
node siege/backlog.js file                     # quoi faire ensuite
node siege/backlog.js maj API-003 --statut "En cours" --etape "4 · Développement" --agent dev-backend
node siege/backlog.js commenter API-003 --auteur dev-backend --texte "Endpoint prêt, tests verts"
node siege/backlog.js commenter API-003 --auteur qa --question --texte "Arrondi au centime supérieur ?"
node siege/backlog.js creer bug --filiale MonAPI --story API-003 --titre "…" --gravite Majeur --detecte-par qa
node siege/backlog.js questions                # questions des agents encore sans réponse
```

**Commentaires de suivi et questions** : à chaque étape, l'agent laisse un commentaire sur le ticket. Une
question au CEO bloque le ticket jusqu'à votre réponse, que vous écrivez **directement en commentaire sur la
page Notion** (ou dans le Siège). Le directeur la lit avant de reprendre.

## Brancher Notion

L'équipe est autonome sur Notion : c'est elle qui crée les bases et les fait vivre, via une intégration.

1. Créez une **intégration interne** sur <https://www.notion.so/profile/integrations> avec les droits :
   lire, mettre à jour et insérer du contenu ; lire et insérer des commentaires.
2. Donnez son jeton au Siège (onglet **Intégrations**) ou via `export NOTION_TOKEN=ntn_…`. Il est stocké dans
   `~/.siege/notion-token` (droits 600), **jamais dans le dépôt**.
3. Créez une page Notion (ex. « Mon entreprise d'agents ») et partagez-la avec l'intégration
   (••• › Connexions).
4. Dans Claude Code : `/notion-init <lien de la page>`. Le directeur crée les bases **Features** et **Bugs**
   sous la page, bascule le backlog sur Notion (`portfolio/source-backlog.json`) et importe les tickets
   locaux.

Pour changer de source : Siège › Intégrations › *Où vit le backlog* (rien n'est modifié dans les autres sources).

## Brancher Jira (Cloud ou Data Center)

Tout se fait dans **Siège › Intégrations › Jira** (ou `node siege/backlog.js jira-init …` pour le CEO en terminal).

1. Un **jeton** : Jira Cloud → jeton d'API (<https://id.atlassian.com/manage-profile/security/api-tokens>) + e-mail
   du compte ; Data Center / Server → jeton d'accès personnel. Gardé dans `~/.siege/jira-token` (600), ou `JIRA_TOKEN`.
   Le compte doit être **administrateur Jira** pour l'initialisation (création de champs).
2. **Où le Siège lit** : parmi tous les tableaux de l'entreprise, seulement les tickets de type **Story** (Features)
   et **Bug** (Bugs) portant l'étiquette **`bureau-ia`** (types et étiquette modifiables), sur tous les projets ou
   seulement le projet indiqué. Les nouveaux tickets sont créés dans ce projet, avec l'étiquette.
3. **Initialiser** : vérifie l'accès, le projet et ses types, crée les champs **« Siège ID », « Siège Statut »,
   « Siège Étape », « Siège Filiale »…** s'ils manquent (rien n'est supprimé ni renommé) et les ajoute à l'écran par
   défaut. S'ils ne sont pas saisissables sur les écrans propres au projet, un avertissement dit lesquels un admin
   doit y ajouter. L'initialisation active Jira ; *Importer le backlog local* y copie les tickets.

Règles : l'**identifiant du Siège (COL-001, BUG-001) fait foi**, la clé Jira (PROJ-123) est un lien. Le statut du
Siège vit dans « Siège Statut » ; si le workflow Jira a une transition vers un statut du même nom (ou celui indiqué
dans *Statuts Jira correspondants*), le Siège la fait pour que vos tableaux suivent. Retirer un ticket du Siège enlève
seulement l'étiquette : rien n'est jamais supprimé dans Jira. Une réponse du CEO écrite dans Jira est lue comme telle
(auteur différent du compte de l'intégration). Une story étiquetée sans « Siège ID » (créée à la main) est ignorée.

## Teams, Telegram et Slack : les collaborateurs écrivent au directeur, le directeur prévient le CEO

Option activable dans **Siège › Intégrations**, sur Microsoft Teams, Telegram et/ou Slack (mêmes fonctions, une file et un
plafond communs). Les collaborateurs n'ont **jamais** accès au Siège.

**Microsoft Teams** (sans adresse publique) : un compte Microsoft 365 dédié « Directeur » et une inscription
d'application Entra (client public autorisé, permissions déléguées `User.Read`, `Chat.ReadWrite`, `offline_access`,
consentement de l'administrateur). Dans le Siège : tenant, ID d'application, puis *Connecter le compte Directeur* (code
d'appareil, aucun mot de passe gardé ; jetons dans `~/.siege/teams-token.json`, 600, rafraîchis seuls). Le Siège lit
les conversations 1:1 de ce compte par Microsoft Graph toutes les 5 s (jamais l'historique d'avant l'activation) et
répond depuis lui. Pas de boutons : le demandeur répond « oui » / « non », le CEO « accepter DEM-… », « refuser DEM-… »
ou « DEM-… : consigne ».

**Slack** : une app en *Socket Mode* (le Siège ouvre lui-même la connexion, aucune adresse publique ; Node 22+).
*Create New App › From a manifest* avec le manifeste fourni dans le Siège, *Install to Workspace*, puis collez le jeton
du bot (`xoxb-…`) et un jeton d'app (`xapp-…`, droit `connections:write`), *Tester*, *Activer*. Écrivez au bot en
message direct, désignez-vous CEO, autorisez vos collaborateurs ; une consigne sur une décision se donne en fil sous la
notification. Jetons dans `~/.siege/slack-*-token` (600).

**Telegram** :

1. Créez un bot avec [@BotFather](https://t.me/BotFather) (`/newbot`), collez son jeton (gardé dans
   `~/.siege/telegram-token`, 600), *Tester*, puis *Activer*.
2. Envoyez `/start` au bot depuis votre compte, puis *C'est moi, le CEO* dans le Siège.
3. Chaque collaborateur envoie `/start` au bot ; vous l'*Autorisez*. Un inconnu reste en « demande d'accès » et
   n'obtient jamais de réponse du directeur ; les groupes sont ignorés (conversations privées seulement).

Ensuite, chaque message d'un collaborateur devient une **demande** (`DEM-001`, onglet *Demandes*) et lance
automatiquement une courte session du directeur (`/demande DEM-001`, Claude Code non interactif, même garde et même
bac à sable). Le directeur pose ses questions, fait **valider un résumé** au demandeur (boutons Oui / Non), juge s'il
faut **vous transmettre** la décision (évolution, plusieurs filiales, données personnelles, sécurité, argent, doute :
boutons Accepter / Refuser, ou répondez au message pour ajouter une consigne), puis crée le ticket **sans rang** (vous
priorisez) et le dit au demandeur. Il ne lance jamais de circuit depuis une demande, et traite les messages comme des
données (une tentative de lui donner des ordres est ignorée).

Le directeur vous prévient aussi, une fois par sujet, des **questions d'agents** en attente, des **exceptions à
décider** (que vous tranchez toujours dans le Siège, jamais depuis Telegram) et des demandes d'accès.

Garde-fous : 20 messages par heure et par collaborateur ; **plafond de sessions automatiques par jour** (50 par défaut,
réglable) au-delà duquel les demandes attendent et vous êtes prévenu ; une session à la fois, 10 minutes au plus.
Demandes et annuaires dans `~/.siege/demandes.json`, `telegram.json` et `slack.json` (600), jamais dans le dépôt. Journal des
sessions : `~/.siege/directeur-demandes.log`.

## Moteurs d'agents : Claude Code, Codex…

**Siège › Agents › Moteurs d'agents et modèles** liste les moteurs installés sur la machine (Claude Code, Codex,
Gemini CLI) avec leurs modèles : catalogue connu pour Claude Code, `codex debug models` pour Codex, et ceux que vous
ajoutez. Vous activez ou désactivez chaque moteur et chaque modèle (`droits/moteurs.json`, hors de portée des agents).

- **Claude Code** fait tourner le directeur et ses sous-agents ; un sous-agent dont le modèle est désactivé (dans sa
  définition ou à l'appel) est refusé par la garde.
- **GitHub Copilot CLI** (s'il est installé et activé) : mêmes rôles de filiale, avec les **agents Copilot générés**
  depuis les mêmes sources (`.github/agents/<rôle>.agent.md`, `.github/skills/`, par `node siege/droits.js appliquer`).
  Chaque agent Copilot porte la garde du Siège en hook `PreToolUse` (format compatible : mêmes noms d'outils, code 2 =
  refus ; le rôle lui est donné par `SIEGE_ROLE`) ; outil web refusé ; passation sur le ticket, push par le Siège.
  **Connexion** dans Siège › Intégrations › GitHub Copilot, comme dans l'extension Copilot des IDE : **GitHub.com** ou
  **GitHub Enterprise Cloud** (`<nom>.ghe.com`) — une fois, `copilot login` ou `copilot login --host <nom>.ghe.com`
  (jeton dans le gestionnaire d'identification du système), ou un jeton fin `github_pat_…` avec la permission
  « Copilot Requests ». Les jetons classiques `ghp_…` ne sont pas acceptés par Copilot CLI. Sous Windows, le Siège
  lance Copilot par node, sans passer par `cmd.exe`.
- **Codex** (s'il est installé et activé) reçoit du directeur une tâche précise d'un ticket :
  `node siege/agent.js lancer --moteur codex --modele <id> --role dev-backend --filiale <Nom> --ticket <ID>
  --etape "<n> · <nom>" --mission "…" [--pousser feature/<ID>]`. Rôles de filiale seulement (PO, devs, QA,
  rédacteur). Codex tourne dans son propre bac à sable : écriture dans le repo de la filiale seulement, **réseau
  coupé**, session éphémère, configuration utilisateur ignorée. Il n'a ni jeton GitHub ni accès au backlog : l'outil
  inscrit sa passation sur le ticket et, avec `--pousser`, pousse la branche avec le jeton du rôle. Même règle
  « une session du directeur = une étape » que pour les sous-agents. Journal : `~/.siege/agents-externes.log`.

## Brancher GitHub depuis le Siège

**Siège › Intégrations › GitHub** : **adresse GitHub** (https://github.com, GitHub Enterprise Cloud
`https://<nom>.ghe.com` ou GitHub Enterprise Server `https://<serveur>` : l'API, le push et le réseau autorisé du bac à
sable suivent cette adresse), App ID, Installation ID, clé privée (`.pem`, déposée ou collée, gardée dans
`~/.siege/github-app.pem` en 600) et repo GitHub de chaque filiale (écrit dans `portfolio/github.json`, sans secret).
*Tester la connexion* vérifie que la clé signe, que l'installation existe et que chaque repo déclaré lui est accessible.
Voir plus bas « GitHub : une App, un jeton par rôle » pour créer l'App.

## Environnement fermé : droits, exceptions, autorisations

Chaque agent n'a que les droits de son métier, définis dans **`droits/roles.json`** (source unique) :
outils, dossiers où il écrit, commandes shell, sous-commandes du backlog, droits GitHub, skills.

| Rôle | Écrit dans | Peut notamment | GitHub |
|---|---|---|---|
| directeur | rien | déléguer, tenir le backlog, demander et activer les exceptions | — |
| product-owner | `docs/backlog/` | créer et mettre à jour des features | — |
| architecte | `docs/adr/`, `portfolio/interfaces.md`, `portfolio/decisions/` | — | lecture |
| dev-backend / dev-frontend | `projets/**` | tests, build, git local, pousser `feature/…` `fix/…`, ouvrir une PR | contenu + PR |
| qa | `tests/`, `docs/rapports/`, `docs/backlog/` | lancer les tests, créer et suivre des bugs | lecture |
| reviewer | `docs/rapports/` | lire les diffs, poser le feu `agents/revue` | lecture + feux |
| rssi-devsecops | `docs/rapports/` | outils d'audit, poser le feu `agents/securite` | lecture + feux + alertes |
| devops | CI, `deploy/`, Dockerfile, unités systemd | `docker build`, fusionner après validations | contenu, PR, workflows |
| tech-writer | `docs/site/` | — | lecture |

Trois niveaux de protection :

1. **La garde** (`siege/garde.js`, hook `PreToolUse` de Claude Code) contrôle chaque action de chaque agent
   avant exécution, avec son rôle. Tout ce qui n'est pas listé est refusé. Personne n'écrit dans `droits/`,
   `.claude/`, `siege/`, les fichiers du backlog, les `CLAUDE.md` ; personne ne lit les secrets.
2. **Le bac à sable** de Claude Code (`sandbox` dans `.claude/settings.json`) isole au niveau du système
   chaque commande shell et ses sous-processus : réseau limité à **GitHub et Notion**, dossiers protégés
   en écriture, secrets illisibles. Sur Linux il faut `bubblewrap` et `socat` (`sudo apt install
   bubblewrap socat`) ; sur macOS rien à installer.
3. **GitHub** : jetons d'une heure limités au repo et au rôle, `main` protégée.

`.claude/settings.json` est **généré** (`node siege/droits.js appliquer`) : ne le modifiez pas à la main.

### Exceptions

Un agent bloqué pour une action vraiment nécessaire ne contourne pas :

1. il s'arrête et remonte au **directeur** une demande justifiée (type, action exacte, pourquoi) ;
2. le directeur l'enregistre (`node siege/exception.js demander …`) et vous prévient ;
3. **vous** accordez ou refusez dans le Siège › **Droits** (ou `node siege/exception.js accorder EXC-001`
   dans votre terminal) — aucun agent, directeur compris, ne peut accorder une exception ;
4. le directeur l'active et relance l'agent ;
5. elle se **ferme automatiquement** quand l'agent termine cette tâche. Vous pouvez la révoquer avant.

Chaque refus et chaque usage d'exception est journalisé (`~/.siege/journal-garde.jsonl`, visible dans
Droits).

### Autorisations permanentes

Ce qui doit être autorisé durablement (un domaine comme `pypi.org`, une commande qui doit tourner hors
bac à sable, une commande permanente pour un rôle) s'ajoute et se retire **par vous seul** dans le Siège
› Droits, avec un motif. Les réglages sont régénérés aussitôt.

## Skills

Chaque agent précharge des **skills** (méthodes de travail) selon son rôle :

| Rôle | Skills du socle |
|---|---|
| tous | `backlog-siege`, `demander-une-exception` |
| product-owner | `ecrire-une-user-story` |
| architecte | `rediger-un-adr`, `ecrire-un-contrat-d-interface` |
| dev-backend | `tdd-et-changement-minimal`, `branche-et-commit` |
| dev-frontend | + `interface-accessible` |
| qa | `plan-de-tests`, `remonter-un-bug` |
| reviewer | `revue-de-code` |
| rssi-devsecops | `audit-securite`, `detection-de-secrets` |
| devops | `pipeline-ci-securise`, `fusion-apres-validations` |
| tech-writer | `documentation-html` |

**Skills de votre entreprise** : dans le Siège › Droits › *Nouvelle skill*, écrivez vos conventions (stack,
architecture maison, règles métier, outils) et cochez les types d'agents qui la reçoivent. Elle est
enregistrée dans `.claude/skills/<nom>/SKILL.md` et ajoutée à `skills_entreprise` du rôle dans
`droits/roles.json`. Exemples : `conventions-spring-kompta` pour les devs, `regles-comptables` pour le PO
et le QA, `checklist-rgpd` pour le RSSI.

## GitHub : une App, un jeton par rôle

Les agents agissent au nom d'une **App GitHub** de votre entreprise. Pour chaque action, le Siège obtient
un jeton d'une heure limité **au seul repo de la filiale** et **aux seules permissions du rôle** ; les
agents ne voient jamais ni la clé ni le jeton.

1. Créez une App sur <https://github.com/settings/apps/new> (ou dans votre organisation) : pas de webhook ;
   permissions de repository : *Contents* lecture-écriture, *Pull requests* lecture-écriture,
   *Commit statuses* lecture-écriture, *Workflows* lecture-écriture, *Actions* lecture,
   *Code scanning alerts* lecture, *Metadata* lecture.
2. Générez une clé privée et placez-la dans `~/.siege/github-app.pem` (`chmod 600`).
3. Installez l'App sur les repos de vos projets uniquement ; notez l'*installation id* (dans l'URL de la
   page d'installation).
4. Copiez `portfolio/github.json.exemple` en `portfolio/github.json` : `app_id`, `installation_id` et, pour
   chaque repo local, son repo GitHub.
5. Protégez `main` sur chaque repo : pull request obligatoire avec **1 approbation**, feux requis
   `agents/revue` et `agents/securite` (+ votre CI).

Le circuit sur GitHub : le dev pousse `feature/<ID>` et ouvre la PR ; le reviewer et le RSSI posent leurs
feux ; **vous approuvez la PR** ; le devops fusionne (`node siege/github.js fusionner`), l'outil refusant
s'il manque votre approbation ou un feu vert.

## Plusieurs repos : un repo par filiale, une livraison groupée

Chaque filiale a son repo (colonne « Repo git » de `portfolio/filiales.md`, repo GitHub dans `portfolio/github.json`),
et chaque jeton d'agent est limité au repo de la filiale de sa mission. Un produit en back et front = deux filiales.

Une feature qui touche plusieurs filiales devient **un ticket parent et un ticket enfant par filiale** (champ
`Parent`). Chaque PR est inscrite sur son ticket (champ `PR`, tenu par `github.js pr --ticket`, en lecture seule dans
le Siège). La fusion se fait **en une fois sur le parent** : `github.js fusionner --role devops --ticket <PARENT>`
vérifie toutes les PR (approbation du CEO, revue, sécurité, pas de conflit) et ne fusionne rien s'il en manque une ;
sinon il fusionne le producteur avant ses consommateurs. Une PR d'un lot ne se fusionne jamais seule. Si GitHub refuse
une fusion au milieu du lot, le parent passe « Bloqué » avec l'état exact, pour décision du CEO. Une base Notion
existante reçoit d'elle-même les propriétés « Parent » et « PR » à la première écriture.

## Le circuit d'une feature

| # | Étape | Agent | Livrable |
|---|---|---|---|
| 0 | Cadrage | directeur | filiales concernées, circuit retenu |
| 1 | Spécification | product-owner | user story, règles métier, critères d'acceptation |
| 2 | Conception | architecte | ADR (+ contrat si plusieurs filiales) |
| 3 | Plan de tests | qa | cas de test, cas limites |
| 4 | Développement | dev-backend, dev-frontend | code + tests, branche `feature/<ID>` |
| 5 | Recette | qa | rapport, un ticket Bug par anomalie |
| 6 | Revue | reviewer | bloquant / à corriger / suggestion |
| 7 | Sécurité | rssi-devsecops | GO / NO-GO |
| 8 | Livraison | devops | pipeline, conteneur, procédure (sans déployer) |
| 9 | Documentation | tech-writer | doc HTML de la filiale |

Vous validez après chaque étape (Valider / Corriger / Arrêter). Rien n'est poussé, fusionné ni déployé
sans votre accord. Variantes : circuit court, ticket de groupe, correction de bug (`/corriger`) — voir
`process/workflow-feature.md`.

## Contexte propre : économiser les jetons

Un agent ne garde rien d'une tâche à l'autre, et le directeur ne garde rien d'une étape à l'autre :
- **chaque mission lance un nouvel agent** (une correction aussi), qui ne lit que la fiche, le ticket, la dernière
  passation et les fichiers cités ;
- en fin de tâche, l'agent laisse une **passation** de 6 lignes sur le ticket et rend 10 lignes au directeur
  (skill `passation`, donnée à tous les rôles) : chemins des livrables, jamais leur contenu ;
- **une session du directeur = une étape** : après « Valider », il inscrit l'étape suivante sur le ticket et s'arrête.
  On relance avec `/clear` puis `/feature <ID>` (ou « Lancer » dans le Siège, qui ouvre toujours une session neuve) ;
  la commande reprend à l'étape inscrite.

La garde l'impose : mission sans `Étape : <n>`, mission d'une autre étape dans la même session, `SendMessage` vers un
agent qui a fini et `fork` sont refusés (liaison session → étape dans `~/.siege/sessions-etapes.json`, 7 jours).

## Le Siège

`node siege/server.js` puis <http://127.0.0.1:4848> :

- **Bureau** : la direction, les services partagés et un étage par filiale ; chaque agent est « au poste »
  quand Claude Code lui a confié une mission, avec le ticket en cours ; journal des missions.
- **Backlog** : file de travail avec bouton *Lancer*, questions des agents, tableaux Features / Bugs en
  colonnes par statut ; glisser une carte change son statut ou son rang ; fiche ticket avec fil de
  commentaires et réponse du CEO.
- **Agents** : créer, modifier (description, modèle, consigne), supprimer.
- **Droits** : exceptions à accorder ou refuser, refus récents de la garde, autorisations permanentes,
  droits par rôle, skills (socle et entreprise) par type d'agent.
- **Réglages** : source du backlog et branchement Notion.

Sécurité : écoute sur 127.0.0.1 uniquement, hôte vérifié (anti DNS rebinding), modifications en JSON avec
jeton de page (anti-CSRF), aucun contenu de conversation servi, jeton Notion jamais renvoyé au navigateur.

Tests : `cd siege && npm test` (dont l'intégration Notion de bout en bout contre une fausse API).

## Exemple : CycloFix (fictif)

`exemples/cyclofix/` contient un écosystème inventé pour essayer l'organisation : CycloFix, réparation de vélos à
domicile, avec **3 filiales et un repo chacune** (API Spring Boot, application atelier React, site vitrine React),
un groupe pour les contrats, et un backlog de 14 features en 4 jalons. On y trouve un contrat d'interface d'abord,
des features avec dépendances, et une **feature multi-filiales livrée d'un bloc** (GRP-002 : acompte payé en ligne,
une PR dans l'API et une dans la vitrine). Pour l'installer : `exemples/cyclofix/LISEZMOI.md`.

## Licence

[MIT](LICENSE) — © 2026 Radhouen Chbinou. Édition GitHub Copilot + Teams : [entreprise-agents-copilot](https://github.com/radhouenchbinou/entreprise-agents-copilot).
