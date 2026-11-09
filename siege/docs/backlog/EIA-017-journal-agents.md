# EIA-017 · Journal de logs par agent IA, consultable dans sa fiche détaillée

Étape 1 · Spécification. Auteur : product-owner. Réf. conception : `conception-validee.md` (axe 3 Exécution des agents ; recoupe N1 exécutions, N6 mesure de coût, N12 pilotage, sans en dépendre).

## User story
En tant que directeur de programme (CEO et CTO du Siège), je veux un journal de logs par agent IA, affiché dans la page de détail de cet agent dans l'interface du Siège (`siege/public`), afin de comprendre ce qu'il a fait, quand, avec quel résultat et pourquoi il s'est arrêté, sans relire l'historique d'un ticket.

« Fiche détaillée » = page de détail d'un agent dans l'interface (réponse du CEO), pas le `CLAUDE.md` de la filiale.

## Règles métier
- R1. Un lancement d'agent = une entrée de journal, rattachée au rôle (ex. `dev-backend`). Deux lancements du même rôle en parallèle donnent deux entrées distinctes (identifiant d'entrée unique).
- R2. Champs d'une entrée : identifiant, rôle, filiale, ticket, étape, moteur, modèle, début, fin, durée (s), état (`en cours`, `terminé`, `échec`, `interrompu`), code de sortie, extrait de sortie borné, événements de garde.
- R3. Une entrée est créée au lancement (état `en cours`) puis complétée à la fin, afin qu'un agent planté ou tué reste visible comme `interrompu` (jamais absent).
- R4. Événements de garde (action refusée, `DEMANDE D'EXCEPTION`, exception activée ou refusée, numéro EXC) : ajoutés à l'entrée du lancement concerné avec type, motif exact et horodatage. Le motif est une commande, un chemin ou un domaine, jamais un contenu de fichier.
- R5. Le journal ne contient ni jeton, ni secret, ni contenu de fichier copié. Les valeurs ressemblant à un secret (jetons GitHub `ghp_`/`ghs_`/`github_pat_`, clés `sk-`, en-têtes `Authorization`, valeurs de variables nommées `*TOKEN*`, `*KEY*`, `*SECRET*`, `*PASSWORD*`, clés privées PEM) sont remplacées par `[MASQUÉ]` avant écriture ; le masquage se fait côté écriture, pas à l'affichage.
- R6. L'extrait de sortie est borné : 2 000 caractères au plus par entrée (fin de la sortie conservée), marqué `[tronqué]` si coupé.
- R7. Seul le Siège écrit le journal. Les agents n'ont aucun droit d'écriture ni de suppression sur ces fichiers (zone protégée de la garde, au même titre que `~/.siege`) ; ils peuvent au plus le lire si leur rôle le permet déjà.
- R8. Une défaillance d'écriture du journal ne bloque ni l'agent ni sa passation : elle est signalée au CEO (notification Siège) et le lancement continue.
- R9. Portée : tous les lancements d'agents que le Siège déclenche (sessions Claude du Siège, demandes, moteurs externes Codex et Copilot via `siege/agent.js`). Le journal existant `~/.siege/agents-externes.log` est conservé tel quel ; ses lancements sont aussi inscrits dans le journal par agent.
- R10. Affichage dans la page de détail de l'agent : liste du plus récent au plus ancien, 20 entrées par page avec « charger plus » ; chaque entrée montre date, ticket (lien vers le ticket dans le Siège), étape, moteur/modèle, durée, état, code de sortie ; le détail (extrait de sortie, événements de garde) se déplie. Thèmes clair et sombre, navigable au clavier.
- R11. Le contenu journalisé est affiché en texte brut échappé (jamais interprété comme HTML).
- R12. Stockage (tranché, sous réserve de l'ADR) : le journal ne dépend pas d'EIA-007. EIA-017 se livre seul, sur un stockage simple append-only inter-processus sûr (un fichier JSON Lines par rôle sous `~/.siege/`, écriture avec verrou, cohérent avec `demandes.js` et `exceptions.js`). L'architecte confirme le format à l'étape 2 et prévoit une migration vers la table Exécution de N1 sans perte.
- R13. Visibilité (tranché pour cette version) : Siège uniquement, dans la page de détail de l'agent. Chaque entrée porte l'ID de ticket ; pas d'affichage dans le ticket ni de copie vers Notion, Jira ou GitHub (voir questions).
- R14. Rétention par défaut (tranché provisoirement, à confirmer par le CEO) : 90 jours et 500 entrées par agent, l'entrée la plus ancienne étant supprimée en premier ; valeurs réglables en configuration. La purge n'efface jamais une entrée `en cours`.

## Critères d'acceptation
- CA1. Given l'agent `dev-backend` lancé sur EIA-017, étape « 4 · Développement », moteur `claude`, modèle `m1`, When l'exécution se termine avec le code 0 après 125 s, Then le journal de `dev-backend` contient une entrée avec rôle, filiale, ticket EIA-017, étape, moteur, modèle, début, fin, durée 125, état `terminé`, code de sortie 0.
- CA2. Given un lancement en cours, When on lit le journal, Then l'entrée existe avec l'état `en cours` et sans fin ni code de sortie.
- CA3. Given un agent tué ou un Siège redémarré pendant une exécution, When le Siège redémarre, Then l'entrée restée `en cours` passe à `interrompu` et n'est pas relancée.
- CA4. Given un agent échoué (code de sortie 1), When l'exécution se termine, Then l'état est `échec` et les 2 000 derniers caractères de sa sortie sont dans l'extrait.
- CA5. Given une sortie de 5 000 caractères, When l'entrée est écrite, Then l'extrait fait au plus 2 000 caractères et se termine par la marque `[tronqué]`.
- CA6. Given l'agent `qa` refusé par la garde sur la commande `npm install left-pad`, When il remonte une demande d'exception EXC-007, Then l'entrée contient un événement de garde de type refus (motif `npm install left-pad`) et la référence EXC-007.
- CA7. Given une exception EXC-007 activée puis fermée à la fin de la tâche, When on lit l'entrée, Then les événements « activée » et « fermée » apparaissent avec leur horodatage.
- CA8. Given une sortie contenant `ghp_ABCDEF0123456789ABCDEF0123456789ABCD` et `Authorization: Bearer abc123`, When l'entrée est écrite, Then le fichier de journal ne contient aucune de ces deux valeurs et contient `[MASQUÉ]` à leur place.
- CA9. Given un secret présent dans le motif d'un événement de garde (ex. `curl -H "Authorization: Bearer abc123" …`), When l'événement est inscrit, Then la valeur est masquée de la même façon.
- CA10. Given la page de détail d'un agent ayant 3 lancements (10:00, 11:00, 12:00), When on l'ouvre, Then l'ordre est 12:00, 11:00, 10:00.
- CA11. Given un agent ayant 45 entrées, When on ouvre sa page, Then 20 entrées s'affichent et « charger plus » en ajoute 20 puis 5.
- CA12. Given un agent jamais lancé, When on ouvre sa page, Then le message « Aucun journal pour cet agent » s'affiche, sans erreur.
- CA13. Given une entrée dont la sortie contient `<script>alert(1)</script>`, When elle est affichée, Then le texte est montré littéralement et aucun script ne s'exécute.
- CA14. Given deux lancements simultanés de `dev-backend` sur EIA-017 et EIA-018, When ils se terminent, Then le journal contient 2 entrées distinctes, aucune écrasée (20 écritures en parallèle par processus distincts : 20 entrées, aucune perdue).
- CA15. Given une écriture de journal impossible (disque en lecture seule simulé), When l'agent se termine, Then sa passation sur le ticket est posée normalement et une notification d'erreur arrive au CEO.
- CA16. Given un agent de rôle `dev-backend`, When il tente d'écrire ou de supprimer un fichier du journal, Then la garde refuse l'action.
- CA17. Given un lancement par un moteur externe (`siege/agent.js lancer --moteur codex`), When il se termine, Then une entrée du même format existe, moteur `codex`, et `agents-externes.log` reçoit toujours sa ligne.
- CA18. Given un agent ayant 600 entrées ou des entrées de plus de 90 jours, When la purge s'exécute, Then il reste au plus 500 entrées, toutes de moins de 90 jours, et une entrée `en cours` n'est jamais supprimée.
- CA19. Given une entrée sans ticket (lancement hors ticket, ex. standup), When elle est affichée, Then le ticket apparaît comme « — » sans lien cassé.

## Hors périmètre
- Coûts, jetons et budgets (EIA-014 / N6) ; reprise, file persistante et anti-doublon des exécutions (EIA-007 / N1).
- Synchronisation vers Jira, Notion, GitHub Issues (EIA-016) ; envoi vers un service externe de supervision.
- Journal de l'activité humaine (audit nominatif, N8) et journal du CEO.
- Transcript complet de la conversation d'un agent, contenu des fichiers lus ou écrits.
- Recherche plein texte, filtres avancés, export, notifications sur échec.
- Modification des droits des rôles au-delà de la protection d'écriture du journal (R7).

## Impacts autres filiales
Non. Fonction interne du Siège ; aucun contrat dans `portfolio/interfaces.md`. Classe critique pour le RSSI si le masquage touche `garde` (zone protégée, règle R7).

## Contrôle INVEST
Indépendante (aucune dépendance, R12) · Négociable (rétention, pagination) · Valeur (diagnostic d'échec rapide) · Estimable · Small : estimée M, à surveiller ; si l'architecte juge le branchement sur tous les moteurs trop large, découper en EIA-017a (journal + sessions Siège) et EIA-017b (moteurs externes, CA17) · Testable (CA1 à CA19).

## Questions ouvertes (CEO)
1. Rétention : valeur par défaut proposée de 90 jours et 500 entrées par agent (R14). Valider ou fixer d'autres seuils ?
2. Visibilité : Siège uniquement (R13). Souhaitez-vous aussi voir l'entrée de l'agent depuis le ticket (lien « journal » sur le ticket) ?

Tranché sans le CEO : pas de dépendance à EIA-007 (R12) ; extrait borné à 2 000 caractères (R6) ; ce ticket n'est pas un doublon.

## Plan de tests

Étape 3 · Auteur : qa. Base : spec (CA1-CA19) et ADR `docs/adr/EIA-017-journal-agents.md`. Suite cible : `siege/test/journal-agents.test.js` (nouveau), lancée par `cd projets/entreprise-ia/siege && npm test`. Aucune donnée réelle : les secrets de test sont des chaînes fabriquées (ex. `ghp_` + 36 caractères fictifs). Tous les tests utilisent un `SIEGE_PRIVE` temporaire (jamais le vrai `~/.siege`). Types : U = unitaire, I = intégration (processus réels, fichiers), M = manuel (interface).

### 1. Cas nominaux (un par critère d'acceptation)

| CA | Cas | Type | Données | Résultat attendu |
|---|---|---|---|---|
| CA1 | Entrée complète d'une exécution réussie | U | `ouvrir` (dev-backend, Entreprise IA, EIA-017, « 4 · Développement », claude, m1, début 10:00:00) puis `clore` à 10:02:05, code 0 | `lire` renvoie 1 entrée : tous les champs R2, durée 125, état `terminé`, code 0 |
| CA2 | Entrée `en cours` | U | `ouvrir` sans `clore` | État `en cours`, `fin` et `code` absents |
| CA3 | Réconciliation d'un hôte mort | I | Ouverture avec `hote.pid` d'un processus enfant tué (SIGKILL) ; appel de `reconcilier` ; variante : ouverture datée de 3 h avec pid vivant | État `interrompu`, `code: null` ; rien relancé (aucun `spawn`) ; la variante > 2 h passe aussi `interrompu` |
| CA4 | Échec avec sortie | U | `clore` code 1, sortie de 300 caractères | État `échec`, extrait = la sortie |
| CA4 | Échec, sortie longue | U | Code 1, sortie de 5 000 caractères | Extrait = fin de la sortie (derniers caractères conservés), état `échec` |
| CA5 | Bornage à 2 000 | U | Sortie de 5 000 caractères | `extrait.length <= 2000`, finit par `[tronqué]`, `tronque: true` |
| CA6 | Refus de garde sur `npm install left-pad` | I | Hook de garde simulé pour le rôle `qa`, puis `demander` EXC-007 | Événement `refus` (motif `npm install left-pad`) puis `exception_demandee` avec `exception: EXC-007` sur la même entrée |
| CA7 | Cycle d'exception | I | EXC-007 : demander, accorder, activer, utiliser, terminer | Événements `exception_accordee`, `exception_activee`, `exception_terminee` datés, tous sur l'entrée mémorisée (`journal: <id>` dans l'exception) |
| CA8 | Masquage à l'écriture de la sortie | U | Sortie contenant `ghp_ABCDEF0123456789ABCDEF0123456789ABCD` et `Authorization: Bearer abc123` | Le contenu brut du fichier `.jsonl` (lu par `fs.readFileSync`) ne contient aucune des deux valeurs ; il contient `[MASQUÉ]` |
| CA9 | Masquage du motif de garde | U | Motif `curl -H "Authorization: Bearer abc123" https://x` | Valeur `abc123` absente du fichier ; `Authorization: [MASQUÉ]` présent |
| CA10 | Tri décroissant | I | 3 entrées 10:00, 11:00, 12:00 écrites dans un ordre mélangé ; route `GET /api/agents/<role>/journal` | Ordre 12:00, 11:00, 10:00 |
| CA11 | Pagination 20 / 20 / 5 | I + M | 45 entrées ; API `nombre=20` avec `depuis=0, 20, 40` ; interface : clic sur « charger plus » | Pages de 20, 20, 5 ; `suite` faux à la dernière ; le bouton disparaît après 45 |
| CA12 | Agent sans journal | I + M | Rôle valide sans fichier | API `{entrees: [], total: 0}` ; interface « Aucun journal pour cet agent », sans erreur console |
| CA13 | Pas d'exécution de HTML | M | Entrée dont l'extrait est `<script>alert(1)</script>` ; ouvrir le détail dans les thèmes clair et sombre | Texte affiché littéralement, aucune alerte ; contrôle de code : injection par `textContent` uniquement (aucun `innerHTML` dans la section) |
| CA14 | 20 écritures parallèles | I | 20 processus enfants réels (`child_process`), même rôle, `ouvrir` + `clore` chacun | 20 entrées distinctes (20 `id` uniques), aucune ligne illisible, aucune perdue |
| CA15 | Écriture impossible | I | `SIEGE_PRIVE` en lecture seule (chmod 500) ; appel de `ouvrir`/`clore` ; passation simulée par le lanceur | Aucune exception levée, code de sortie du lanceur inchangé, témoin `siege-journal-erreur-<uid>.json` déposé, notification CEO (`sujetsCeo`, clé `journal-erreur:<jour>`) |
| CA16 | Écriture protégée | I | Garde appelée pour `dev-backend` avec : outil Write sur `~/.siege/journaux/agents/dev-backend.jsonl`, Edit du même fichier, Bash `rm ~/.siege/journaux/agents/dev-backend.jsonl`, Bash `echo x >> ~/.siege/journaux/agents/dev-backend.jsonl` ; génération de `.claude/settings.json` | Les quatre actions refusées ; `sandbox.filesystem.denyWrite` contient `~/.siege` |
| CA17 | Moteur externe Codex | I | `agent.js lancer --moteur codex` avec un exécutable factice qui sort avec le code 0 puis 1 | Entrée de moteur `codex`, bon état et bon code ; `agents-externes.log` reçoit toujours sa ligne, format inchangé |
| CA18 | Rétention | U | 600 entrées closes, dont 50 de plus de 90 jours, plus 1 entrée `en cours` vieille de 100 jours | Après `purger` : au plus 500 entrées, toutes < 90 jours, l'entrée `en cours` est conservée |
| CA19 | Entrée sans ticket | U + M | `ticket: ""` (standup) | Interface : « — », aucun `<a>` ni lien cassé |

### 2. Cas limites

| Réf. | Cas | Type | Données | Résultat attendu |
|---|---|---|---|---|
| L1 | Borne exacte du bornage | U | Sorties de 1 999, 2 000, 2 001 caractères | 1 999 et 2 000 : intactes, `tronque: false` ; 2 001 : tronquée, longueur finale <= 2 000 |
| L2 | Sortie vide ou nulle | U | `""`, `null`, `undefined` | Extrait vide, aucune exception |
| L3 | Un seul élément | U | Une entrée | Liste de 1, `suite` faux |
| L4 | Pagination exacte | I | 20 entrées, puis 21 | 20 : pas de « charger plus » ; 21 : une page de 20 puis 1 |
| L5 | `depuis` hors plage ou invalide | I | `depuis=9999`, `-1`, `abc`, `nombre=0`, `nombre=100000` | Liste vide ou valeurs ramenées à des bornes ; jamais d'erreur 500 |
| L6 | Secret à cheval sur la coupure de 2 000 | U | Jeton `ghp_…` placé aux caractères 1 990-2 030 d'une sortie de 5 000 | Jeton masqué entièrement ; aucun fragment (`ghp_ABC…`) dans le fichier (ordre masquage puis bornage) |
| L7 | Secret dans la zone des 16 000 derniers caractères | U | Sortie de 30 000 caractères, secret à 15 000 caractères de la fin | Masqué |
| L8 | Chaque famille de secret de l'ADR | U | `github_pat_`, `ghs_`, `sk-ant-…`, `xoxb-…`, jeton de bot Telegram `123456789:` + 35 caractères, `secret_`/`ntn_` Notion, bloc PEM complet, bloc PEM sans `END`, `Proxy-Authorization: Basic …`, `API_KEY=…`, `"password": "…"`, `--token xyz`, valeur d'une variable d'environnement `*TOKEN*` du processus (>= 8 caractères) sans affectation | Chaque valeur remplacée par `[MASQUÉ]` ; le nom de variable est gardé |
| L9 | Faux positifs | U | Texte `key` seul, `monkey`, `skeleton`, `sk-court`, valeur de 7 caractères | Non altéré (pas de sur-masquage abusif ; les cas `monkey` et `skeleton` sont consignés si masqués) |
| L10 | Masquage de tous les champs texte | U | Secret dans `etape`, `modele`, `filiale`, `motif`, `raison` | Masqué dans chaque champ |
| L11 | Accents et arabe | U + M | Filiale `Société générale`, extrait `خطأ في الاتصال`, émoji, `·` dans l'étape | Relu à l'identique (UTF-8), affiché correctement, coupure à 2 000 sans demi-caractère corrompu |
| L12 | Caractères de contrôle | U | Sortie avec `\u0000`, `\u001b[31m`, `\r`, `\n`, `\t` | Contrôle retiré hors `\n` et `\t` ; ligne JSON reste valide |
| L13 | Rôle invalide (traversée de chemin) | U | `../../etc/x`, `Dev`, `a`, `""`, `dev backend`, 60 caractères | Rien n'est écrit, aucun fichier créé hors `journaux/agents/` |
| L14 | Ticket invalide | U | `eia-17`, `EIA-17`, `X` | Refus ou normalisation en `""` ; jamais de lien dans l'interface |
| L15 | Doublon d'`id` | U | Deux `ouverture` de même `id` | Une seule entrée, la première gagne |
| L16 | Deux lancements même rôle, même ticket | I | Deux ouvertures dev-backend/EIA-017 | Deux entrées, `id` distincts |
| L17 | Ordre inattendu des lignes | U | `cloture` avant `ouverture` ; `evenement` sur `id` inconnu ; `evenement` après `cloture` | Le premier cas et le deuxième : ignorés, pas d'erreur ; le troisième : évènement ajouté, état inchangé |
| L18 | Plusieurs clôtures | U | `interrompu` (réconciliation) puis `terminé` réel ; deux `terminé` | La clôture réelle l'emporte ; sinon la première gagne |
| L19 | Coupure au milieu d'une écriture | U | Fichier dont la dernière ligne est tronquée ; ligne vide ; ligne JSON invalide au milieu | Lignes illisibles ignorées, le reste est lu, aucune exception |
| L20 | Version inconnue | U | Ligne `v: 2` | Ignorée, compteur « lignes ignorées » = 1 exposé par l'API et l'interface |
| L21 | Fichier absent, vide, ou dossier absent | U | Premier lancement : le dossier `journaux/agents` n'existe pas | Créé en 700, fichier en 600 ; lecture renvoie vide |
| L22 | Fuseau horaire | U + M | Horodatages UTC `2026-03-29T00:30:00Z` (passage à l'heure d'été), machine en `Europe/Paris` et `America/New_York` | Stockage toujours en UTC ISO ; durée en secondes identique ; tri correct ; affichage en heure locale |
| L23 | Durée | U | Fin avant début (horloge) ; durée 0 ; durée de 7 jours | Durée jamais négative (0) ; entiers |
| L24 | Entrée en cours non purgée | U | 600 entrées `en cours` | Aucune supprimée (dépassement de `max` toléré) |
| L25 | Réglages de rétention hors bornes | U | `jours: 0`, `5000`, `max: 5`, `20000`, valeur non numérique | Ramenés aux bornes (1-3650, 10-10 000) ou valeur par défaut |
| L26 | Purge concurrente avec écriture | I | Une purge en boucle et 10 processus qui ajoutent des lignes | Aucune ligne perdue, pas de fichier `.tmp` résiduel, pas de verrou résiduel |
| L27 | Verrou périmé | I | Fichier `.lock` vieux de 11 s, puis verrou frais tenu 1 s | Premier : retiré et l'écriture passe ; second : abandon après environ 500 ms (jamais 2 s), écriture signalée (R8) |
| L28 | Taille d'une ligne | U | `motif` de 10 000 caractères, `raison` de 10 000 | Champs coupés à 300, ligne < 8 Ko |
| L29 | Réconciliation sans effet de bord | I | Entrée déjà close ; entrée `en cours` avec pid vivant récent | Inchangées |
| L30 | Interface : clavier et thèmes | M | Navigation Tab/Entrée/Espace sur « charger plus » et les `<details>` ; thèmes clair et sombre ; mobile étroit | Tout atteignable au clavier, focus visible, contrastes lisibles, pas de débordement horizontal |
| L31 | Interface : rôle inconnu | I | `GET /api/agents/inconnu/journal`, `GET /api/agents/..%2F..%2Fx/journal` | 404 ou liste vide, jamais de lecture hors dossier |
| L32 | Bandeau d'erreur | M | Témoin d'erreur présent | Bandeau visible dans la page de l'agent, une seule notification par jour |

### 3. Cas d'erreur

| Réf. | Cas | Type | Données | Résultat attendu |
|---|---|---|---|---|
| E1 | Écriture impossible, trois points de branchement | I | `SIEGE_PRIVE` en lecture seule ; garde (sous-agent), `agent.js` (Codex et Copilot), `lancerClaude` | Le lanceur renvoie le même code que sans journal, la passation est posée, aucune exception, aucun blocage |
| E2 | Disque plein simulé / `appendFileSync` qui lève | U | Substitution de `fs.appendFileSync` par une fonction qui lève `ENOSPC` | Aucune exception propagée ; témoin déposé |
| E3 | Témoin lui-même impossible | U | `os.tmpdir()` non inscriptible | Message sur stderr, aucune exception |
| E4 | Verrou non obtenu | I | Verrou frais tenu en permanence | Abandon après environ 500 ms, signalé, pas d'attente > 1 s |
| E5 | Fichier de journal corrompu | U | Contenu binaire aléatoire ; fichier de droits 000 | Lecture : vide ou lignes valides, pas d'exception ; route renvoie 200 avec une liste dégradée, pas 500 |
| E6 | Réglage `journalAgents.actif: false` | U | Retour arrière | Aucune écriture, aucune erreur, lecture de l'existant intacte |
| E7 | Secret dans la sortie d'un échec | I | `agent.js` avec exécutable factice qui affiche un jeton fictif et sort en code 2 | `agents-externes.log` inchangé dans son format ; le journal par agent ne contient pas le jeton ; état `échec` code 2 |
| E8 | Secret dans la passation ou l'extrait de sortie du sous-agent | I | Dernier message d'un historique de sous-agent factice contenant `sk-` + 30 caractères | Masqué dans `extrait` |
| E9 | Secret dans le motif de refus mais pas dans le journal global | I | Refus d'une commande contenant un jeton fictif | Journal par agent : masqué. Journal global `journal-garde.jsonl` : constat consigné (ADR, option C hors périmètre), pas un échec du test |
| E10 | Garde refusant une action : le refus est journalisé et l'agent n'est pas aidé | I | Action interdite d'un rôle (écriture hors zone) | La décision de garde (refus, code de sortie 2, message sur stderr) est identique avec et sans journal ; la décision est calculée avant l'écriture de journal ; événement `refus` avec motif exact (commande, chemin ou domaine) et sans contenu de fichier |
| E11 | Journal inaccessible pendant un refus de garde | I | `SIEGE_PRIVE` en lecture seule, action interdite | Refus rendu malgré tout, message de refus intact sur stderr, pas d'avertissement parasite |
| E12 | Rattachement ambigu | I | Deux sous-agents `qa` ouverts dans la même session, événement de garde sans `agent_id` | Événement sur l'entrée la plus récente avec `incertain: true`, affiché comme tel |
| E13 | Rattachement par empreinte | I | Deux sous-agents `qa` en parallèle, `agent_id` et historiques factices | Chaque événement va sur la bonne entrée, `incertain` absent |
| E14 | Champs de hook absents (`agent_id`, `agent_transcript_path`) | I | Entrée de hook sans ces champs | Repli par chemin reconstruit ou rattachement (session, rôle) avec `incertain`, sans exception |
| E15 | Moteur externe : spawn impossible | I | Exécutable inexistant | État `échec`, `code` null ou erreur, entrée close, pas d'entrée `en cours` orpheline |
| E16 | Délai dépassé | I | Exécutable factice qui dépasse `DUREE_MAX_MS` (valeur réduite par réglage de test) | État `interrompu`, clôture écrite |
| E17 | Exception refusée par le CEO | I | EXC refusée | Événement `exception_refusee` sur l'entrée ; aucune activation |
| E18 | Exception sans entrée de journal | I | `demander` pour un ticket sans lancement journalisé | L'exception est créée normalement ; pas d'erreur ; champ `journal` absent |
| E19 | Session interactive du directeur | M | Session `/feature` en terminal | Non journalisée (choix assumé de l'ADR, à reconfirmer par le CEO) ; vérifier l'absence d'entrée parasite |
| E20 | Sous-agent Claude jamais `échec` | I | Sous-agent qui s'arrête normalement | État `terminé` code 0 (attendu de l'ADR) |

### 4. Non-régression

Avant et après chaque modification, la suite complète doit rester verte (`npm test`) ; comparer le nombre de tests et le résultat avec la base de départ relevée avant le développement.

| Réf. | Périmètre | Type | Contrôle |
|---|---|---|---|
| NR1 | Garde (`garde.js`, `lib/garde.js`) | I | Suites existantes de la garde inchangées et vertes ; décision, code de sortie et message de refus identiques sur un jeu d'actions autorisées et interdites, journal activé, désactivé et en panne ; durée de la garde sans dégradation sensible (mesure indicative avant/après, verrou plafonné à 500 ms) |
| NR2 | Journal global de la garde `journal-garde.jsonl` | I | Toujours alimenté, format et lecteur de `server.js` inchangés |
| NR3 | Exceptions (`lib/exceptions.js`, `exception.js`) | I | Cycle demander, décider, activer, terminer, `terminerPourAgent` : mêmes statuts et mêmes fichiers qu'avant ; l'ancien code lit un registre portant le champ facultatif `journal` ; verrou et écriture atomique intacts ; CEO seul peut accorder (aucun agent) |
| NR4 | Droits (`droits.js`, `droits/roles.json`) | U + I | `.claude/settings.json` régénéré : seule différence attendue = `~/.siege` dans `denyWrite` ; aucune règle de rôle élargie ; tests existants des droits verts |
| NR5 | `siege/agent.js` | I | Moteurs externes : sortie, code, durée, fichier temporaire de passation inchangés ; `agents-externes.log` inchangé pour Codex (même contenu qu'avant, malgré le passage en `pipe`) et Copilot |
| NR6 | `lancerClaude` (demandes) | I | Délai de 10 min, `directeur-demandes.log` et comportement de la veille toutes les 60 s inchangés |
| NR7 | `server.js` | I | Routes existantes inchangées ; démarrage plus réconciliation et purge sans retard notable ; `sujetsCeo` toujours une notification par sujet |
| NR8 | Backlog et paramètres | I | `lib/parametres.js` : anciens fichiers de réglages sans `journalAgents` chargés avec les valeurs par défaut (90 / 500) ; backlog JSON, Notion, Jira non touchés |
| NR9 | Interface | M | Autres pages (tickets, exceptions, agents) rendues comme avant, clair et sombre ; pas d'erreur console |
| NR10 | Sécurité (frontière) | I | Un agent ne lit pas `~/.siege/**` (denyRead et `lecture_interdite`) ; un agent ne peut ni usurper un rôle pour écrire dans le journal d'un autre, ni forger `SIEGE_EXECUTION` pour atteindre le fichier d'un autre rôle (rôle validé par la regex) |

### 5. Points de vigilance pour le développement

- Concurrence entre processus : CA14, L26, L27 exigent de vrais processus enfants, pas des promesses dans un même processus.
- Les tests de CA15, E1, E11 nécessitent un utilisateur non root (chmod ne protège pas root) ; à défaut, simuler par substitution de `fs`.
- L9 est exploratoire : un sur-masquage tolérable est consigné, pas bloquant.
- Anomalies : chacune devient un ticket Bug rattaché à EIA-017.
