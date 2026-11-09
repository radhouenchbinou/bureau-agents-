---
description: Intégrer un projet dans l'entreprise (fiche, dossiers docs, registre)
argument-hint: <nom> <dossier>
---
Intègre la filiale suivante : $ARGUMENTS

1. Vérifie que le dossier existe. Sinon, arrête-toi et demande le bon chemin.
2. Explore le dossier en lecture seule (manifestes : pom.xml, build.gradle,
   package.json, requirements.txt / pyproject.toml, Dockerfile, CI, README) pour
   détecter stack, versions et commandes de build/test.
3. Propose au CEO un **préfixe d'ID** (3 lettres) par une question à choix.
4. Rédige `<dossier>/CLAUDE.md` à partir de `templates/fiche-filiale.md`.
   Ne remplis que ce que tu as constaté ; marque `À COMPLÉTER` tout le reste
   (notamment les règles métier).
5. Crée `<dossier>/docs/backlog/`, `docs/adr/`, `docs/rapports/` s'ils manquent.
6. Ajoute une ligne à `portfolio/filiales.md`.
7. Montre au CEO un résumé de la fiche et la liste des `À COMPLÉTER`, puis demande
   validation avant tout autre travail sur cette filiale.
