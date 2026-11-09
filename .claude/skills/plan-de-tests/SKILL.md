---
name: plan-de-tests
description: Construire le plan de tests d'une story (chaque critère d'acceptation, cas limites, erreurs, non-régression) puis faire la recette et rédiger le rapport QA.
---
# Plan de tests et recette

## Plan (avant le développement)
Tableau ajouté à la spec : `| CA | Cas | Type | Données | Résultat attendu |`.
- Au moins un cas par critère d'acceptation.
- Cas limites systématiques : vide, nul, un seul élément, maximum, doublon, ordre inattendu, encodage
  (arabe, accents), fuseau horaire, coupure au milieu d'une écriture, reprise.
- Cas d'erreur : réponse invalide, 429 / 503, timeout, fichier absent ou corrompu, droits insuffisants.
- Non-régression : quelles suites existantes doivent rester vertes.

## Recette (après le développement)
1. Lancer la suite complète de la filiale (pas seulement les nouveaux tests).
2. Ajouter les tests du plan qui manquent (dans `tests/`).
3. Rapport `docs/rapports/<ID>-qa.md` : critères OK / KO / non testé, commande et sortie résumée,
   anomalies (chacune = un ticket Bug, voir la skill remonter-un-bug), verdict GO recette ou retour dev.
