# EIA-001 — Revue de code (identité imposée)

Date : 2026-11-09 · Étape 6 · Relecteur : reviewer
Branche `feature/EIA-001` (5 commits locaux sur `main`, HEAD 141907c, non poussée, pas de PR, donc pas de feu `agents/revue`).
Références : spec `docs/backlog/EIA-001-identite-imposee.md`, ADR `docs/adr/EIA-001-identite-imposee.md` (option B), rapport QA `docs/rapports/EIA-001-qa.md`.
Lignes données sur la branche `feature/EIA-001`.

## Verdict

**CHANGEMENTS DEMANDÉS** (mineurs, aucun bloquant).

La conception de l'ADR (option B) est respectée et le cœur du mécanisme est solide. Pour un changement de classe
critique, je demande trois corrections avant la PR : une course au dépôt dans le registre et deux trous de tests sur
des frontières de sécurité. `npm test` relancé sur un export de la branche : 65/65 vert.

## Ce qui est conforme

- **R1 / CA1-CA2** : un seul parseur `siege/lib/options.js` pour les 6 outils (backlog, github, exception, agent, demande, filiale). Option répétée refusée avant toute action, y compris `--a-b`/`--a_b` et `--opt=val` (G1 : refus explicite). La garde le refuse aussi (`controleOutil`, `siege/lib/garde.js:103`), avant le contrôle d'exception : une exception ne peut donc pas réautoriser `--auteur CEO`.
- **R2 / R7, registre `~/.siege/identites/`** : création exclusive `wx` + `0600` (`siege/lib/identite.js:68`), consommation atomique par `renameSync` vers un `.pris` propre au processus (`:88`), vérification de l'expiration dans les deux sens (`expire > maintenant + DUREE + 1 s` refusé), rôle connu de `roles.json` exigé (`hasOwnProperty`, donc `__proto__` est refusé). Toute anomalie aboutit à « identité inconnue ».
- **Clé liée à l'argv exact** : j'ai comparé la clé de la garde à l'argv réel produit par `bash -c` sur 10 formes (guillemets, `\"`, `C:\x`, `'a\b'`, `a\ b`, saut de ligne entre guillemets, `*`, `$HOME`, `~`, `{a,b}`). Les 6 formes littérales donnent la même clé. Les 4 formes avec expansion donnent une clé différente, donc un refus. C'est la bonne propriété : une divergence entre l'analyse de la garde et celle du shell (par exemple `{--auteur,CEO}`) ne peut jamais ouvrir, elle refuse.
- **ENV_INTERDITES étendu** (`siege/lib/garde.js:12`) : `CLAUDECODE`, `SIEGE_\w+`, `CLAUDE_\w+` couvrent le marqueur, le rôle, `SIEGE_PRIVE` et `SIEGE_RACINE`. Une affectation seule (`CLAUDECODE=` en segment isolé) passe aussi par ce contrôle avant d'être retirée. `env`, `export` et `unset` restent hors des droits.
- **Expressions assouplies de `roles.json`** (`droits/roles.json:32`, l. 146, 177, 234, 259, 293) : elles autorisent l'omission (CA5). L'outil reste l'autorité et la garde garde une défense en profondeur sur `--auteur`/`--role`. `CONTEXTE_DU_ROLE` est conservé dans `github.js statut`. La matrice rôle × sous-commande est inchangée.
- **R5 / CA8** : pour un agent, `type` vaut seulement `question` ou `suivi` (`siege/backlog.js:123`). Le canal humain (`server.js:124`, `src.commenter`) est intact et le serveur n'appelle pas les CLI : le risque de l'ADR « server.js lancé depuis Claude Code » est écarté.
- **agent.js ne lance plus `github.js`** (`siege/agent.js:122`) : il appelle en processus `pousserBranche` (`siege/github.js:111`). Ce chemin garde les mêmes contrôles que la sous-commande `pousser` (`gh.pousser` vérifie `BRANCHE`, `jetonRole` vérifie les droits GitHub du rôle). Le rôle est limité à `ROLES` (`agent.js:59`), donc jamais un humain (Q4).
- **R8** : `siege/lib/journal.js` écrit une ligne `refus_identite` (JSON.stringify, champs tronqués, sans texte ni jeton) et ne lève jamais d'erreur.
- **R9 / CA11** : le chemin humain reste inchangé (`o.auteur || 'CEO'`) et les commentaires existants ne sont pas réécrits (testé).
- **Lisibilité** : modules courts et commentés, dans le style du repo (une ligne dense par règle, messages en français). `siege/test/_humain.js` isole proprement les tests existants sans affaiblir d'assertion.

