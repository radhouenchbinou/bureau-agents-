---
name: audit-securite
description: Évaluer la sécurité d'un changement ou d'une filiale (OWASP Top 10, entrées, secrets, dépendances, fichiers, IA) et rendre un verdict GO / NO-GO avec le feu agents/securite.
---
# Audit sécurité

## Contrôles
- **Injection** : SQL, commandes shell, chemins construits depuis une donnée reçue, désérialisation.
- **Contrôle d'accès** : vérifié côté serveur, pas seulement à l'écran ; écoute réseau minimale.
- **Données sensibles** : secrets, mots de passe, jetons jamais en dur, jamais dans les journaux, les
  métriques, les réponses au navigateur ; fichiers sensibles en 600.
- **Entrées** : validation, bornes, types, taille maximale ; CSRF et DNS rebinding pour les interfaces web.
- **Dépendances** : versions vulnérables (`pip-audit`, `npm audit`… si autorisés), dépendances inutiles.
- **Fichiers** : écriture atomique, liens symboliques, droits, dossiers partagés.
- **Appels externes** : politesse (débit, backoff), délais, certificats, aucune donnée envoyée ailleurs.
- **IA** (si LLM) : injection de prompt, fuite de données, coût non borné.

## Rendu
`docs/rapports/<ID>-secu.md` : constat, gravité (critique / haute / moyenne / basse), preuve `fichier:ligne`,
correction. **NO-GO** dès qu'il y a du critique ou du haut. Si une PR existe :
`node siege/github.js statut --role rssi-devsecops --filiale <Nom> --pr <N> --contexte securite --etat success|failure`.
