---
name: ecrire-une-user-story
description: Rédiger une spécification de feature (user story, règles métier, critères d'acceptation Given/When/Then, hors périmètre, questions ouvertes) prête pour l'architecte et le QA.
---
# Écrire une user story

## Méthode
1. Une phrase de besoin : *En tant que <rôle>, je veux <action> afin de <bénéfice>.*
2. **Règles métier** numérotées (R1, R2…) : uniquement ce qui est su (fiche de la filiale, ticket, réponses
   du CEO). Une règle devinée est une question ouverte, pas une règle.
3. **Critères d'acceptation** testables, un par comportement, au format Given / When / Then, avec des
   valeurs concrètes (montants, dates, identifiants). Inclure les cas d'erreur et les limites.
4. **Hors périmètre** explicite : ce que la story ne fait pas (évite la dérive en développement).
5. **Impacts autres filiales** : oui/non ; si oui, lesquelles et quel contrat (portfolio/interfaces.md).
6. **Questions ouvertes** : chacune devient un commentaire `--question` sur le ticket.

## Grille INVEST avant de rendre
Indépendante · Négociable · porte une Valeur · Estimable · Small (≤ 2 jours, sinon découper en features
reliées par `--dependances`) · Testable (chaque critère vérifiable par un test).

## Exemple de critère
- CA2 : Given une liste dont la dernière page renvoie 200 sans corps et un appel précédent avec `total=1`,
  When le scraper reçoit cette réponse, Then il termine le run avec le statut `termine` et produit le CSV.
