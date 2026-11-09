# EIA-001 · C2 · Identité imposée

- Jalon : P0 · Effort : S · Risque : faible · Dépend de : — · Débloque : C4, N4
- Référence : `conception-validee.md`, feuille de route C2 ; constats R6 et R7.
- Classe de risque : critique (modification de `garde`, `droits`, `backlog.js`, `github.js` : fiche, règle rssi-devsecops).
- Impact autres filiales : non.

## User story

En tant que CEO, je veux que l'identité de l'auteur d'une action (commentaire, question, rôle GitHub) soit fixée par le contexte de la garde et non par un argument de ligne de commande, afin qu'aucun agent ne puisse écrire ou décider au nom d'une autre personne ou d'un autre rôle, humain compris.

## Constat (R6, R7)

- `commenter X --auteur qa --texte … --auteur CEO` est accepté : le dernier `--auteur` gagne (`siege/backlog.js`).
- Le directeur peut écrire `--auteur CEO` ; même motif pour `--role` dans `github.js pr`.
- Une valeur d'identité passée en argument est donc une déclaration, pas une preuve.

## Règles métier

- R1. Toute option de la ligne de commande des outils du Siège (`backlog.js`, `github.js`, `exception.js`, `agent.js`, `demande.js`) apparaît au plus une fois ; une option répétée est refusée avec un message explicite, sans effet de bord (aucune écriture).
- R2. L'identité de l'acteur (nom de rôle de l'agent) est déterminée par le contexte que la garde établit pour l'agent (rôle de la session), jamais par un argument.
- R3. `--auteur` (backlog) et `--role` (github) deviennent facultatifs et, s'ils sont fournis, doivent être égaux à l'identité imposée ; toute autre valeur est refusée. Valeur absente : l'identité imposée est utilisée.
- R4. Aucun rôle d'agent (directeur compris) ne peut écrire sous l'identité `CEO` ni sous celle d'une autre personne humaine : les auteurs `CEO`, `ceo` et tout nom de personne ou de rôle humain sont réservés aux actions venant des interfaces humaines (Siège, Notion, Jira).
- R5. Une réponse du CEO (`[reponse]`) ne peut être produite que par le canal humain du Siège ; aucune sous-commande accessible à un agent ne peut créer une entrée de type réponse ni se déclarer humaine.
- R6. La comparaison d'identité est insensible à la casse et aux espaces ; `CEO`, `ceo`, ` CEO ` sont refusés de la même façon pour un agent.
- R7. Si le contexte de la garde est absent ou illisible pour un appel d'agent, l'appel est refusé (échec fermé), jamais traité comme un humain.
- R8. Chaque refus d'identité est consigné dans le journal de la garde (rôle réel, valeur demandée, outil, sous-commande), sans secret.
- R9. Les usages humains actuels (CEO via le Siège ou ligne de commande hors contexte d'agent) continuent de fonctionner avec compatibilité des données existantes : les commentaires déjà enregistrés ne sont pas modifiés.

## Critères d'acceptation

- CA1 (option répétée). Given un agent `qa`, When il lance `node siege/backlog.js commenter EIA-001 --auteur qa --texte "x" --auteur CEO`, Then la commande est refusée (code de sortie non nul, message « option répétée : --auteur »), et aucun commentaire n'est ajouté au ticket.
- CA2 (option répétée, autre option). Given un agent quelconque, When il lance `commenter EIA-001 --texte "a" --texte "b" --auteur qa`, Then refus et aucune écriture ; idem pour `github.js pr … --role dev-backend --role reviewer`.
- CA3 (directeur ne parle pas pour le CEO). Given une session du directeur, When il lance `commenter EIA-001 --auteur CEO --texte "validé"`, Then refus, aucun commentaire, une ligne de refus dans le journal de la garde (R8).
- CA4 (auteur différent du rôle). Given une session `product-owner`, When elle lance `commenter EIA-001 --auteur qa --texte "x"`, Then refus ; avec `--auteur product-owner`, Then succès et le commentaire porte l'auteur `product-owner`.
- CA5 (auteur omis). Given une session `product-owner`, When elle lance `commenter EIA-001 --texte "x"` sans `--auteur`, Then le commentaire est enregistré avec l'auteur `product-owner` imposé par la garde.
- CA6 (casse et espaces). Given une session du directeur, When elle lance `--auteur "ceo "` ou `--auteur Ceo`, Then refus comme CA3.
- CA7 (question au CEO). Given une session `qa`, When elle lance `commenter … --question --auteur CEO --texte "?"`, Then refus ; avec son propre nom, la question est créée et le ticket reste bloqué comme aujourd'hui.
- CA8 (réponse réservée). Given une session d'agent quelconque, When elle tente de créer une entrée de type `reponse` (sous-commande ou option existante), Then refus ; l'ajout d'une réponse par le canal humain du Siège (interface web ou Notion) reste possible.
- CA9 (rôle GitHub). Given une session `dev-backend`, When elle lance `github.js pr … --role reviewer`, Then refus ; sans `--role` ou avec `--role dev-backend`, le jeton émis porte les droits de `dev-backend` seulement.
- CA10 (échec fermé). Given un appel d'outil sans contexte de garde (variable ou fichier d'identité absent, vide ou invalide) lancé comme agent, When il écrit un commentaire, Then refus avec un message « identité inconnue ».
- CA11 (non-régression humaine). Given un humain hors contexte d'agent (usage actuel du CEO), When il répond via le Siège, Then la réponse est enregistrée avec l'auteur `CEO` ; les commentaires existants du fichier de backlog restent identiques (comparaison avant/après).
- CA12 (tests). Given la suite `npm test`, When elle s'exécute, Then elle contient au moins un test de garde par critère CA1 à CA10 (cas d'erreur et cas nominal) et tous passent.

