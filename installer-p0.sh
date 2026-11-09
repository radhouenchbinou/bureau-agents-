#!/bin/bash
# Intègre l'Entreprise IA comme filiale d'elle-même et crée les tickets P0 de la conception validée.
set -e
cd "$(dirname "$0")"
FICHE=$(cat <<'MD'
# Fiche filiale — Entreprise IA

> Fiche lue par tous les agents avant d'agir sur cette filiale. Validée par le CEO le 2026-11-09.

## Identité
- Nom : Entreprise IA
- Préfixe d'ID : `EIA`
- Dossier : `projets/entreprise-ia/siege` (repo `projets/entreprise-ia`, copie de travail de bureau-agents-)
- Mission en une phrase : rendre l'entreprise d'agents utilisable par n'importe quelle entreprise, avec un workflow générique configurable, des contrôles techniques et une livraison jusqu'en production.

## Référence obligatoire
- Conception validée : `projets/entreprise-ia/siege/docs/backlog/conception-validee.md` (sections « Workflow générique », « Feuille de route », « Pilote proposé »). Chaque ticket EIA renvoie à un identifiant de cette feuille de route (C1…C7, N1…N18).
- Générique avant tout : rien de propre à une entreprise cliente dans le code ; tout ce qui varie est de la configuration (rôles humains, règles de risque, portes, profils de stack, types d'agents, environnements, outil de backlog, budgets).

## Domaine métier
- Concepts clés : ticket, transition, exécution, approbation, preuve, déploiement, service, personne, classe de risque, profil de stack.
- Règles métier critiques : une approbation vaut pour une version précise (SHA ou empreinte) ; un agent ne décide jamais d'une transition ni ne parle au nom d'un humain ; une classe de risque peut être relevée, jamais baissée par un agent.

## Stack technique
- Node.js 22+, bibliothèque standard uniquement (aucune dépendance npm sans accord du CEO) ; `node:sqlite` envisagé pour l'état (décision D1).
- Interface : `siege/public` (HTML/JS sans framework).
- Intégrations : GitHub (App), Jira, Notion, Telegram, Slack, Teams.

## Commandes
- Tests : `cd projets/entreprise-ia/siege && npm test`
- Vérification de syntaxe : `node --check <fichier>`
- Lancer en local : `node siege/server.js` (port 4848)

## Règles spécifiques par rôle
- product-owner : une spec par ticket, critères d'acceptation repris de la feuille de route et rendus testables.
- dev-backend : test d'abord, changement minimal, compatibilité avec les données existantes (backlog JSON, Notion, Jira).
- dev-frontend : mêmes conventions que `siege/public/app.js`, thème clair et sombre.
- qa : tester les frontières de sécurité (usurpation, transitions, approbations périmées) et la concurrence entre processus.
- rssi-devsecops : toute modification de `garde`, `github`, `exceptions`, `droits` est de classe critique.

## Contraintes
- Données / confidentialité : aucun secret ni donnée réelle dans le dépôt ou les tests.
- Budget / coûts : à mesurer (N6), pas encore fixé.
MD
)
node siege/filiale.js ajouter --nom "Entreprise IA" --prefixe EIA --dossier projets/entreprise-ia/siege --repo projets/entreprise-ia --fiche "$FICHE"
mkdir -p projets/entreprise-ia/siege/docs/backlog
[ -f projets/entreprise-ia/docs/backlog/conception-validee.md ] && mv projets/entreprise-ia/docs/backlog/conception-validee.md projets/entreprise-ia/siege/docs/backlog/ && rm -rf projets/entreprise-ia/docs || true
D="Voir projets/entreprise-ia/siege/docs/backlog/conception-validee.md, feuille de route"
c() { node siege/backlog.js creer feature --id "$1" --filiale "Entreprise IA" --rang "$2" --jalon P0 --priorite Haute --titre "$3" --description "$D, $4" ${5:+--dependances "$5"}; }
c EIA-001 1  "C2 · Identité imposée : options en double refusées, auteur et rôle fixés par la garde" "C2."
c EIA-002 2  "C1 · Fusion : approbateurs autorisés, approbation sur le dernier commit, check runs requis" "C1."
c EIA-003 3  "C6 · Feu de revue posé sur le commit relu" "C6."
c EIA-004 4  "C3 · Backlog local : verrou inter-processus et identifiants réservés" "C3."
c EIA-005 5  "C4 · Transitions contrôlées du workflow générique (acteur, conditions, preuves, version)" "C4 et section Workflow générique." EIA-001
c EIA-006 6  "N18 · Profils de stack et types d'agents configurables (Java, Node, Python préconfigurés)" "N18."
c EIA-007 7  "N1 · Exécutions persistantes (file, délai, reprise, anti-doublon, escalade)" "N1."
c EIA-008 8  "N2 · Isolation par conteneur pour chaque exécution" "N2." "EIA-006,EIA-007"
c EIA-009 9  "C7 · Aucune exécution sans isolation" "C7." EIA-008
c EIA-010 10 "C5 · Exceptions liées à l'exécution, pas au rôle" "C5." EIA-007
c EIA-011 11 "N3 · Classe de risque calculée et portes configurables" "N3 et section Portes par classe de risque." EIA-005
c EIA-012 12 "N4 · Approbations liées à la version approuvée" "N4." "EIA-001,EIA-005"
c EIA-013 13 "N5 · Pont de déploiement à adaptateurs (staging, production, vérification)" "N5." EIA-002
c EIA-014 14 "N6 · Mesure des coûts et budgets paramétrables (global, ticket, exécution)" "N6." EIA-007
c EIA-015 15 "N7 · Données sensibles tenues hors des agents" "N7." EIA-008
c EIA-016 16 "N13 · Synchronisation à sens unique vers Jira, Notion ou GitHub Issues" "N13." EIA-005
node siege/backlog.js file | head -8