## Remarques

### Bloquant

Aucune.

### À corriger

1. **Course au dépôt : une entrée en cours d'écriture peut être remplacée par celle d'un autre rôle** — `siege/lib/identite.js:68-74`.
   `writeFileSync(f, …, { flag: 'wx' })` crée le fichier vide, puis écrit dedans. Si un second dépôt de la **même commande** pour un **autre rôle** arrive entre ces deux temps, il lit un fichier vide (`x = null`, l. 71), le supprime, puis dépose son propre rôle. L'outil du premier appel consomme alors l'entrée du second rôle : une exécution est attribuée au mauvais rôle. C'est le seul cas où le registre ne refuse pas. La portée est faible : il faut une commande identique, deux rôles que la garde autorise tous deux pour cette commande, et une fenêtre de quelques microsecondes. Mais le changement est de classe critique et l'ADR promet « échec fermé ».
   Correction : écrire dans un fichier temporaire (`f + '.' + process.pid + '.tmp'`, `wx`, `0600`), puis `fs.linkSync(tmp, f)` (atomique, échoue en `EEXIST`), puis `unlinkSync(tmp)`. Le fichier `f` n'est ainsi jamais visible partiellement écrit. Sur `EEXIST` avec un contenu illisible, ne supprimer que si `mtime` dépasse `DUREE_MS`, sinon refuser (« réessaie »). Ajouter un test qui dépose un `f` vide et récent puis appelle `deposer` pour un autre rôle : le résultat attendu est un refus, pas un remplacement.

2. **Le test « même clé garde / outil » ne compare pas les clés** — `siege/test/identite.test.js:152-157`.
   Pour 4 des 5 cas, il vérifie seulement `typeof cleIdentite(mots) === 'string'`, donc il passerait même si la garde et l'outil divergeaient. Seule la forme à espaces multiples est vraiment comparée. Or c'est la frontière du risque n°2 de l'ADR, et le commit modifie `decouper` (traitement de l'antislash entre guillemets, `siege/lib/garde.js:26-27`).
   Correction : pour chaque cas, lancer `bash -c` avec un script qui affiche `JSON.stringify(process.argv.slice(2))`, puis faire `assert.strictEqual(cleIdentite(outilsSiege(c)[0]), cleIdentite(['siege/backlog.js', ...argvReel]))`. Ajouter `--texte "C:\dossier"`, `'a\b'`, `a\ b`, un saut de ligne entre guillemets, ainsi qu'un cas d'expansion (`*` ou `{a,b}`) qui doit donner des clés **différentes**, ce qui documente l'échec fermé. Le contrôle fait pendant cette revue montre que le code actuel passerait ce test.

3. **Frontières non testées : le push Codex en processus et une partie d'ENV_INTERDITES** — `siege/agent.js:122`, `siege/github.js:111`, `siege/test/identite.test.js:175-177`.
   - Aucun test n'exerce `agent.js lancer --moteur codex … --pousser feature/X` après le changement. Le plan QA (section C, Q4) demande de vérifier que la passation porte `auteur = rôle lancé`, que le push passe par `pousserBranche` avec `jetonRole(…, rôle lancé)`, et qu'aucun sous-processus `github.js` n'est lancé. Correction : dans `test/moteurs.test.js` (faux Codex existant), remplacer `gh.jetonRole` et `gh.pousser` par des espions, puis vérifier l'auteur de la passation, le rôle du jeton, et qu'une branche `main` est refusée.
   - Le test « marqueur forgé » de la ligne 177 (`env SIEGE_PRIVE=/tmp/x …`) est refusé parce que la commande `env` n'est pas autorisée, pas parce que la variable est interdite : il ne teste donc pas l'extension d'ENV_INTERDITES. Correction : ajouter `SIEGE_PRIVE=/tmp/x node siege/backlog.js file`, `SIEGE_RACINE=/tmp/x node …`, `FOO=1 CLAUDE_X=1 node …` et `SIEGE_CONTEXTE= node …`, et vérifier le message « Variable d'environnement interdite ».

