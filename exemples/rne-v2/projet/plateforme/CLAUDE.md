# Fiche filiale — Plateforme

> Lire aussi `../CLAUDE.md` (règles communes RNE v2).

## Identité
- Nom : Plateforme — Préfixe : `PLA` — Dossier : `projets/rne-v2/plateforme`
- Mission : faire tourner les jobs ailleurs que sur le PC : serveurs distants (ssh /
  rsync), plusieurs instances du job fiches, VM Google Cloud, déploiement d'un
  orchestrateur, CI/CD.

## Stack
- Python 3.8+ stdlib qui appelle `ssh`, `rsync`, `gcloud`, `git` en sous-processus
  (**jamais via un shell**, arguments validés par expression régulière).
- systemd, Caddy (HTTPS), PostgreSQL sur Debian, GitHub Actions.

## Commandes
- Tests : `python3 -m unittest discover -s plateforme/tests`
- Tous les tests utilisent un **faux ssh** (dossier local = serveur, hôte `panne` =
  injoignable) et un **faux gcloud** (VM = fichiers JSON locaux).

## Règles spécifiques par rôle
- product-owner : toute opération destructive (supprimer des VM, des données) exige
  une confirmation tapée (`DETRUIRE`, `SUPPRIMER`) et ne s'exécute **que si la
  dernière synchronisation des données a réussi**.
- dev-backend : seuls les serveurs déclarés comme gérés sont touchés ; on ne réécrit
  qu'un bloc délimité de `~/.ssh/config`, jamais le reste.
- qa : tester panne d'un serveur au milieu d'une opération, zone cloud pleine, quota
  atteint, synchro ratée (rien ne doit être supprimé).
- rssi-devsecops : aucune option ssh injectable via une saisie ; comptes de service à
  droits minimaux ; CI sans clé longue durée (fédération d'identité).

## Contraintes
- **Coût réel** : aucune VM, IP, bucket ou workflow réel créé par un agent. Les
  commandes réelles sont livrées sous forme de procédure, exécutées par le CEO.
