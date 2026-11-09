# ADR EIA-017 — Journal de logs par agent IA

Statut : Proposé | Date : 2026-11-09 | Filiale(s) : Entreprise IA (fonction interne du Siège)

Spec : `docs/backlog/EIA-017-journal-agents.md` (validée par le CEO : rétention 90 jours / 500 entrées par agent, visibilité Siège uniquement, pas de dépendance à EIA-007).

## Contexte

La spec demande une entrée de journal par lancement d'agent (R1-R3), enrichie des événements de garde et d'exception (R4), sans secret (R5, masquage à l'écriture), avec une sortie bornée à 2 000 caractères (R6), écrite par le Siège seul (R7), sans jamais bloquer l'agent (R8), pour les quatre façons dont le Siège lance un agent (R9), affichée dans la page de détail de l'agent (R10-R11), avec une rétention de 90 jours / 500 entrées (R14).

Ce que fait le code aujourd'hui (lu dans `siege/`) :

| Point de lancement | Code | Début / fin connus ? | Sortie disponible |
|---|---|---|---|
| Sous-agent Claude Code confié par le directeur | Hook `PreToolUse` (outil `Agent`) et `SubagentStop` dans `garde.js:50-57`, enregistrés par `.claude/settings.json` (généré par `droits.js`) | Début : `PreToolUse` autorisé (le prompt porte `Ticket :` et `Étape :`, déjà analysés par `lib/garde.js:161-171`). Fin : `SubagentStop`. | Dernier message de l'agent, dans son historique `~/.claude/projects/<racine>/<session>/subagents/<agent>.jsonl` (disposition déjà lue par `lib/activite.js:51-56`) |
| Moteur externe Codex | `agent.js:69-88` | `spawn` / `exit`, code de sortie, durée | stdout dans `agents-externes.log` ; passation dans un fichier temporaire |
| Moteur externe Copilot | `agent.js:92-113` | idem | stdout capturé dans `sortie` |
| Session du directeur sur une demande | `lib/messagerie.js:205-216` (`lancerClaude`) | `spawn` / `exit`, délai 10 min (`SIGTERM`) | stdout dans `directeur-demandes.log` |

Existant réutilisable :
- Verrou inter-processus par fichier `wx` + écriture atomique tmp/rename : `lib/exceptions.js:20-30`, `lib/demandes.js:21-38`.
- Journal global de la garde, JSON Lines append-only, sans verrou : `garde.js:11-16` (`~/.siege/journal-garde.jsonl`, lu par `server.js:32-38`). Il n'a ni identifiant d'exécution ni ticket.
- Zone protégée : `droits/roles.json` (`commun.lecture_interdite` contient `~/.siege/**`, `commun.ecriture_interdite` contient `~/**`) ; le bac à sable (`settings.json`, `sandbox.filesystem.denyRead`) interdit déjà la lecture de `~/.siege`, mais **pas l'écriture** (`denyWrite` ne liste que des dossiers du dépôt).
- Notifications au CEO une fois par sujet : `server.js:22-27` (`sujetsCeo`) appelé par la veille de `lib/messagerie.js:172` toutes les 60 s.

## Décision 1 — Format et stockage

| Option | Avantages | Inconvénients | Coût / effort | Risque |
|---|---|---|---|---|
| **A. JSON Lines append-only, un fichier par rôle** `~/.siege/journaux/agents/<role>.jsonl` ; chaque ligne est un fait (`ouverture`, `evenement`, `cloture`) ; l'état d'une entrée = repli des lignes de même `id` ; ajout sous verrou ; purge par réécriture atomique | Ajout seul : une coupure brutale perd au plus la dernière ligne (ignorée à la lecture) ; écriture courte et rapide dans le hook de garde ; même famille de verrou que `exceptions.js` ; aucune dépendance ; migration triviale vers N1 (une ligne = une insertion) | Lecture = repli de tout le fichier (≤ 500 entrées, ~2 Mo au pire : négligeable) ; compactage à prévoir | **S-M : ~1,5 j** pour le module (écriture, repli, purge, masquage, tests) | Faible |
| B. Un document JSON par rôle `<role>.json`, lu-modifié-réécrit sous verrou (modèle `exceptions.json`) | Lecture directe, pas de repli | Chaque événement de garde réécrit tout le fichier (jusqu'à ~2 Mo) dans le hook, qui est sur le chemin de chaque action d'agent ; contention du verrou entre agents parallèles ; un fichier corrompu perd tout l'historique du rôle ; pas « append-only » (R12) | ~1 j | Moyen (latence de la garde, perte d'historique) |
| C. SQLite (`node:sqlite`, WAL), tables `executions` et `evenements` dans `~/.siege/siege.db` | Transactions, requêtes, pagination SQL ; préfigure N1 | Tranche D1 et EIA-007 par anticipation (la spec l'exclut) ; Node 22.5+ alors que `package.json` déclare `>=18.17` ; module expérimental qui écrit un avertissement sur stderr, or le stderr du hook de garde est le canal du message de refus ; schéma à maintenir deux fois si N1 le redéfinit | ~2,5 j | Moyen (D1 préjugé, garde perturbée) |

**Recommandation : option A**, parce qu'elle satisfait CA2, CA3 et CA14 avec le seul mécanisme déjà éprouvé dans le Siège et garde le hook de la garde rapide.

### Format retenu (version 1)

Chemin : `<SIEGE_PRIVE ou ~/.siege>/journaux/agents/<role>.jsonl`, dossier en 700, fichiers en 600. `<role>` est validé par `^[a-z][a-z0-9-]{1,40}$` (même règle que `lib/exceptions.js:11`) **avant** toute construction de chemin ; un rôle invalide n'écrit rien.

Une ligne = un objet JSON, encodage UTF-8, terminée par `\n`, taille bornée (< 8 Ko par construction). Champ `v` obligatoire (= 1).

```jsonl
{"v":1,"type":"ouverture","id":"3f6c2a9e-8d41-4b7a-9e0f-5c1d2b3a4e5f","role":"dev-backend","filiale":"Entreprise IA","ticket":"EIA-017","etape":"4 · Développement","moteur":"claude","modele":"m1","debut":"2026-11-09T10:00:00.000Z","hote":{"pid":4242,"session":"a1b2c3"},"empreinte":"sha256:9c1e…"}
{"v":1,"type":"evenement","id":"3f6c2a9e-8d41-4b7a-9e0f-5c1d2b3a4e5f","date":"2026-11-09T10:01:12.000Z","nature":"refus","outil":"Bash","motif":"npm install left-pad","raison":"Commande non autorisée pour dev-backend","exception":""}
{"v":1,"type":"evenement","id":"3f6c2a9e-8d41-4b7a-9e0f-5c1d2b3a4e5f","date":"2026-11-09T10:02:30.000Z","nature":"exception_demandee","outil":"bash","motif":"npm install left-pad","exception":"EXC-007"}
{"v":1,"type":"cloture","id":"3f6c2a9e-8d41-4b7a-9e0f-5c1d2b3a4e5f","fin":"2026-11-09T10:02:05.000Z","duree":125,"etat":"terminé","code":0,"extrait":"Passation · Fait : …","tronque":false}
```

| Champ | Type | Obligatoire | Sens |
|---|---|---|---|
| `v` | entier | oui | version du format (1) |
| `type` | `ouverture` \| `evenement` \| `cloture` | oui | nature de la ligne |
| `id` | chaîne (UUID v4, `crypto.randomUUID()`) | oui | identifiant de l'entrée, unique entre processus (R1, CA14) |
| `role`, `filiale`, `moteur`, `modele` | chaîne | ouverture | `filiale`/`modele` vides si inconnus |
| `ticket` | `^([A-Z]{3}-\d{3}\|BUG-\d{3})$` ou `""` | ouverture | `""` hors ticket, affiché « — » (CA19) |
| `etape` | chaîne ≤ 60 | ouverture | ex. `4 · Développement` |
| `debut`, `fin`, `date` | ISO 8601 UTC | selon type | horodatages |
| `hote` | `{pid, session}` | ouverture | processus hôte pour détecter un arrêt brutal (CA3) ; `session` = session Claude Code s'il y en a une |
| `empreinte` | `sha256:<hex>` du prompt | ouverture, sous-agent Claude seulement | sert à rattacher l'historique du sous-agent (voir « Rattachement ») ; le prompt lui-même n'est pas stocké |
| `nature` | `refus`, `exception_demandee`, `exception_accordee`, `exception_refusee`, `exception_activee`, `exception_utilisee`, `exception_terminee` | evenement | R4 |
| `outil`, `motif`, `raison`, `exception` | chaîne (motif ≤ 300, raison ≤ 300) | evenement | motif = commande, chemin ou domaine, jamais un contenu de fichier |
| `incertain` | booléen | evenement, facultatif | rattachement ambigu (deux agents du même rôle en parallèle) |
| `duree` | entier (s) | cloture | |
| `etat` | `terminé` \| `échec` \| `interrompu` | cloture | `en cours` = ouverture sans clôture |
| `code` | entier ou `null` | cloture | `null` pour `interrompu` |
| `extrait`, `tronque` | chaîne ≤ 2 000, booléen | cloture | R6 |

Règles de repli (lecture) :
- Une ligne illisible (coupure brutale, ligne tronquée) est ignorée, jamais fatale.
- Une entrée sans `ouverture` (purgée) : ses lignes sont ignorées.
- Plusieurs `cloture` : une clôture réelle (`terminé`/`échec`) l'emporte sur une clôture `interrompu` posée par la réconciliation (cas d'un hôte jugé mort à tort) ; sinon la première gagne.
- Un `v` inconnu (> 1) : ligne ignorée, compteur « lignes ignorées » exposé à l'interface. Évolutions compatibles (champ facultatif ajouté, ex. jetons et coût d'EIA-014) sans changer `v` ; renommage ou changement de type → `v: 2` et ADR mis à jour avant le code.