### Suggestions

4. **Messages de refus peu parlants sur une expansion shell** — `siege/lib/garde.js:111` (`outilsSiege`). Un `*`, `~`, `{…}` ou `$VAR` hors guillemets dans un segment `node siege/<outil>.js` aboutit plus tard à « identité inconnue » côté outil. Proposition : que `controleOutil` refuse d'emblée ces caractères hors guillemets pour les outils du Siège, avec le message « mettre la valeur entre guillemets ». C'est toujours fermé, mais l'agent sait quoi corriger.
5. **Le second dépôt du même rôle ne rafraîchit pas l'expiration** — `siege/lib/identite.js:72`. Une commande identique relancée à t+119 s garde l'expiration du premier dépôt et peut être refusée à t+121 s. Proposition : réécrire l'entrée (même rôle) avec une nouvelle expiration, par le même chemin tmp + rename.
6. **Dossier du registre déjà présent** — `siege/lib/identite.js:63`. `mkdirSync({ mode: 0o700 })` ne corrige pas les droits d'un dossier qui existe déjà. Proposition : `fs.chmodSync(d, 0o700)` après création, sous try.
7. **Motif `commenter` plus strict qu'avant** — `droits/roles.json:32`. `([A-Z]{3}|BUG)-\d{3}` refuse un préfixe qui n'a pas 3 lettres et les numéros à 4 chiffres (`BUG-1000`), alors que l'ancien motif acceptait `\S+`. Proposition : `([A-Z]{2,5}|BUG)-\d{3,4}`, ou documenter la contrainte dans `_lisez_moi` et dans `/nouvelle-filiale`.
8. **Autres champs d'identité non imposés (hors spec)** — `creer bug --detecte-par`, `maj --corrige-par` (`siege/backlog.js`, aide l. 38) acceptent toujours `CEO` venant d'un agent. Ce n'est pas un auteur de commentaire, donc c'est hors périmètre de la spec, mais c'est dans l'esprit de R4. Proposition : ouvrir un ticket de suite (ou l'intégrer à C4) qui passe ces deux options par `identite.imposer`.
9. **Windows sans `SIEGE_PRIVE`** — `siege/lib/identite.js:19` utilise `os.homedir()`, qui lit `USERPROFILE` sous Windows. Cette variable n'est pas dans ENV_INTERDITES (`HOME` l'est). Le cas Copilot n'est pas concerné, puisqu'`agent.js` pose `SIEGE_PRIVE`. Proposition : ajouter `USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA` à ENV_INTERDITES, par défense en profondeur. Les quotes PowerShell divergent aussi de `decouper`, mais l'effet est un refus fermé ; le documenter dans l'ADR.
10. **Duplication** — `siege/github.js:42-44` (`case 'pousser'`) et `pousserBranche` (`:111`) font le même travail. Proposition : que `case 'pousser'` appelle `pousserBranche` pour garder un seul chemin.
11. **Risque résiduel à consigner (hors périmètre, N2)** — un rôle qui peut exécuter du code arbitraire (par exemple `npm test` sur un test qu'il a écrit) peut lancer un outil du Siège avec un environnement vidé, et sera alors vu comme humain. L'ADR le range en N2. À rappeler explicitement dans la PR pour la décision du CEO.

## Points ouverts hors code (repris du QA, toujours ouverts)

- **E2E sous le vrai bac à sable Claude Code** (risque n°1 de l'ADR) : vérifier qu'un sous-agent qa obtient `auteur = qa` sans `--auteur` et que `--auteur CEO` est refusé. À faire avant la fusion.
- **G4** : la liberté d'un humain en terminal sur `--auteur` (R9) reste à confirmer par le CEO. L'écart réel est faible : la validation du backlog n'accepte que « agent ou CEO ».
- Corollaire à documenter pour le CEO : avec `SIEGE_CONTEXTE=agent` dans `.claude/settings.json`, un `! node siege/backlog.js …` tapé par le CEO dans une session Claude Code est refusé. Il faut passer par le Siège web ou un terminal ordinaire.

## Périmètre

Aucun changement hors périmètre. Le changement de `decouper` (antislash entre guillemets, `siege/lib/garde.js:26-27`) est nécessaire pour que la garde et l'outil calculent la même clé, et il est plus fidèle à bash. Il doit cependant être couvert par le test demandé au point 2.
