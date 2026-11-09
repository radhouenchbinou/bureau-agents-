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
4. Rédige la fiche à partir de `templates/fiche-filiale.md` (dans ta réponse, pas dans un fichier : tu n'écris
   aucun fichier). Ne remplis que ce que tu as constaté ; marque `À COMPLÉTER` tout le reste (notamment les règles
   métier). Une filiale = un repo : le dossier est en général la racine du repo cloné dans `projets/`.
5. Montre au CEO la fiche et la liste des `À COMPLÉTER`, et demande validation (Valider / Corriger / Arrêter).
6. Après « Valider » seulement : `node siege/filiale.js ajouter --nom "<Nom>" --prefixe <ABC> --dossier <dossier>
   [--repo <repo>] --fiche "<la fiche validée>"`. L'outil crée `<dossier>/CLAUDE.md` (jamais par-dessus une fiche
   existante), `docs/backlog`, `docs/adr`, `docs/rapports` et la ligne de `portfolio/filiales.md`. Fiche déjà là :
   le CEO la complète lui-même.
7. Rappelle au CEO de déclarer le repo GitHub de la filiale (Siège › Intégrations › GitHub).
