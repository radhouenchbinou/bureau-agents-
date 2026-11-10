# EIA-001 — Rapport de recette QA (identité imposée)

Date : 2026-11-09 · Étape 5 · Branche `feature/EIA-001` (worktree `.../scratchpad/eia-001`, HEAD 141907c, 4 commits locaux, non poussée).
Spec : `docs/backlog/EIA-001-identite-imposee.md` (section « Plan de tests ») · ADR : `docs/adr/EIA-001-identite-imposee.md`.

## Verdict

**GO recette sous réserve de deux contrôles hors automatique** : (1) test E2E manuel sous le vrai bac à sable Claude Code (non faisable ici), (2) décision CEO sur G4. Aucune anomalie trouvée : **aucun ticket Bug créé**.

## 1. Suite complète

| Commande (dans `siege/`) | Résultat |
|---|---|
| `env -u CLAUDECODE npm test` | 65 tests, 65 pass, 0 fail |
| `CLAUDECODE=1 npm test` | 65 tests, 65 pass, 0 fail |
| `node --check` sur les 17 fichiers `.js` modifiés | OK |

Les suites existantes (garde, backlog, github, agents, copilot, moteurs, filiale, livraison, notion, jira, telegram, slack, teams) restent vertes ; les seules modifications de tests existants sont l'import de `test/_humain.js` (nettoyage de l'environnement), sans assertion affaiblie.

## 2. Critères d'acceptation

Méthode : tests de la suite (`options.test.js`, `identite.test.js`) **plus** une recette indépendante en processus réels (garde.js alimentée sur stdin comme le hook Claude Code, puis outil lancé avec `CLAUDECODE=1`, `SIEGE_PRIVE` et `SIEGE_RACINE` temporaires ; aucune écriture dans `~/.siege` ni dans le vrai backlog).

| CA | Verdict | Preuve (recette indépendante) |
|---|---|---|
| CA1 option répétée | OK | garde : « option répétée : --auteur » (code 2) ; y compris `--texte "--auteur" --auteur qa`, valeur identique, et `--auteur=qa` refusé explicitement (G1) |
| CA2 autres options / outils | OK | `--role` répété refusé (github) ; les 5 outils testés par `options.test.js` ; `--a-b`/`--a_b` normalisés |
| CA3 directeur ≠ CEO | OK | `--auteur CEO`, `"ceo "` refusés (garde et outil) ; `--auteur directeur` accepté ; journal `refus_identite` écrit |
| CA4 rôle ≠ auteur | OK | `qa2`, `""`, `--auteur` sans valeur : refusés ; `qa` accepté |
| CA5 auteur omis | OK | commentaire enregistré `qa/suivi` ; boucle sur tous les rôles dans la suite |
| CA6 casse / encodage | OK | `" QA "` enregistré `qa` ; `ＣＥＯ` (pleine chasse), `CЕO` (cyrillique), `C<U+200B>EO` refusés ; NBSP : retiré par `trim`, refusé comme CEO |
| CA7 question | OK | `--question --auteur CEO` refusé ; `--question` seul : type `question`, auteur `qa` |
| CA8 pas de voie vers `reponse` | OK | `--type reponse` ignoré (enregistré `suivi`) ; seule voie `reponse` = humain hors contexte d'agent |
| CA9 rôle GitHub | OK | `github.js pr --role reviewer` par dev-backend refusé ; `--role` répété refusé ; omis/égal : couvert par la suite (jeton du rôle imposé) |
| CA10 échec fermé | OK | rejeu après consommation : « identité inconnue » ; registre vide, entrée expirée (121 s), vide, JSON invalide, sans rôle, rôle entier / inconnu / `CEO` / `__proto__` / `constructor`, expiration trop lointaine, dossier absent, `roles.json` absent, `SIEGE_ROLE=fantome` : tous refusés. 119 s accepté. Marqueurs seuls (`SIEGE_CONTEXTE`, `CLAUDECODE`, `SIEGE_ROLE`) : refusé sans entrée |
| CA11 humain inchangé | OK | hors marqueurs : `--auteur CEO` → `CEO/reponse` ; `--auteur Marie` refusé comme avant (validation du backlog : agent ou CEO) |
| CA12 couverture | OK | test méta présent et vert ; 65/65 |

## 3. Cas limites, erreurs, garde (extraits)

