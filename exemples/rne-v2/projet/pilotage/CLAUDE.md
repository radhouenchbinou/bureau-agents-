# Fiche filiale — Pilotage

> Lire aussi `../CLAUDE.md` (règles communes RNE v2).

## Identité
- Nom : Pilotage — Préfixe : `PIL` — Dossier : `projets/rne-v2/pilotage`
- Mission : le poste de commande : tableau de bord web (suivi, démarrage / pause /
  arrêt des jobs, analyse, réglages, métriques techniques), accès sécurisé, et
  application mobile miroir.

## Stack
- Tableau de bord : Python 3.8+ stdlib (`http.server`), page HTML/CSS/JS intégrée,
  **sans librairie externe ni CDN**. Graphiques dessinés à la main (SVG/canvas).
- Mobile : Ionic + Angular (standalone), Capacitor, servi sous `/app/`.

## Commandes
- Tests Python : `python3 -m unittest discover -s pilotage/tests`
- Mobile : `cd pilotage/mobile && npm ci && npm run build` (une fois créé)

## Règles spécifiques par rôle
- product-owner : chaque job a ses KPI, son lanceur et son journal ; le tableau de bord
  ne fait qu'**observer et commander** via les contrats (fichiers de contrôle, métriques,
  metadata) : il ne contient aucune logique de collecte ou d'import.
- dev-backend : n'écoute que sur 127.0.0.1 tant que l'accès sécurisé (story dédiée)
  n'existe pas ; POST uniquement en JSON avec contrôle `Host`/`Origin` (anti-CSRF,
  DNS rebinding). Le serveur n'exécute jamais de commande brute fournie par la page.
- dev-frontend : thème clair et sombre, lisible sur téléphone ; mêmes couleurs et
  mêmes indicateurs sur PC et mobile.
- qa : tester chaque bouton contre de faux jobs (jamais de vrais appels RNE) ;
  ne jamais cliquer « Démarrer » contre le vrai serveur.
- rssi-devsecops : secrets jamais renvoyés au navigateur ; téléchargements par nom
  validé (jamais de chemin libre) ; fichiers statiques jamais servis hors de leur dossier.
