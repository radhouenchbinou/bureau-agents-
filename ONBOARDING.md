# Onboarding du bureau IA

Onboarder le bureau IA, c'est installer le Siège sur votre poste, lui déclarer vos projets (une filiale par repo),
brancher le backlog et GitHub, puis lancer un premier circuit que vous validez étape par étape.

## Le parcours en un coup d'œil

Neuf étapes, dont trois facultatives. Seules les étapes 1 à 4 et 8 sont nécessaires pour un premier circuit en local.

| # | Étape | Où | Obligatoire | Résultat |
| --- | --- | --- | --- | --- |
| 1 | Prérequis | Votre poste | Oui | Claude Code, Node 18+, Git, bac à sable |
| 2 | Installer le Siège | Terminal | Oui | Le Siège sur http://127.0.0.1:4848 |
| 3 | Déclarer les filiales | Claude Code `/nouvelle-filiale` | Oui | Une fiche et une ligne du registre par repo |
| 4 | Brancher le backlog | Siège › Intégrations | Oui (fichiers par défaut) | Features et Bugs dans Notion, Jira ou fichiers |
| 5 | Brancher GitHub | Siège › Intégrations | Pour pousser et fusionner | App GitHub, un jeton par rôle et par repo |
| 6 | Droits, skills, autorisations | Siège › Droits | Relecture conseillée | Chaque agent n'a que les droits de son rôle |
| 7 | Telegram | Siège › Intégrations | Non | Collaborateurs et notifications du CEO |
| 8 | Premier circuit | Claude Code `/feature` | Oui | Une feature menée étape par étape |
| 9 | Routine du CEO | Siège + GitHub + Telegram | — | Questions, exceptions, priorités, fusions |

## 1. Prérequis

Un poste macOS ou Linux suffit ; tout tourne en local, sans dépendance npm.

- **Claude Code** installé et connecté (`claude` répond dans un terminal).
- **Node.js 18.17 ou plus** et **Git**.
- **Bac à sable** des agents : rien à installer sur macOS ; sur Linux, `sudo apt install bubblewrap socat`. Sans lui,
  Claude Code refuse de démarrer dans le Siège : c'est voulu.
- **Vos projets** : un repo Git par filiale (par exemple un back et un front = deux filiales).
- **Facultatif** : un espace Notion ou un Jira (Cloud ou Data Center, compte administrateur pour l'initialisation), un
  compte GitHub pour créer une App, un compte Telegram.

## 2. Installer le Siège

Le Siège est un dossier à part, distinct de vos projets ; ceux-ci seront clonés dans son sous-dossier `projets/`.

```bash
git clone https://github.com/radhouenchbinou/bureau-agents- mon-siege && cd mon-siege
node siege/droits.js appliquer      # droits et skills des agents, settings.json généré
(cd siege && npm test)              # facultatif : les tests du Siège doivent tous passer
node siege/server.js                # le Siège sur http://127.0.0.1:4848
```

Dans un second terminal, lancez `claude` dans `mon-siege` et **acceptez la confiance du dossier** au premier
lancement : sans elle, la garde qui contrôle chaque action des agents n'est pas chargée. C'est cette session qui est
votre directeur de programme.

Le Siège n'écoute que sur votre machine. Jetons, clés et données personnelles restent dans `~/.siege` (droits 600),
jamais dans le dépôt.

## 3. Déclarer les filiales

Une filiale = un repo = une équipe d'agents (PO, devs, QA) ; les services partagés (architecte, relecteur, RSSI,
devops, rédacteur) servent toutes les filiales.

1. Clonez chaque repo dans le Siège : `git clone <url> projets/<repo>`.
2. Dans Claude Code : `/nouvelle-filiale <Nom> projets/<repo>`. Le directeur explore le repo en lecture seule (stack,
   commandes de build et de test), vous propose un préfixe de 3 lettres et vous montre la fiche, avec ce qui reste à
   compléter (surtout les règles métier).
3. Après votre « Valider », l'outil crée la fiche `projets/<repo>/CLAUDE.md`, les dossiers `docs/backlog`, `docs/adr`,
   `docs/rapports` et la ligne du registre `portfolio/filiales.md`. Une fiche existante n'est jamais écrasée.
