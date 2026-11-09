---
name: detection-de-secrets
description: Chercher des secrets exposés (clés d'API, jetons, mots de passe, clés privées) dans le code, la configuration et l'historique git, sans jamais les recopier.
---
# Détection de secrets

1. Si `gitleaks detect` est autorisé : l'utiliser sur le repo (et l'historique).
2. Sinon, recherche avec l'outil Grep sur des motifs typiques :
   `(api|secret|token|passw|pwd|private)[_-]?(key)?\s*[:=]`, `-----BEGIN [A-Z ]*PRIVATE KEY-----`,
   `ntn_[A-Za-z0-9]{20,}`, `secret_[A-Za-z0-9]{20,}`, `gh[pousr]_[A-Za-z0-9]{30,}`, `AKIA[0-9A-Z]{16}`,
   `sk-[A-Za-z0-9]{20,}`, URL avec identifiants `://[^/\s:]+:[^@\s]+@`.
3. Historique : `git -C <repo> log -p -S '<motif>'` pour savoir si un secret a déjà été commité.
4. Vérifier `.gitignore` (`*.env`, clés, dossiers de données) et les exemples (`*.env.example` sans
   vraie valeur).

Dans le rapport : fichier, ligne, type de secret, **jamais la valeur** (masquer : `ntn_****`). Un secret
commité = gravité critique : rotation du secret par le CEO, pas seulement suppression du fichier.
