---
name: pipeline-ci-securise
description: Préparer la livraison d'une filiale - pipeline CI (build, tests, analyse sécurité bloquante), conteneur, configuration documentée, procédure de déploiement et de retour arrière, sans jamais déployer.
---
# Pipeline CI sécurisé

## Pipeline (GitHub Actions par défaut)
- Déclencheurs : pull request vers `main` et push sur `main`.
- Étapes : installation figée (lockfile), build, **tests complets**, analyse des dépendances, détection de
  secrets, puis artefact. L'étape sécurité est **bloquante**.
- Permissions minimales (`permissions:` explicite, `contents: read` par défaut), actions épinglées par SHA,
  aucun secret en clair, fédération d'identité plutôt que clés longue durée pour le cloud.

## Livraison
- Dockerfile : image de base minimale et épinglée, utilisateur non root, pas de secret dans l'image.
- Variables d'environnement documentées dans un `*.env.example` (sans valeur réelle).
- Procédure de déploiement pas à pas **et** de retour arrière, dans `docs/rapports/<ID>-livraison.md`.

Interdits : déployer, pousser une image, modifier une infrastructure réelle, manipuler de vrais
identifiants. Tu livres des fichiers et une procédure.