4. Complétez vous-même les `À COMPLÉTER` de la fiche : c'est ce que tous les agents liront avant d'agir. Les agents
   n'ont jamais le droit de modifier une fiche.

Une feature qui touche plusieurs filiales n'a pas besoin d'un repo commun : elle aura un ticket parent et un ticket par
filiale, livrés ensemble (voir étape 8).

## 4. Brancher le backlog

Le backlog a deux tableaux, **Features** et **Bugs**, ordonnés par un rang (1 = le plus urgent). Agents et directeur y
accèdent toujours par le même outil, quelle que soit la source ; tout se règle dans **Siège › Intégrations**.

| Source | Ce qu'il faut | Comment le Siège trouve ses tickets |
| --- | --- | --- |
| Fichiers locaux (par défaut) | Rien | `portfolio/features.json` et `bugs.json` |
| Notion | Une intégration interne (lire, mettre à jour, insérer, commentaires) et une page partagée avec elle | Deux bases créées par le Siège sous cette page |
| Jira Cloud ou Data Center | Un jeton (API Cloud + e-mail, ou jeton personnel DC) d'un compte administrateur Jira, et la clé du projet | Types Story (Features) et Bug (Bugs) portant l'étiquette `bureau-ia`, parmi tous vos tableaux |

Pour Jira : collez le jeton, renseignez l'adresse, le projet et l'étiquette, puis **Initialiser**. Le Siège crée les
champs « Siège ID », « Siège Statut », « Siège Étape »… s'ils manquent (rien n'est supprimé) ; un avertissement liste
ceux qu'un administrateur doit ajouter aux écrans propres au projet. L'identifiant du Siège (RES-001, BUG-001) fait foi,
la clé Jira est un lien.

Terminez par **Importer le backlog local dans la source active** si vous avez déjà des tickets en fichiers.

## 5. Brancher GitHub

Les agents agissent sur GitHub au nom d'une App de l'entreprise, avec un jeton d'une heure limité au repo de leur
mission et aux droits de leur rôle ; ils ne voient jamais ni la clé ni le jeton.

1. Créez l'App sur [github.com/settings/apps/new](https://github.com/settings/apps/new) : permissions *Contents*,
   *Pull requests* et *Commit statuses* en lecture-écriture, *Metadata* en lecture, sans webhook.