## Hors périmètre

- Statuts libres et « Livré » sans preuve (`maj`, commande `transition`) : C4.
- Approbations liées à une version : N4.
- Verrou inter-processus et identifiants en double : C3.
- Exceptions liées à l'exécution : C5.
- Authentification forte des humains (SSO, comptes nommés, audit nominatif) : P1.
- Anti-falsification du contexte par un processus malveillant hors garde (isolation par conteneur) : N2.

## Questions ouvertes

- Q1. Mécanisme de transport de l'identité imposée entre la garde et l'outil (variable d'environnement posée par la garde, fichier de session, ou lecture du rôle par l'outil) : choix technique à trancher par l'architecte dans l'ADR (étape 2).
- Q2. Liste exacte des noms réservés aux humains : seulement `CEO` aujourd'hui ; faut-il lire la liste des personnes dans la configuration (personnes et rôles humains du workflow) ? Proposition : liste de noms réservés dans la configuration, `CEO` par défaut.
- Q3. Faut-il aussi refuser l'option répétée pour les outils hors agents (usage humain en ligne de commande) ? Proposition : oui, pour tous, afin d'avoir un seul comportement.
- Q4. Le moteur « autre moteur » (`agent.js lancer --moteur codex|copilot`) doit-il poser le même contexte d'identité ? Proposition : oui, et l'identité est celle du rôle lancé.

Aucune de ces questions ne bloque la spécification ; Q1 relève de la conception.

## Grille INVEST

Indépendante (aucune dépendance) · Négociable (Q1 à Q4) · Valeur (ferme R6 et R7, prérequis de C4 et N4) · Estimable (S) · Small (≤ 2 jours) · Testable (CA1 à CA12).

## Plan de tests

Rédigé à l'étape 3 (QA) à partir de la spec et de l'ADR (option B : registre à usage unique `~/.siege/identites/`, parseur `lib/options.js`, `lib/identite.js`, `cleIdentite`, journal `lib/journal.js`).

Conventions : suite `npm test` (`node --test test/*.test.js`), fichiers à créer ou étendre dans `test/` (`options.test.js`, `identite.test.js`, `garde.test.js`, `backlog.test.js`, `github.test.js`). Tous les tests utilisent un `SIEGE_PRIVE` et un `portfolio` temporaires (aucune écriture dans `~/.siege` ni dans le vrai backlog, aucun secret). Types : U = unitaire, I = intégration (appel de `main()` des outils ou de la garde avec registre fabriqué), E2E = lancement réel du processus `node siege/…` avec environnement contrôlé. Chaque test de refus vérifie trois choses : code de sortie non nul, message attendu, **aucune écriture** (fichier de backlog identique octet pour octet) ; chaque refus d'identité vérifie aussi la ligne de journal (R8).