- Texte arabe / accents (`é à ü مرحبا`) : enregistré intact, clé garde = clé outil. Espaces multiples entre mots : accepté (clé identique). Texte contenant `--auteur CEO` entre guillemets : une seule option, texte conservé.
- Commandes composées `A && B` : une entrée par segment (2 entrées vérifiées). Segment enveloppé `bash -c "…"`, `node ./siege/…`, `node /abs/siege/…`, `cd siege && node backlog.js`, `node -e require(…)` : refusés par la garde (comportement inchangé).
- Marqueurs forgés ou vidés : `SIEGE_ROLE=CEO …`, `CLAUDECODE= …`, `FOO=1 CLAUDE_X=1 …` refusés (variable interdite) ; `env -u CLAUDECODE`, `env SIEGE_ROLE=…`, `unset`, `export SIEGE_CONTEXTE=` refusés (commande non autorisée).
- Registre : `cat`/`ls ~/.siege`, redirection vers `~/.siege/identites` refusés pour qa et directeur (`lecture_interdite` et `ecriture_interdite` couvrent `~/.siege/**`).
- Collision : deux rôles, même commande → second refusé (« commande identique en cours pour un autre rôle, réessaie »), premier conserve son entrée. Dépôt dans un dossier en lecture seule → refus (« dépôt impossible »). Entrée créée mode 0600, dossier 0700.
- `exception.js accorder` par qa refusé ; `exception.js demander` par le directeur atteint l'outil (non-régression) ; `agent.js lancer` atteint l'outil (Codex désactivé par le CEO dans cet environnement : la cible `--role CEO` n'a pas pu être exercée en processus réel, voir limites).
- Journal : lignes `refus_identite` avec rôle, valeur demandée, outil, sous-commande ; aucun texte de commentaire ; JSON échappé (JSON.stringify), valeurs tronquées à 200 caractères.
- Matrice `droits/roles.json` : diff limité à `identites_humaines`, aux motifs `commenter` et `github.js` assouplis (le contrôle passe à l'outil) ; `.claude/settings.json` : seul le bloc `SIEGE_CONTEXTE=agent` ajouté.

## 4. Non testé ou non faisable en automatique

1. **E2E manuel sous le vrai bac à sable Claude Code (risque n°1 de l'ADR)** : vérifier qu'un sous-agent qa lance réellement `node siege/backlog.js commenter …` avec `CLAUDECODE` / `SIEGE_CONTEXTE` posés, que l'auteur enregistré est `qa`, et que `--auteur CEO` est refusé. Non faisable dans cette session (hook Claude Code non rejoué). **À faire par le CEO ou en session réelle avant fusion.** Mes tests simulent la garde (stdin) et l'outil (marqueur posé) : ils prouvent la logique, pas la propagation de l'environnement.
2. Faux serveurs Notion / Jira avec auteur imposé (R9), journal non inscriptible, injection de ligne dans le journal par test dédié, `agent.js lancer --role CEO` en processus réel, `droits.js appliquer` idempotent sur copie : non écrits par le dev (le dev l'a signalé) et non exécutés ici. Risque faible : le journal n'échoue jamais (try/catch) et la sérialisation est JSON.stringify.
3. Concurrence multi-processus (deux dépôts simultanés) : seule la création exclusive (`wx`) est lue dans le code, pas de test de charge.

## 5. Observations (pas des bugs)

- **G4 — décision CEO, non tranchée** : un humain en terminal garde un `--auteur` quelconque (R9). Constat : `--auteur Marie` est déjà refusé par la validation du backlog (`agent ou CEO` seulement), donc l'écart réel est faible. Le CEO décide s'il faut le restreindre.
- Corollaire à connaître : `.claude/settings.json` pose `SIEGE_CONTEXTE=agent` pour toute session Claude Code. Une commande `node siege/backlog.js …` lancée par le CEO depuis cette session (par exemple via `!`) n'a pas d'entrée de la garde et sera refusée « identité inconnue ». Le CEO répond depuis le Siège web ou un terminal hors Claude Code.
- Deux appels strictement identiques du même rôle exécutés en parallèle partagent une seule entrée : le second est refusé « identité inconnue » (message peu parlant). Attendu par le plan ; rejouer séquentiellement fonctionne.
- Les sous-commandes en lecture (`file`, `voir`…) consomment aussi une entrée pour un agent : conforme à l'ADR (échec fermé généralisé).

## 6. Bugs

Aucun. Aucun ticket Bug créé.

## 7. Critères de sortie du plan (section F)

`npm test` vert : oui. Cas E2E : faits en processus réels, hors bac à sable. Contrôle manuel du sandbox : **non passé, à exécuter**. Aucun Bug Bloquant ou Majeur ouvert : oui.