### Écriture concurrente

- Ajout : verrou `<role>.jsonl.lock` créé en `wx` (même boucle que `exceptions.js:22-23` : attente 20 ms, verrou périmé > 10 s retiré), puis `fs.appendFileSync` d'une seule ligne, puis libération. Plafond d'attente **500 ms** (pas 2 s) : au-delà, l'écriture est abandonnée et signalée (R8), la garde n'attend jamais plus.
- Purge / compactage : sous le même verrou, repli, filtrage, écriture dans `<role>.jsonl.<pid>.tmp` puis `rename` (atomique). Le nom temporaire porte le pid : deux purges ne partagent jamais un fichier.
- Pas de fichier global d'index : rien d'autre à tenir cohérent.

## Décision 2 — Lieu du masquage

| Option | Avantages | Inconvénients | Coût / effort | Risque |
|---|---|---|---|---|
| **A. Dans le module d'écriture, sur chaque champ texte, juste avant la sérialisation** (`lib/journal-agents.js` : `masquer()` appliqué par `ouvrir`, `evenement`, `clore`) | Un seul point de passage, impossible à oublier pour un nouveau producteur ; un seul jeu de tests (CA8, CA9) ; conforme à R5 (masquage à l'écriture) | Le module doit connaître toutes les formes de secret (liste à tenir) | ~0,5 j | Faible |
| B. Chez chaque producteur (garde, `agent.js`, messagerie, exceptions) avant l'appel | Le producteur connaît le contexte (ex. noms de variables de son moteur) | Quatre endroits à garder alignés ; un oubli = fuite ; tests multipliés | ~1 j | Élevé |
| C. Option A **et** application du même `masquer()` au journal global `journal-garde.jsonl` | Ferme aussi la fuite possible d'un motif de refus contenant un secret dans le journal global | Touche un fichier hors périmètre (journal global) ; R9 ne concerne que `agents-externes.log` mais l'idée est la même : ne pas modifier l'existant sans besoin | +0,25 j | Faible |

