# ADR EIA-001 — Identité imposée par la garde (C2)

Statut : Proposé | Date : 2026-11-09 | Filiale(s) : Entreprise IA
Spec : `docs/backlog/EIA-001-identite-imposee.md` · Classe de risque : critique · Contrat inter-filiales : non

Chemins ci-dessous relatifs au repo `projets/entreprise-ia/` (racine du Siège : `siege/`, `droits/`, `.claude/`).

## Contexte

La spec demande que l'auteur d'une action (commentaire, question, rôle GitHub) soit fixé par la garde et non
déclaré en argument (R1-R9, CA1-CA12). Le code aujourd'hui :

- **Parseurs d'options** : chaque outil a sa propre fonction `options`/`opts` qui écrase silencieusement une
  option répétée (`siege/backlog.js` l. 53-60, `siege/github.js` l. 22, `siege/exception.js` l. 18,
  `siege/demande.js` l. 20, `siege/agent.js` l. 27). Le dernier `--auteur` gagne (R6 du constat).
- **Garde** (`siege/garde.js`, `siege/lib/garde.js`) : hook `PreToolUse` ; rôle = `agent_type` du sous-agent, sinon
  `SIEGE_ROLE` (agent Copilot lancé par `agent.js`), sinon `directeur`. Pour Bash, elle découpe la commande
  (`decouper`, guillemets retirés), retire les affectations `VAR=…` en tête (seules `ENV_INTERDITES` sont refusées,
  **`SIEGE_*` et `CLAUDECODE` ne le sont pas**), puis teste les expressions de `droits/roles.json`.
- **Droits** (`droits/roles.json`) : `commenter \S+ .*--auteur {role}( |$)` et `github.js (pousser|pr) .*--role {role}`
  ne vérifient qu'*une* occurrence : `--auteur qa … --auteur CEO` passe. Le directeur a `backlog.js (maj|creer|commenter)`
  sans contrainte d'auteur.
- **Type de commentaire** (`siege/backlog.js` l. 126) : auteur absent → `CEO` ; auteur `CEO` → type `reponse`.
  Un agent qui écrit `--auteur CEO` produit donc une « réponse du CEO » (R5).
- **Autres moteurs** (`siege/agent.js`) : Copilot reçoit `SIEGE_ROLE` dans son environnement et passe par la garde ;
  Codex n'a ni backlog ni réseau, `agent.js` inscrit la passation (`auteur: o.role`, appel de bibliothèque) et pousse
  via un **sous-processus** `github.js pousser --role <rôle>`.
- **Précédent utile** : la garde tient déjà un état privé par session (`~/.siege/sessions-etapes.json`, écriture
  atomique par fichier temporaire + `rename`), illisible par les agents (`lecture_interdite ~/.siege/**`, `denyRead`).

Le problème central (Q1) : le processus `node siege/backlog.js` ne sait pas qui l'a lancé. La garde le sait, mais elle
tourne dans un autre processus, avant l'exécution.

## Options

