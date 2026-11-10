# EIA-004 — Backlog local : verrou inter-processus et identifiants réservés (C3)

## Ce que fait la fonctionnalité
Les écritures sur le backlog local (`portfolio/*.json`) se font sous verrou inter-processus. Les identifiants sont attribués et réservés sous ce même verrou : deux processus ne peuvent pas recevoir le même identifiant, ni perdre leurs modifications mutuelles.

## Comment ça marche
- Verrou : création exclusive d'un fichier `<fichier>.lock` (`wx`), libéré en fin d'opération, considéré périmé après 30 secondes, abandon après 10 secondes d'attente.
- Création : `SourceFichier.creerAvecId(prefixe, entree)` calcule le prochain identifiant et écrit l'entrée dans le même verrou.

## Où c'est dans le code
- `siege/lib/backlog.js` : `sousVerrou`, `CommentairesFichier.ajouter`, `SourceFichier.ecrire`, `SourceFichier.creerAvecId`.
- `siege/backlog.js` : la commande `creer` utilise `creerAvecId`.
- `siege/test/backlog-verrou.test.js` : 20 créations concurrentes dans un processus, puis 20 processus distincts créant chacun un ticket.

## Limites connues
- Le verrou repose sur un fichier : un processus qui plante laisse le verrou, qui n'est retiré qu'après 30 secondes.

## Validation
- Recette, revue de code et sécurité validées par le CEO, sans rapport écrit.