Le masquage à l'affichage est exclu par R5.

**Recommandation : option A** ; C est un complément utile mais hors périmètre, à proposer en ticket séparé si le RSSI le juge nécessaire.

### Règles de masquage (remplacement par `[MASQUÉ]`)

Appliquées dans cet ordre, sur toute chaîne écrite (`extrait`, `motif`, `raison`, `etape`, `modele`, `filiale`) :
1. Bloc PEM : `-----BEGIN [A-Z ]*PRIVATE KEY-----` … `-----END [A-Z ]*PRIVATE KEY-----` (bloc entier ; un `BEGIN` sans `END` masque jusqu'à la fin de la chaîne).
2. En-têtes : `(Proxy-)?Authorization\s*:\s*` suivi du schéma éventuel (`Bearer`, `Basic`, `token`) et de la valeur → `Authorization: [MASQUÉ]`.
3. Jetons connus : `gh[pousr]_[A-Za-z0-9]{20,}`, `github_pat_[A-Za-z0-9_]{20,}`, `sk-[A-Za-z0-9_-]{16,}` (couvre `sk-ant-…`), `xox[abprs]-[A-Za-z0-9-]{10,}` (Slack), `\b\d{8,10}:[A-Za-z0-9_-]{35}\b` (jeton de bot Telegram), `secret_[A-Za-z0-9]{30,}` / `ntn_[A-Za-z0-9]{30,}` (Notion).
4. Affectations nommées : nom contenant `TOKEN`, `KEY`, `SECRET`, `PASSWORD`, `PASSWD` (insensible à la casse), sous les formes `NOM=valeur`, `NOM: valeur`, `"nom": "valeur"`, `--nom valeur` → le nom est gardé, la valeur devient `[MASQUÉ]`.
5. Valeurs réelles : toute valeur (≥ 8 caractères) d'une variable d'environnement du processus écrivain dont le nom correspond à la règle 4 est remplacée littéralement, même hors de toute affectation.

Ordre masquage / bornage (R6) : on prend les **16 000 derniers caractères** de la sortie, on masque, puis on garde la fin. Un secret ne peut donc pas être coupé en deux par le bornage avant d'être reconnu. Si la sortie dépasse la borne, `extrait` = les `2 000 − 10` derniers caractères + `\n[tronqué]` (longueur totale ≤ 2 000, se termine par la marque, comme l'exige CA5) et `tronque: true`. Les caractères de contrôle (hors `\n` et `\t`) sont retirés, comme `texte()` dans `exceptions.js:32`.

