---
name: rediger-un-adr
description: Rédiger un Architecture Decision Record (contexte, 2-3 options chiffrées, recommandation, impacts, risques, retour arrière) ancré dans le code existant.
---
# Rédiger un ADR

Modèle : `templates/adr.md`. Fichier : `<filiale>/docs/adr/<ID>-<slug>.md`.

1. **Contexte** : ce que demande la spec et ce que fait le code aujourd'hui (cite les fichiers lus).
2. **Options** : 2 ou 3 vraies alternatives, dont la plus simple. Pour chacune : avantages, inconvénients,
   coût / effort, risque. Pas d'option « paille » ajoutée pour faire nombre.
3. **Recommandation** : une option, et la raison principale en une phrase.
4. **Impacts** : fichiers et modules touchés, migration de données, contrat inter-filiales (oui/non).
5. **Risques et retour arrière** : comment on revient en arrière si ça tourne mal en production.

Règles : la solution la plus simple qui satisfait les critères d'acceptation ; pas de dépendance nouvelle
sans la justifier ; respecter les contraintes de la fiche de la filiale (stack imposée, politesse envers
les API externes, secrets).
