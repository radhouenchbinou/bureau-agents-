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