## Points de branchement (R9)

| Lancement | Ouverture | Clôture | Extrait | Code |
|---|---|---|---|---|
| Sous-agent Claude | `garde.js`, après une décision `ok` sur l'outil `Agent` : rôle = `subagent_type`, ticket / étape tirés du prompt (`RE_TICKET`, `RE_ETAPE`), filiale par `Filiale :` (motif de `activite.js:10`), `hote.pid = process.ppid` (le processus Claude Code), `hote.session = session_id`, `empreinte` du prompt | `garde.js`, branche `SubagentStop` existante : entrée ouverte du même rôle et de la même session dont l'`empreinte` égale celle du premier message de l'historique du sous-agent | Dernier message de l'assistant dans cet historique | `0`, état `terminé` (Claude Code ne donne pas de code d'échec à un sous-agent ; `échec` ne vaut que pour les processus avec code de sortie) |
| Codex / Copilot (`agent.js`) | Avant `spawn` ; la variable `SIEGE_EXECUTION=<id>` est posée dans l'environnement de l'agent (hors de sa portée, comme `SIEGE_ROLE`) | `exit` ; `interrompu` si tué par le délai `DUREE_MAX_MS` ; `échec` si `spawn` échoue ou code ≠ 0 | Codex : stdout passe en `pipe` et est recopié dans `agents-externes.log` (comme Copilot aujourd'hui), on garde la fin ; Copilot : `sortie` | code réel |
| Session directeur sur demande (`messagerie.lancerClaude`) | Avant `spawn`, rôle `directeur`, ticket de la demande s'il existe | `exit` ; `interrompu` sur délai de 10 min | fin du stdout (recopié dans `directeur-demandes.log`, inchangé) | code réel |

`agents-externes.log` et `directeur-demandes.log` gardent leur contenu et leur format (CA17).

### Rattachement des événements de garde (R4, CA6, CA7, CA9)

- Refus et exception utilisée (`garde.js:66-67`) : la garde inscrit l'événement dans le journal du rôle, sur l'entrée désignée par `SIEGE_EXECUTION` si présent (Copilot), sinon sur l'entrée ouverte du même rôle et de la même session ; s'il y en a plusieurs (deux agents du même rôle en parallèle), elle utilise `agent_id` du hook pour lire le premier message de l'historique du sous-agent et comparer l'`empreinte` ; à défaut, l'entrée la plus récente avec `incertain: true`.
- Cycle d'une exception (`lib/exceptions.js` : `demander`, `decider`, `activer`, `terminer`, `terminerPourAgent`) : chaque transition inscrit un événement sur la **dernière entrée du rôle pour le même ticket** (ouverte ou close : l'agent s'est arrêté pour demander l'exception) au moment de la demande ; l'`id` de cette entrée est mémorisé dans l'exception (`journal: <id>`, champ facultatif ajouté au registre) et les transitions suivantes (`accordee`, `refusee`, `activee`, `terminee`) vont sur cette même entrée (CA7). La relance de l'agent sous exception ouvre une nouvelle entrée, qui reçoit ses propres `exception_utilisee` et `exception_terminee`.
- Les événements d'une entrée close sont permis (lignes ajoutées après la clôture) ; ils ne rouvrent pas l'entrée.

À vérifier en étape 4 sur la version installée de Claude Code : présence de `agent_id` dans les hooks des sous-agents et de `agent_transcript_path` dans `SubagentStop`. Repli si absents : chemin reconstruit comme dans `activite.js:51-54`, et rattachement par (session, rôle) avec `incertain`.

## Réconciliation (CA3) et rétention (R14, CA18)

- **Réconciliation** au démarrage du serveur puis à chaque lecture d'un journal : une entrée sans clôture dont `hote.pid` n'est plus vivant (`process.kill(pid, 0)`, comme `activite.js:15`) ou ouverte depuis plus de 2 h (au-delà de tout délai des lanceurs) reçoit une `cloture` `interrompu`, `code: null`. Rien n'est relancé.
- **Purge** au démarrage du serveur, puis toutes les heures, et au plus une fois par heure à l'ouverture d'une entrée si le fichier dépasse 600 entrées : on retire les entrées closes dont `debut` a plus de `jours` jours, puis, s'il en reste plus que `max`, les plus anciennes closes. Une entrée `en cours` n'est jamais supprimée (peut donc laisser temporairement plus de `max` entrées si toutes sont en cours, cas théorique).
- Réglages dans `lib/parametres.js` : `journalAgents: { jours: 90, max: 500 }` (valeurs validées par le CEO), bornés (jours 1-3650, max 10-10 000). La garde ne lit pas ces réglages (elle ne purge pas).

## Défaillance d'écriture (R8, CA15)

Toutes les fonctions d'écriture du module sont enveloppées : elles ne lèvent jamais, n'altèrent jamais le code de sortie de la garde ni le retour des lanceurs, et la passation sur le ticket est posée comme avant. En cas d'échec, le module dépose un témoin `{ date, role, erreur }` dans `os.tmpdir()/siege-journal-erreur-<uid>.json` (autre système de fichiers que `~/.siege` en général ; si ce dépôt échoue aussi, message sur stderr). Le serveur ajoute ce témoin aux `sujetsCeo` (clé `journal-erreur:<jour>`, donc une notification par jour au plus) et l'affiche en bandeau dans la page de l'agent. Pas d'appel réseau depuis le hook.

## Lecture et affichage (R10, R11, R13)

- Route du serveur `GET /api/agents/<role>/journal?depuis=<n>&nombre=20` (rôle validé contre la liste des agents connus) → `{ entrees: [...], total, suite }`, triées par `debut` décroissant ; cache par `mtime` du fichier. Agent sans fichier : `{ entrees: [], total: 0 }` → « Aucun journal pour cet agent » (CA12).
- `siege/public/app.js` : section « Journal » dans la page de détail de l'agent, 20 par page, bouton « charger plus », détail repliable (`<details>`), contenu injecté par `textContent` uniquement (CA13), ticket en lien vers le ticket du Siège ou « — » (CA19), thèmes clair et sombre, clavier.
- Visibilité : Siège uniquement (CEO). Aucun agent ne lit `~/.siege/**` (`lecture_interdite` commune et `sandbox.denyRead`) ; pas de copie vers ticket, Notion, Jira ou GitHub.

## Écriture réservée au Siège (R7, CA16)

- Déjà en place : `ecriture_interdite` contient `~/**` (outils Write/Edit) et aucune règle shell d'un rôle n'autorise `rm`, `mv` ou une redirection vers `~/.siege` (redirections refusées par `decouper`).
- À ajouter (défense en profondeur, classe critique) : `~/.siege` dans `sandbox.filesystem.denyWrite`, généré par `droits.js`, pour qu'un code exécuté par `npm test` ne puisse pas non plus écrire le journal. Les écrivains (`garde.js`, `agent.js`, `node siege/exception.js`, le serveur) sont dans `excludedCommands` ou hors bac à sable : ils ne sont pas gênés.

## Décision recommandée

Option A (JSON Lines par rôle sous verrou) pour le stockage et option A (masquage dans le module d'écriture) pour les secrets, parce que c'est la solution la plus simple qui couvre les 19 critères avec les mécanismes déjà éprouvés du Siège, sans dépendance nouvelle et sans préjuger de D1.

Découpage : inutile. Les quatre branchements sont courts une fois le module écrit (~0,25 j chacun) ; estimation totale **M, ~4 j** (module 2 j, branchements 1 j, interface 1 j). Si le CEO veut réduire le risque sur la garde, EIA-017b peut porter les moteurs externes (CA17) et la session des demandes.

## Impacts

- Fichiers / modules touchés :
  - nouveau `siege/lib/journal-agents.js` : `ouvrir`, `evenement`, `clore`, `lire(role, {depuis, nombre})`, `reconcilier`, `purger`, `masquer`, `borner` ;
  - `siege/garde.js` : ouverture sur `Agent` autorisé, clôture sur `SubagentStop`, événements à côté de `journal()` — **critique** (RSSI) ;
  - `siege/lib/exceptions.js` : événements de cycle et champ facultatif `journal` — **critique** ;
  - `siege/droits.js` : `~/.siege` dans `sandbox.filesystem.denyWrite` — **critique** ;
  - `siege/agent.js` : ouverture / clôture, `SIEGE_EXECUTION`, stdout Codex en `pipe` recopié dans le log ;
  - `siege/lib/messagerie.js` (`lancerClaude`) : ouverture / clôture, stdout recopié dans le log ;
  - `siege/server.js` : route de lecture, réconciliation et purge (démarrage + toutes les heures), témoin d'erreur dans `sujetsCeo` ;
  - `siege/lib/parametres.js` : réglages `journalAgents` ;
  - `siege/public/app.js` (+ feuille de style) : section Journal de la page agent ;
  - nouveau `siege/test/journal-agents.test.js` (CA1-CA19 ; CA14 avec 20 processus enfants réels ; CA15 avec `SIEGE_PRIVE` en lecture seule).
- Contrat inter-filiales : **non** (fichier privé du Siège, ni producteur ni consommateur hors du Siège) ; `portfolio/interfaces.md` inchangé.
- Migration de données : aucune à la livraison (nouveaux fichiers). Vers N1 (EIA-007) : script idempotent qui replie chaque `<role>.jsonl` et insère une Exécution par entrée avec le **même `id`** (`id`, `role`→agent, `ticket`, `etape`, `moteur`, `modele`, `debut`, `fin`, `etat`, `extrait`→erreur/passation) et un événement par ligne `evenement` (`INSERT OR IGNORE`, donc rejouable) ; les fichiers JSONL sont gardés jusqu'à vérification des comptes puis retirés sur accord du CEO.

## Recouvrements signalés

- **EIA-007 (N1, exécutions persistantes)** : risque réel de deux notions d'« exécution ». Recommandation : la spec d'EIA-007 reprend l'`id` (UUID), le vocabulaire d'état (`en cours`, `terminé`, `échec`, `interrompu`) et les points de branchement de cet ADR ; le module `journal-agents` devient alors l'écrivain unique et change seulement de stockage.
- **EIA-014 (N6, coûts)** : il aura besoin des mêmes points d'ouverture / clôture. Il doit ajouter des champs facultatifs (`jetons`, `cout`) à la ligne `cloture` (compatible `v: 1`) plutôt que d'instrumenter une seconde fois les lanceurs.
- `journal-garde.jsonl` reste le journal global de la garde ; les événements sont dupliqués dans le journal par agent (volontaire, aucune lecture existante n'est modifiée).

## Points à valider par le CEO

1. « Sessions Claude du Siège » (R9) est compris comme : sous-agents confiés par le directeur et sessions non interactives des demandes. La session **interactive** du directeur (terminal, `/feature`) n'est pas journalisée dans cette version (pas de début / fin fiables sans hooks `SessionStart` / `SessionEnd` supplémentaires). À confirmer.
2. Un sous-agent Claude ne remonte pas de code d'échec : il apparaîtra `terminé` (code 0) ou `interrompu`, jamais `échec`. `échec` concerne Codex, Copilot et les sessions de demandes.

## Risques et retour arrière

| Risque | Parade |
|---|---|
| Ralentissement ou erreur de la garde | Écriture d'une ligne, verrou plafonné à 500 ms, tout enveloppé (jamais d'exception vers la décision) ; test de non-régression de la garde ; la décision est calculée avant toute écriture de journal |
| Secret non reconnu par les motifs | Règle 5 (valeurs réelles de l'environnement) ; liste de motifs testée par le RSSI à l'étape 7 ; le journal reste dans `~/.siege` (600, illisible des agents) |
| Rattachement erroné entre deux agents parallèles du même rôle | Empreinte du prompt ; drapeau `incertain` visible à l'interface |
| Faux `interrompu` (pid réutilisé, hôte jugé mort à tort) | Clôture réelle prioritaire au repli |
| Champs de hook absents dans la version de Claude Code | Repli décrit (chemin reconstruit, rattachement par session et rôle) |

Retour arrière : le journal est un ajout pur. Désactivation par un réglage `journalAgents.actif: false` (lu par le module, toutes les écritures deviennent sans effet) ou par retour du commit ; aucune donnée existante (backlog, exceptions, journaux actuels) n'est modifiée, hormis le champ facultatif `journal` des exceptions, ignoré par l'ancien code. Les fichiers `~/.siege/journaux/agents/` peuvent rester en place ou être retirés sur accord du CEO.