| Option | Avantages | Inconvénients | Coût / effort | Risque |
|---|---|---|---|---|
| **A. Variable injectée** : la garde réécrit la commande (`updatedInput` du hook) en `SIEGE_IDENTITE=<rôle> node siege/…` ; l'outil lit la variable | Très peu de code ; aucun état à gérer | Dépend de deux comportements de Claude Code non maîtrisés : `updatedInput` (exige `permissionDecision: allow`, donc contourne les invites de permission) et la correspondance des `sandbox.excludedCommands` (`node siege/backlog.js *`) avec une commande préfixée : si elle échoue, l'outil tourne dans le bac à sable et ne peut plus écrire `portfolio/*.json`. Compatibilité Copilot (`updatedInput`) inconnue | ~1 j + spike d'intégration | Moyen : panne silencieuse ou élargissement des permissions selon la version de Claude Code |
| **B. Registre à usage unique** (recommandée) : la garde, quand elle autorise un segment `node siege/<outil>.js …`, dépose dans `~/.siege/identites/` une entrée `{role, expire}` dont le nom est l'empreinte des mots du segment ; l'outil recalcule l'empreinte depuis son `argv`, consomme l'entrée et en tire l'identité | Ne dépend que du hook déjà en place ; la commande exécutée n'est pas modifiée (sandbox et permissions inchangés) ; identique pour Claude et Copilot ; testable en unitaire (fonctions pures + dossier temporaire) ; même motif que `sessions-etapes.json` | Un état éphémère de plus (purge à 2 min) ; deux commandes **identiques** de deux rôles différents dans la même fenêtre : la seconde est refusée par la garde (« réessaie ») | ~1,5 j (dans l'effort S) | Faible : toute anomalie aboutit à un refus (échec fermé) |
| **C. Garde seule** : garder l'argument, la garde refuse les doublons et `--auteur ≠ rôle` ; l'outil refuse les doublons | Le plus simple (~0,5 j) ; aucun nouveau mécanisme | L'outil ne connaît toujours pas l'identité : `--auteur` reste obligatoire (**CA5 non satisfait**), pas d'échec fermé côté outil (**CA10 non satisfait**), sécurité reposant sur des expressions régulières | ~0,5 j | Moyen : la valeur reste une déclaration, ce que la spec veut supprimer |

## Décision recommandée

**Option B**, parce que c'est la seule qui satisfait CA1-CA12 sans dépendre d'un comportement non maîtrisé de
Claude Code, et qu'en cas d'imprévu elle refuse au lieu d'ouvrir.

### Conception retenue

1. **Parseur commun** `siege/lib/options.js` : `options(args) → { o, reste }`, comportement actuel (`--a-b` → `a_b`
   pour le backlog, valeur vide si suivie d'une option) **plus** refus `ErreurOptions('option répétée : --<nom>')`
   avant toute action. Utilisé par `backlog.js`, `github.js`, `exception.js`, `agent.js`, `demande.js`
   (et `filiale.js` s'il a le même parseur). `--auteur` et `--role` sont comparés sur leur nom normalisé.
2. **Contexte d'agent** (pour l'échec fermé, R7) : un appel est « d'agent » si l'environnement contient
   `SIEGE_CONTEXTE=agent` (posé par le bloc `env` de `.claude/settings.json`, généré par `siege/droits.js`),
   ou `CLAUDECODE` (posé par Claude Code dans ses shells), ou `SIEGE_ROLE` (Copilot via `agent.js`).
   Sinon : humain (terminal du CEO), comportement actuel.
3. **Garde** (`siege/garde.js`) : après décision favorable sur un Bash, pour chaque segment dont les mots commencent
   par `node siege/(backlog|github|exception|agent|demande|filiale).js`, elle crée
   `~/.siege/identites/<sha256(JSON.stringify(mots sans « node »))>.json` = `{ role, expire }` avec
   `fs.writeFileSync(…, { flag: 'wx', mode: 0o600 })` (création exclusive : pas de verrou nécessaire, C3 non requis).
   Fichier déjà présent et non expiré pour un **autre** rôle → refus « commande identique en cours pour un autre rôle,
   réessaie ». Même rôle → l'entrée est conservée. Purge des entrées expirées (> 120 s) à chaque passage.
   Erreur d'écriture → refus (la garde est déjà fermée par défaut).
4. **Garde** (`siege/lib/garde.js`) : `ENV_INTERDITES` s'étend à `SIEGE_\w+`, `CLAUDECODE`, `CLAUDE_\w+` : un agent ne
   peut ni s'attribuer un rôle, ni effacer le marqueur de contexte, ni déplacer `SIEGE_PRIVE`. Export d'une fonction
   pure `cleIdentite(mots)` partagée avec l'outil.
5. **Outil** `siege/lib/identite.js` : `resoudre({ env, argv, racine }) → { humain: true } | { humain: false, role }`.
   Contexte d'agent : recalcule la clé depuis `['siege/<outil>.js', ...process.argv.slice(2)]`, lit puis supprime
   l'entrée (`unlinkSync` : la première consommation gagne), vérifie expiration et rôle connu de `droits/roles.json`.
   Entrée absente, expirée, illisible ou rôle inconnu → `ErreurIdentite('identité inconnue')` (CA10). Appelée au
   démarrage de chaque outil, avant toute écriture.
6. **Règles d'identité** (dans `lib/identite.js`) : `normaliser = s => String(s).trim().toLowerCase()` (R6).
   Pour un agent : `--auteur`/`--role` absent → identité imposée ; présent et `normaliser(v) !== normaliser(role)`
   → refus ; présent dans `identites_humaines` → refus avec le message « auteur réservé aux humains : CEO » (CA3, CA6, CA7).
   Le commentaire est enregistré avec la valeur canonique `role` (jamais la saisie).
7. **`backlog.js commenter`** : agent → `auteur = role`, `type = question | suivi` (jamais `reponse`, R5/CA8) ;
   humain → logique actuelle inchangée (`auteur = o.auteur || 'CEO'`, `reponse` si CEO) (R9/CA11).
   **`github.js`** : agent → `role` = identité imposée (`--role` facultatif, égal sinon refus) ; le jeton
   `gh.jetonRole` est émis pour ce rôle seulement (CA9) ; humain → `--role` obligatoire comme aujourd'hui.
   **`exception.js accorder|refuser`** : refus si appel d'agent (défense en profondeur ; la garde le refuse déjà).
8. **Journal** (R8) : extraction de `journal()` de `siege/garde.js` vers `siege/lib/journal.js` ; chaque refus
   d'identité (garde ou outil) écrit `{ evenement: 'refus_identite', role, demande, outil, sous_commande }` dans
   `~/.siege/journal-garde.jsonl`, sans texte de commentaire ni secret.
9. **Droits** (`droits/roles.json`) : l'outil devient l'autorité ; les expressions s'assouplissent pour permettre
   l'omission (CA5) : `^node siege/backlog\.js commenter ([A-Z]{3}|BUG)-\d{3}( |$)`, `github.js (pousser|pr)\b`,
   `github.js statut .*--contexte revue\b` (le contrôle `CONTEXTE_DU_ROLE` reste dans `github.js`). Ajout de
   `commun.identites_humaines: ["CEO"]`.

### Questions de la spec

- **Q1 (transport)** : registre à usage unique `~/.siege/identites/`, clé = empreinte des mots du segment autorisé
  (option B). Ni variable posée par l'agent, ni lecture d'un argument.
- **Q2 (noms réservés)** : liste `commun.identites_humaines` dans `droits/roles.json`, `["CEO"]` par défaut si absente,
  comparée normalisée. Elle sera alimentée plus tard par la configuration des personnes du workflow générique.
  `siege/droits.js appliquer` et `lib/identite.js` refusent un rôle d'agent dont le nom normalisé est réservé
  (erreur de configuration, échec fermé). La vraie barrière reste « auteur = son propre rôle » ; la liste sert au
  message explicite et à empêcher un rôle nommé comme un humain.
- **Q3 (option répétée pour les humains)** : oui, pour tous. Un seul parseur, un seul comportement ; aucun usage
  légitime connu ne répète une option (les appels internes d'`agent.js` sont vérifiés).
- **Q4 (autres moteurs)** : oui. Copilot : la garde (rôle = `SIEGE_ROLE`) dépose les entrées comme pour Claude,
  avec le `SIEGE_PRIVE` fourni par `agent.js`. Codex : aucun accès au backlog ni à GitHub ; `agent.js` inscrit la
  passation et pousse **en processus** (appel direct de `lib/github` au lieu du sous-processus `github.js pousser`,
  qui serait refusé faute d'entrée), avec l'identité = rôle lancé, limité à `ROLES` (jamais un humain).

## Impacts

- Fichiers / modules touchés :
  - nouveaux : `siege/lib/options.js`, `siege/lib/identite.js`, `siege/lib/journal.js` ;
  - modifiés : `siege/garde.js`, `siege/lib/garde.js`, `siege/backlog.js`, `siege/github.js`, `siege/exception.js`,
    `siege/agent.js`, `siege/demande.js` (+ `siege/filiale.js` si même parseur), `siege/droits.js` (bloc `env`
    `SIEGE_CONTEXTE=agent` dans la génération), `droits/roles.json`, `.claude/settings.json` (régénéré par
    `node siege/droits.js appliquer`, jamais à la main) ;
  - tests (suite `npm test`, arborescence existante) : un test par CA1-CA10 en nominal et en erreur, en appelant
    `main()` des outils avec un `SIEGE_PRIVE` temporaire et des entrées de registre fabriquées par `cleIdentite` ;
    test garde : `SIEGE_ROLE=CEO node siege/backlog.js …` et `CLAUDECODE= node …` refusés ; collision de clé.
- Contrat inter-filiales : non (`portfolio/interfaces.md` inchangé).
- Migration de données : aucune. Les commentaires existants ne sont ni relus ni réécrits (CA11 : comparaison
  avant/après de `portfolio/commentaires.json`). Le registre est éphémère et vide au démarrage.
- Dépendance nouvelle : aucune (`node:crypto`, `node:fs`).

## Risques et retour arrière

| Risque | Effet | Parade |
|---|---|---|
| Marqueur de contexte absent (Claude Code ne pose pas `CLAUDECODE`, `env` de settings non chargé) | Un agent serait vu comme humain (ouverture) | Trois marqueurs indépendants ; la garde interdit d'effacer `SIEGE_*`/`CLAUDE*` ; test d'intégration du dev : un sous-agent sans `--auteur` doit obtenir son rôle, `--auteur CEO` doit échouer |
| Clé recalculée différente de celle de la garde (guillemets, `\`, chemin `siege\backlog.js` de Copilot) | Refus « identité inconnue » d'un appel légitime (fermé) | Une seule fonction `cleIdentite` pour les deux côtés, sur les mots déjà normalisés par `normaliser`/`decouper` ; tests avec guillemets, accents, espaces |
| Deux appels identiques du même rôle au même instant | Le second est refusé (entrée déjà consommée) | Message clair ; l'agent relance. Le verrou général relève de C3 |
| Le CEO tape `! node siege/backlog.js …` dans une session Claude Code | Refusé (contexte d'agent, pas d'entrée) | Documenté : le CEO répond par le Siège (web/Notion) ou un terminal normal |
| `siege/server.js` lancé depuis une session Claude Code et appelant les outils en sous-processus | Actions humaines refusées | Le dev vérifie que le serveur appelle les bibliothèques (`src.commenter`) et non les CLI ; sinon il passe `humain` explicitement |
| Entrées orphelines (commande autorisée puis annulée) | Aucune (expiration 120 s) | Purge à chaque passage de la garde |

Hors périmètre rappelé : un processus malveillant hors garde qui écrirait lui-même dans `~/.siege/identites/` (N2) ;
l'authentification nominative des humains (P1).

**Retour arrière** : changement livré en une PR (classe critique : revue + sécurité + approbation CEO). En cas de
blocage en production (agents refusés à tort), le refus est fermé : les humains et le Siège web continuent de
fonctionner ; on revient en arrière par `revert` de la PR (fusion devops après approbation CEO) puis
`node siege/droits.js appliquer` pour régénérer `.claude/settings.json`. Le dossier `~/.siege/identites/` peut être
laissé en place (ignoré par l'ancienne version). Aucune donnée du backlog n'est à restaurer.

## Questions pour le CEO

Aucune bloquante. À confirmer lors de la validation : un humain hors contexte d'agent garde le droit actuel d'écrire
avec un `--auteur` quelconque (compatibilité R9 ; l'authentification des humains est en P1).
