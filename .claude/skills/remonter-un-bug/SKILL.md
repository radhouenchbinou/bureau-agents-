---
name: remonter-un-bug
description: Créer un ticket Bug reproductible dans le tableau Bugs (gravité, story liée, étapes, attendu, obtenu) et vérifier sa correction.
---
# Remonter un bug

```
node siege/backlog.js creer bug --filiale <Nom> --story <ID> --titre "<symptôme court>" \
  --gravite Bloquant|Majeur|Mineur --detecte-par qa \
  --reproduction "1. … 2. … 3. …" --attendu "…" --obtenu "…"
```

## Gravité
- **Bloquant** : critère d'acceptation essentiel KO, perte ou corruption de données, sécurité.
- **Majeur** : fonction dégradée sans contournement simple.
- **Mineur** : cosmétique, message, cas rare avec contournement.

## Un bon bug
Un seul problème par ticket ; reproduction minimale et déterministe (commande exacte, données) ; attendu
cité depuis la spec ; obtenu copié (sortie, trace) sans interprétation.

## Vérification
Bug « À vérifier » : rejouer la reproduction **et** le test ajouté par le dev ;
`maj BUG-xxx --statut Fermé` si c'est bon, sinon `--statut "En correction"` + commentaire factuel.
