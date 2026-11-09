#!/bin/bash
# Session du mainteneur de l'Entreprise IA : aucune restriction (ni garde, ni bac à sable, ni permission), aucune
# règle fonctionnelle du Siège ; il exécute les demandes qu'on lui donne. Règle : process/mainteneur.md.
# Réservé au CEO. Usage : bash siege/mainteneur.sh ["première demande"]
cd "$(dirname "$0")/.." || exit 1
export SIEGE_ROLE=mainteneur
# Réglages du projet ignorés (garde, bac à sable, interdictions) ; ceux de l'utilisateur restent chargés
exec claude --setting-sources user --dangerously-skip-permissions --append-system-prompt "$(cat process/mainteneur.md)" "$@"