### A. Critères d'acceptation

| CA | Cas | Type | Données | Résultat attendu |
|---|---|---|---|---|
| CA1 | Option `--auteur` répétée (agent) | I + E2E | `commenter EIA-001 --auteur qa --texte "x" --auteur CEO`, rôle qa | Sortie ≠ 0, « option répétée : --auteur », 0 commentaire ajouté |
| CA1 | Nominal : même commande sans répétition | I | `commenter EIA-001 --auteur qa --texte "x"`, rôle qa | Succès, 1 commentaire, auteur `qa` |
| CA1 | Répétée avec la même valeur | U | `--auteur qa … --auteur qa` | Refus quand même (la répétition est refusée quelle que soit la valeur) |
| CA2 | `--texte` répété | I | `commenter EIA-001 --texte "a" --texte "b" --auteur qa` | Refus « option répétée : --texte », aucune écriture |
| CA2 | `--role` répété dans `github.js pr` | I | `github.js pr … --role dev-backend --role reviewer` (GitHub simulé) | Refus, aucun jeton émis, aucun appel réseau simulé |
| CA2 | Option répétée sur chaque outil | U | `backlog`, `github`, `exception`, `agent`, `demande` avec `--x 1 --x 2` | Les 5 outils lèvent `ErreurOptions` avant toute action (Q3 : valable aussi hors agent) |
| CA2 | Forme équivalente `--a-b` et `--a_b` | U | `--filiale X --filiale Y`, `--detecte-par a --detecte_par b` | Répétition détectée sur le nom normalisé |
| CA3 | Directeur écrit `--auteur CEO` | I | rôle directeur, `commenter EIA-001 --auteur CEO --texte "validé"` | Refus « auteur réservé aux humains : CEO », aucun commentaire, ligne `refus_identite` (role `directeur`, demande `CEO`, outil `backlog`, sous_commande `commenter`) |
| CA3 | Directeur avec son propre nom | I | `--auteur directeur` et sans `--auteur` | Succès, auteur `directeur`, type `suivi` |
| CA4 | Rôle ≠ auteur | I | rôle product-owner, `--auteur qa` | Refus, aucune écriture, ligne de journal |
| CA4 | Nominal | I | rôle product-owner, `--auteur product-owner` | Succès, auteur `product-owner` |
| CA4 | Auteur inconnu / vide | U | `--auteur ""`, `--auteur inconnu`, `--auteur` sans valeur suivi d'une option | Refus (valeur vide ≠ absente : pas d'ouverture silencieuse) |
| CA5 | Auteur omis | I | rôle product-owner, `commenter EIA-001 --texte "x"` | Succès, auteur enregistré `product-owner` (valeur canonique du rôle) |
| CA5 | Auteur omis pour chaque rôle de `roles.json` | I | boucle sur tous les rôles | Chaque commentaire porte son rôle ; jamais `CEO` |
| CA6 | Variantes de casse et d'espaces | U + I | directeur : `"ceo "`, `Ceo`, `" CEO"`, `"CEO\t"`, `cEo` | Tous refusés comme CA3 |
| CA6 | Casse sur le rôle propre | I | rôle qa, `--auteur QA`, `" qa "` | Succès, enregistré `qa` (canonique, pas la saisie) |
| CA6 | Caractères d'encodage proches | U | `CЕO` (E cyrillique), `ＣＥＯ` (pleine chasse), `CEO` + espace insécable U+00A0, `C​EO` (espace de largeur nulle) | Refus (≠ identité propre) ; pas de contournement par normalisation Unicode partielle |
| CA7 | Question avec auteur CEO | I | rôle qa, `commenter … --question --auteur CEO --texte "?"` | Refus, aucune écriture, ticket non bloqué |
| CA7 | Question nominale | I | rôle qa, `--question --auteur qa` et sans `--auteur` | Question créée (type `question`), ticket passe Bloqué comme avant |
| CA8 | Aucune voie vers `reponse` pour un agent | I | rôle qa et directeur : `commenter` avec `--type reponse`, `--reponse`, `--auteur CEO`, option inconnue | Refus ou option ignorée ; dans tous les cas aucune entrée de type `reponse` créée |
| CA8 | Parcours du code | U | Énumérer les sous-commandes de `backlog.js` et `droits/roles.json` | Aucune sous-commande accessible aux rôles d'agent n'écrit un type `reponse` (liste figée dans le test, échec si une sous-commande est ajoutée sans revue) |
| CA8 | Canal humain intact | I | Réponse via l'API du Siège (`src.commenter` côté serveur) | Entrée `reponse`, auteur `CEO`, la question est considérée répondue |
| CA9 | `--role` ≠ rôle | I | rôle dev-backend, `github.js pr … --role reviewer` | Refus, aucun jeton émis, ligne de journal |
| CA9 | `--role` omis | I | rôle dev-backend, `github.js pr …` | Jeton demandé pour `dev-backend` uniquement (vérifier l'argument de `gh.jetonRole`) |
| CA9 | `--role` égal | I | rôle dev-backend, `--role dev-backend` | Idem, droits de `dev-backend` seuls |
| CA9 | `pousser` et `statut` | I | `github.js pousser` sans `--role` ; `statut --contexte revue` par reviewer ; par dev-backend | pousser : rôle imposé ; statut revue : accepté pour reviewer, refusé pour dev-backend (`CONTEXTE_DU_ROLE` conservé) |
| CA10 | Registre vide | I | contexte agent (`SIEGE_CONTEXTE=agent`), aucune entrée, `commenter … --texte x` | Refus « identité inconnue », aucune écriture |
| CA10 | Entrée expirée | I | entrée `expire` dans le passé | Refus « identité inconnue » |
| CA10 | Entrée illisible | I | fichier vide, JSON invalide, JSON sans `role`, `role` non entier | Refus « identité inconnue » pour chaque cas |
| CA10 | Rôle inconnu | I | entrée `{role: "pirate"}` | Refus « identité inconnue » |
| CA10 | Dossier `identites/` absent ou non lisible | I | `SIEGE_PRIVE` sans le dossier ; dossier en mode 000 | Refus fermé, pas d'exception non gérée |
| CA10 | Chaque marqueur seul | I | seulement `SIEGE_CONTEXTE`, seulement `CLAUDECODE`, seulement `SIEGE_ROLE` | Contexte d'agent détecté dans les trois cas, refus sans entrée |
| CA10 | Usage unique | I | deux exécutions successives de la même commande avec une seule entrée | La première réussit, la seconde est refusée (entrée consommée) |
| CA10 | Autre commande | I | entrée déposée pour `commenter EIA-001 --texte a`, exécution de `commenter EIA-001 --texte b` | Refus (clé différente) ; l'entrée de la commande « a » reste intacte |
| CA11 | Humain hors contexte d'agent | I | aucun marqueur, `commenter … --texte x` | Succès, auteur `CEO`, type `reponse` (logique actuelle) |
| CA11 | Réponse via le Siège web | E2E | démarrer `server.js` sur un port libre et un portfolio temporaire, POST d'une réponse | Commentaire `reponse`, auteur `CEO` |
| CA11 | Comparaison avant/après | I | copie de `portfolio/commentaires.json` avec les entrées historiques (dont `--auteur CEO`), exécuter les nouveaux outils (lecture, `commentaires`, `questions`, `file`, un `commenter` valide) | Les entrées antérieures sont identiques octet pour octet ; seule une entrée est ajoutée en fin de fichier |
| CA11 | Lecture des anciennes données | I | commentaires sans champ de type, ou avec auteur arbitraire | `commentaires` et `questions` fonctionnent comme avant |
| CA12 | Couverture de la suite | U | Test méta : lire les fichiers de test et vérifier la présence d'un test nommé `CA1` à `CA10` (nominal et erreur) | Échec si un critère n'a pas son test ; `npm test` entier vert |

### B. Cas limites

| CA | Cas | Type | Données | Résultat attendu |
|---|---|---|---|---|
| R1/CA1 | Option au début, au milieu, à la fin | U | `--auteur` répété avant ou après les arguments positionnels | Détection indépendante de la position |
| R1 | Option dont la valeur ressemble à une option | U | `--texte "--auteur"` (valeur littérale) | Pas de fausse détection de répétition : une valeur n'est pas une option |
| R1 | Option avec valeur entre guillemets contenant un espace et `=` | U | `--texte "a --auteur CEO"` | Une seule option `--texte` ; aucun refus, texte conservé tel quel |
| R1 | Forme `--auteur=qa` | U | `--auteur=qa --auteur CEO` | Même traitement que la forme séparée (si la forme `=` est supportée, répétition refusée ; sinon l'argument est rejeté explicitement), jamais d'écrasement silencieux |
| R1 | Option unique répétée sur indicateur booléen | U | `--question --question` | Refus |
| R2 | Texte très long, accents, arabe | I | `--texte` avec « é à ü », texte arabe, emoji, 10 000 caractères, retours à la ligne | Commentaire enregistré intact ; la clé `cleIdentite` côté garde et côté outil est identique (pas de refus « identité inconnue » à tort) |
| R2 | Guillemets, apostrophes, antislash | I | `--texte "l'agent dit \"ok\""`, chemins avec `\`, `siege\backlog.js` (forme Copilot) | Clé identique des deux côtés ; commande autorisée |
| R2 | Espaces multiples entre mots | I | `commenter   EIA-001   --texte   x` | Même clé que la forme à espaces simples, ou refus fermé identique des deux côtés (jamais d'ouverture) |
| R2 | Ordre des options inversé | I | `--texte x --auteur qa` contre `--auteur qa --texte x` | Les deux réussissent chacune avec sa propre entrée |
| R2 | Collision de clé, même commande, deux rôles | I | rôle qa dépose, puis rôle dev-backend, même commande dans les 120 s | La garde refuse le second (« commande identique en cours pour un autre rôle, réessaie ») ; le premier garde son entrée |
| R2 | Même commande, même rôle, deux fois | I | rôle qa deux fois | Entrée conservée ; une seule exécution consomme ; la seconde exécution est refusée à l'outil (message clair) |
| R2 | Commandes composées | I | `node siege/backlog.js commenter … && node siege/backlog.js commenter …` ; pipe ; `;` | Une entrée par segment ; chaque segment résout son identité ; aucun segment sans entrée |
| R2 | Segment enveloppé | I | `bash -c "node siege/backlog.js …"`, `$(…)`, substitution, redirection | Refus par la garde (comportement actuel inchangé) ou entrée correcte ; jamais une exécution avec un rôle erroné |
| R2 | Expiration à la frontière | I | entrée à 119 s, à 120 s, à 121 s (horloge injectée) | Acceptée à 119 s, refusée au-delà de 120 s |
| R2 | Purge | I | 50 entrées expirées + 1 valide, passage de la garde | Seules les expirées sont supprimées ; l'entrée valide intacte |
| R2 | Fuseau horaire et horloge | U | Horloge système en UTC+13 / UTC-12 ; saut en arrière de l'horloge | Expiration calculée en millisecondes absolues, comportement identique ; une entrée « du futur » trop éloignée est refusée |
| R2 | Coupure en cours d'écriture | I | Entrée écrite à moitié (fichier tronqué), process tué entre dépôt et consommation | Refus fermé « identité inconnue » ; purge à l'expiration ; pas de corruption du backlog |
| R2 | Création exclusive | I | Deux dépôts concurrents de la même clé (deux processus) | Un seul réussit (`wx`) ; pas d'entrée écrasée |
| R3 | `--auteur` avec espaces internes | U | `--auteur "product owner"` | Refus (≠ `product-owner`) |
| R3 | `--auteur` avec un préfixe ou suffixe | U | `qa2`, `qaa`, `xqa`, `qa,CEO`, `qa;CEO` | Refus (comparaison d'égalité stricte après normalisation, jamais `startsWith`) |
| R3 | Expression de `roles.json` assouplie | U | Rôle qa : motif de `commenter` sans `--auteur`, avec `--auteur` en milieu de ligne | La garde autorise ; l'outil reste l'autorité (CA4/CA6 toujours refusés par l'outil) |
| R4 | Noms de personnes autres que CEO | U | `identites_humaines` = `["CEO","Marie"]` | Refus de `Marie`, `marie ` pour tout rôle d'agent ; liste lue depuis `roles.json` |
| R4 | Liste absente | U | `commun.identites_humaines` supprimé | Valeur par défaut `["CEO"]` |
| R4 | Rôle d'agent nommé comme un humain | U | `roles.json` avec un rôle `ceo` ou `CEO ` | `droits.js appliquer` et `identite.resoudre` lèvent une erreur de configuration (échec fermé) |
| R4 | Liste vide ou mal formée | U | `[]`, `null`, chaîne, éléments non textuels | La liste par défaut `["CEO"]` s'applique (ou erreur de configuration) ; jamais d'ouverture |
| R5 | Type de commentaire dérivé de l'identité imposée | U | agent avec auteur omis : ancien comportement « auteur absent = CEO » | Auteur = rôle ; type jamais `reponse` ; l'ancien repli sur `CEO` ne s'applique plus aux agents |
| R7 | Contexte présent mais rôle introuvable dans `roles.json` | I | `SIEGE_ROLE=fantome` | Refus fermé |
| R7 | Marqueur vidé par l'agent | I | garde : `CLAUDECODE= node siege/backlog.js …`, `env -u CLAUDECODE node …`, `unset CLAUDECODE; node …`, `export SIEGE_CONTEXTE=` | Refus par la garde (ENV_INTERDITES étendu) |
| R7 | Marqueur forgé | I | garde : `SIEGE_ROLE=CEO node siege/backlog.js …`, `SIEGE_ROLE=qa node …` depuis le directeur, `SIEGE_PRIVE=/tmp/x node …`, `SIEGE_IDENTITE=…` | Refus par la garde pour chaque cas |
| R7 | Variantes d'affectation | I | `FOO=1 SIEGE_ROLE=CEO node …`, `env SIEGE_ROLE=CEO node …`, `VAR="a b" CLAUDE_X=1 node …` | Refus (`SIEGE_\w+`, `CLAUDE_\w+`, `CLAUDECODE`) |
| R7 | Lecture/écriture du registre par un agent | I | garde : `cat ~/.siege/identites/*`, `echo '{}' > ~/.siege/identites/x.json`, `ls ~/.siege`, outil Write/Edit/Read sur `~/.siege/**` | Refus pour tous les rôles (lecture et écriture interdites) |
| R8 | Contenu du journal | I | Provoquer chaque type de refus (CA3, CA4, CA6, CA7, CA9, CA10) | Une ligne par refus : `{evenement:"refus_identite", role, demande, outil, sous_commande}` ; aucun champ texte de commentaire, aucun jeton |
| R8 | Journal inaccessible | I | `journal-garde.jsonl` non inscriptible | Le refus d'identité a quand même lieu (fermé) ; pas d'exception qui laisserait passer l'écriture |
| R8 | Valeurs à injecter dans le journal | U | `--auteur` contenant `\n`, guillemets, 5 000 caractères, `{"role":"CEO"}` | Ligne JSON valide unique, valeur tronquée ou échappée, aucune injection de ligne |
| R9 | Humain avec `--auteur` quelconque | I | aucun marqueur, `--auteur Marie` | Succès comme aujourd'hui (confirmation demandée au CEO dans l'ADR) |
| R9 | Fichier de backlog absent ou JSON corrompu | I | `commentaires.json` absent / tronqué | Comportement identique à l'actuel (création ou erreur claire), sans perte des données |
| R9 | Notion / Jira comme source | I | faux serveurs `test/faux-notion.js`, `faux-jira.js` : commenter en agent et en humain | L'auteur imposé est transmis à la source ; une réponse humaine venant de Notion/Jira reste de type `reponse` |

### C. Cas d'erreur

| CA | Cas | Type | Données | Résultat attendu |
|---|---|---|---|---|
| CA1-CA10 | Sortie d'erreur | I | Tous les refus | Message sur stderr, code ≠ 0, aucune trace de pile exposant des chemins privés ; aucune écriture (hash du backlog identique) |
| CA10 | Disque plein / dossier du registre non inscriptible côté garde | I | Garde avec `~/.siege/identites` en lecture seule | La garde refuse la commande (pas d'autorisation sans entrée) |
| CA10 | `droits/roles.json` absent ou invalide à la résolution | I | fichier absent, JSON invalide | Refus fermé « identité inconnue » ou erreur de configuration, jamais traité comme humain |
| CA9 | GitHub 401 / 403 / 429 / 503 / timeout | I | `github.js pr` avec GitHub simulé en erreur, rôle valide | Erreur propre, aucun jeton conservé, identité non modifiée, pas de nouvel essai avec un autre rôle |
| CA9 | Jeton demandé pour un rôle sans droits GitHub | I | rôle `qa` (si non autorisé), `github.js pr` | Refus par les droits existants (non-régression) |
| CA11 | Notion injoignable / jeton absent | I | faux serveur indisponible, jeton absent | Erreur signalée comme aujourd'hui, aucun repli en édition directe des fichiers |
| Q4 | Moteur Codex | I | `agent.js lancer --moteur codex` (processus simulé) | Passation inscrite avec `auteur` = rôle lancé, limité à `ROLES` ; push en processus par appel de `lib/github` ; aucun appel du CLI `github.js pousser` |
| Q4 | Moteur Copilot | I | `SIEGE_ROLE=qa` + `SIEGE_PRIVE` fournis par `agent.js`, garde Copilot | Entrées déposées, identité = rôle lancé ; `--auteur CEO` refusé |
| Q4 | `agent.js lancer --role CEO` | I | rôle humain demandé | Refus (jamais un humain) |
| Q3 | `exception.js accorder` / `refuser` par un agent | I | contexte agent, EXC existante | Refus (défense en profondeur), état de l'exception inchangé ; humain : fonctionne |
| Q3 | `exception.js demander` par le directeur | I | `--agent qa --ticket EIA-001 …` | Fonctionne (non-régression), l'option `--agent` reste une cible et non l'identité de l'acteur |

### D. Tests de la garde (frontières de sécurité)

| CA | Cas | Type | Données | Résultat attendu |
|---|---|---|---|---|
| R2 | Dépôt d'entrée à l'autorisation | I | Garde reçoit un Bash `node siege/backlog.js commenter EIA-001 --texte x` pour qa | Décision « autoriser » et entrée `{role:"qa", expire}` créée sous la clé `cleIdentite` ; mode 0600 |
| R2 | Aucun dépôt en cas de refus | I | Commande refusée par les droits (rôle sans droit, commande interdite) | Aucune entrée créée |
| R2 | Aucun dépôt hors outils du Siège | I | `ls`, `node autre.js`, `node siege/inconnu.js` | Aucune entrée |
| R2 | Rôle déduit du contexte | I | `agent_type` renseigné ; absent + `SIEGE_ROLE` ; absent + rien | Rôle = agent_type, puis SIEGE_ROLE, puis directeur ; l'entrée porte ce rôle |
| R7 | Usurpation inter-processus | I | Agent A dépose via la garde, un processus d'agent B tente de consommer avec une autre commande | B refusé ; l'entrée de A intacte |
| R7 | Rejeu | I | Même commande rejouée après consommation sans nouveau passage de la garde | Refus « identité inconnue » |
| R7 | Contournement par `node` alternatif | I | `node ./siege/backlog.js`, `node /abs/siege/backlog.js`, `node siege/../siege/backlog.js`, `cd siege && node backlog.js` | Soit autorisé avec clé identique des deux côtés, soit refusé par la garde ; jamais exécuté sans entrée et reconnu comme humain |
| R7 | Exécution directe d'une fonction de l'outil | I | `node -e "require('./siege/backlog.js').main([...])"`, `node --eval`, `node -p` | Refus de la garde (comportement existant) ; test de non-régression |
| R7 | Édition du backlog à la main | I | `echo … >> portfolio/commentaires.json`, `sed -i`, Write/Edit sur `portfolio/*.json` | Refusé pour tous les rôles sauf cas déjà autorisés (non-régression) |
| R7 | Sandbox | E2E (manuel, voir remarque) | Lancer réellement une session Claude Code avec un sous-agent qa : sans `--auteur`, puis avec `--auteur CEO` | Auteur `qa` ; l'autre refusé. Vérifie que `CLAUDECODE` / `SIEGE_CONTEXTE` sont bien posés (risque n°1 de l'ADR) |
| R7 | Commandes préfixées par une variable inoffensive | I | `FOO=1 node siege/backlog.js …` | Autorisé et clé identique des deux côtés (le préfixe n'entre pas dans les mots), ou refus fermé identique |
| Droits | Expressions assouplies de `roles.json` | U | Pour chaque rôle : `commenter` valide sans `--auteur` ; `commenter` avec ticket mal formé (`EIA-1`, `eia-001`, `../x`) ; `github.js pousser/pr` ; `statut --contexte revue` | Valides acceptées, malformées refusées ; la matrice rôle × sous-commande de `roles.json` est inchangée en dehors de l'auteur et du rôle |
| Droits | Directeur | U | `maj`, `creer`, `commenter` du directeur | Toujours permis, mais `commenter` avec auteur humain refusé par l'outil |
| Droits | Génération de `.claude/settings.json` | U | `droits.js appliquer` sur une copie | Le bloc `env` contient `SIEGE_CONTEXTE=agent` ; le reste du fichier inchangé (diff attendu limité) ; `appliquer` est idempotent |
| Droits | Rôle réservé | U | `roles.json` avec un rôle nommé comme une identité humaine | `appliquer` échoue avec un message explicite |

### E. Non-régression

Suites existantes qui doivent rester **entièrement vertes** (aucune modification de leurs assertions, sauf ajout) : `test/garde.test.js` (droits, ENV_INTERDITES, sessions d'étapes, exceptions), `test/backlog.test.js` (file, maj, commenter, questions, créer bug), `test/github.test.js` (jeton par rôle, `CONTEXTE_DU_ROLE`, feux revue/sécurité), `test/agents.test.js`, `test/copilot.test.js`, `test/moteurs.test.js`, `test/filiale.test.js`, `test/livraison.test.js`, `test/notion.test.js`, `test/jira.test.js`, `test/telegram.test.js`, `test/slack.test.js`, `test/teams.test.js`.

Points de vigilance : tout test existant qui appelle un outil avec `--auteur` sans contexte d'agent doit continuer à passer sans marqueur (humain) ; si un test existant échoue à cause du nouveau contexte, le dev l'isole en nettoyant l'environnement (`CLAUDECODE`, `SIEGE_*`) au lieu d'affaiblir l'assertion. Les tests lancés depuis une session Claude Code (où `CLAUDECODE` est posé) ne doivent pas être faussés : la suite fixe explicitement son environnement.

Contrôles manuels de non-régression : `node --check` sur chaque fichier modifié ; `node siege/backlog.js file` et `voir EIA-001` fonctionnent ; `git diff` de `portfolio/commentaires.json` montre uniquement des ajouts.

### F. Couverture et critères de sortie

- Chaque CA1 à CA12 a au moins un cas nominal et un cas d'erreur ; CA8 et CA10 sont couverts par plusieurs voies d'attaque.
- Règles R1 à R9 : toutes référencées par au moins un cas (R1 : A/B, R2-R3 : A/B/D, R4 : A/B, R5 : A/B, R6 : A, R7 : B/D, R8 : A/B, R9 : A/B/E).
- Recette (étape 5) : GO si `npm test` est vert, les cas E2E et le contrôle manuel du sandbox sont passés, et aucun bug Bloquant ou Majeur n'est ouvert. Toute anomalie devient un ticket Bug lié à EIA-001.
- Hors couverture (hors périmètre de la spec) : falsification du registre par un processus hors garde (N2), authentification forte des humains (P1), verrou inter-processus général (C3).

### G. Points ouverts pour le dev et le CEO

1. Forme `--auteur=valeur` : la spec ne dit pas si elle est supportée par les parseurs actuels ; le dev précise le comportement attendu (cas listé en B).
2. `--auteur ""` (valeur vide) : le plan attend un refus pour un agent ; à confirmer avec le dev, car le parseur actuel traite une valeur vide comme absente.
3. Le contrôle du marqueur de contexte sous le vrai bac à sable de Claude Code ne se teste qu'à la main (cas « Sandbox ») ; il reste le risque n°1 de l'ADR.
4. Un humain en terminal garde la liberté de `--auteur` quelconque (R9) : comportement testé mais à confirmer par le CEO.