2. Installez-la **uniquement** sur les repos de vos filiales ; notez l'*App ID* et l'*Installation ID* (fin de l'URL
   d'installation), téléchargez la clé privée `.pem`.
3. Dans **Siège › Intégrations › GitHub** : App ID, Installation ID, le repo GitHub de chaque filiale, la clé (fichier
   ou copier-coller), puis **Tester la connexion**. Le test dit quels repos déclarés l'App ne voit pas encore.
4. Sur chaque repo, protégez `main` : pull request obligatoire avec **une approbation**, feux requis `agents/revue` et
   `agents/securite`.

Ensuite : les devs poussent `feature/…` ou `fix/…` et ouvrent la PR, le relecteur et le RSSI posent leurs feux, vous
approuvez la PR sur GitHub, et le devops fusionne. Pour une feature sur plusieurs repos, toutes les PR sont fusionnées
ensemble ou aucune.

## 6. Droits, skills et autorisations

Chaque agent n'a que les droits de son rôle, définis dans `droits/roles.json` et vérifiés par une garde avant chaque
action ; le réseau est limité à GitHub et Notion. Ouvrez **Siège › Droits** une fois pour relire la matrice.

- **Skills** : chaque rôle a ses skills (user story, ADR, TDD, revue, audit sécurité, passation…). Ajoutez-y les vôtres
  par type d'agent (conventions de votre stack, règles maison) depuis Siège › Droits.
- **Exceptions** : un agent bloqué pour une action nécessaire demande une exception au directeur, qui vous la transmet ;
  vous accordez ou refusez dans le Siège, et elle se ferme d'elle-même à la fin de la tâche.
- **Autorisations permanentes** (un domaine réseau, une commande, une règle durable pour un rôle) : vous seul les
  ajoutez ou retirez, dans Siège › Droits.
- **Contexte propre** : chaque tâche d'agent part d'un contexte neuf, et chaque étape du directeur se fait dans une
  nouvelle session ; ce qui doit survivre passe par les fichiers et la passation sur le ticket.

## 7. Telegram (facultatif)

Vos collaborateurs écrivent au directeur sur Telegram pour signaler un bug ou demander une évolution ; ils n'ont
jamais accès au Siège. Le directeur vous prévient aussi sur Telegram quand une décision vous revient.

1. Créez un bot avec [@BotFather](https://t.me/BotFather) (`/newbot`), collez son jeton dans **Siège › Intégrations ›
   Telegram**, **Tester**, puis **Activer**.
2. Envoyez `/start` au bot depuis votre compte, puis cliquez **C'est moi, le CEO** dans le Siège.
3. Chaque collaborateur envoie `/start` au bot ; vous l'**autorisez** dans le Siège. Un inconnu n'obtient jamais de
   réponse du directeur.
4. Fixez le **plafond de sessions automatiques par jour** (50 par défaut) : chaque message lance une courte session du
   directeur.

Le directeur pose ses questions, fait valider un résumé au demandeur, vous transmet ce qui le mérite (évolution,
plusieurs filiales, sécurité, argent, doute), puis crée le ticket sans rang : c'est vous qui priorisez. Suivi dans
l'onglet **Demandes**. Le Siège doit tourner sur une machine allumée, avec Claude Code installé.

## 8. Lancer le premier circuit

Dans Claude Code, tapez `/feature` (le premier ticket de la file) ou `/feature RES-002` ; le bouton **Lancer** d'un
ticket dans le Siège fait la même chose. Chaque étape se termine par votre décision : **Valider**, **Corriger** (avec
votre remarque) ou **Arrêter**.

1. **Cadrage** : filiale(s), circuit complet ou court ; plusieurs filiales → un ticket parent et un ticket par filiale.
2. **Spécification** (PO) → **Conception** (architecte, contrat d'interface si plusieurs filiales) → **Plan de tests**
   (QA).
3. **Développement** (devs) → **Recette** (QA, un ticket Bug par anomalie).
4. **Revue de code** → **Sécurité** (GO / NO-GO) → **Livraison** (devops, après votre approbation sur GitHub) →
   **Documentation**.

Après chaque « Valider », le directeur inscrit l'étape suivante sur le ticket et s'arrête : faites `/clear` puis
`/feature <ID>` (ou **Lancer**) pour continuer dans une session neuve, ce qui économise les jetons. Un bug se corrige
avec `/corriger BUG-001`. Une question d'agent ou une exception met le ticket en attente de votre réponse.

## 9. La routine du CEO

Votre rôle se limite à décider ; le reste est délégué.

| Quand | Où | Quoi |
| --- | --- | --- |
| Chaque matin | Claude Code `/standup` | Avancement de toutes les filiales |
| Dès qu'un compteur bouge | Siège (en-tête) ou Telegram | Questions des agents, exceptions à décider, demandes transmises |
| À chaque étape | Claude Code | Valider, Corriger ou Arrêter, puis relancer |
| Quand le backlog change | Siège › Backlog, Notion ou Jira | Rangs (priorités), nouveaux tickets |
| À la livraison | GitHub | Approuver la PR (ou les PR d'une feature groupée) |
| De temps en temps | Siège › Droits | Autorisations permanentes, skills maison |

## S'entraîner sans risque : l'exemple CycloFix

Avant vos vrais projets, essayez sur CycloFix, une entreprise inventée de réparation de vélos à domicile : 3 filiales
avec un repo chacune (API, application atelier, site vitrine) et 14 features en 4 jalons, dont une livrée d'un bloc sur
deux repos.

```bash
cp exemples/cyclofix/portfolio/filiales.md exemples/cyclofix/portfolio/roadmap.md exemples/cyclofix/portfolio/features.json portfolio/
mkdir -p projets
for r in cyclofix-api cyclofix-atelier cyclofix-vitrine; do
  cp -r exemples/cyclofix/projets/$r projets/$r
  git -C projets/$r init -q -b main && git -C projets/$r add -A && git -C projets/$r commit -qm "Fondations"
done
node siege/backlog.js file        # GRP-001 doit être le premier ticket
```

Puis `/feature` dans Claude Code. Détails dans `exemples/cyclofix/LISEZMOI.md`.
