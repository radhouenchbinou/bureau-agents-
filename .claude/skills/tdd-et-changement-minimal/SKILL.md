---
name: tdd-et-changement-minimal
description: Développer une story ou corriger un bug en partant des critères d'acceptation - test d'abord, changement minimal, conventions du repo, build et tests verts avant de rendre.
---
# TDD et changement minimal

1. **Lire** : spec, ADR, plan de tests, commentaires du ticket, fiche de la filiale (stack, commandes).
2. **Test d'abord** : pour chaque critère d'acceptation (ou pour le bug : un test qui le reproduit), un
   test qui échoue pour la bonne raison.
3. **Code minimal** pour le faire passer ; puis nettoyer sans changer le comportement.
4. **Imiter le code voisin** : nommage, structure, gestion d'erreurs, style. Pas de nouveau framework,
   pas de dépendance nouvelle sans ADR.
5. **Rien hors périmètre** : un refactoring repéré va dans « Dette repérée » du compte rendu.
6. **Vérifier** : suite de tests complète de la filiale verte, pas seulement les nouveaux tests.
7. **Rendre** : fichiers modifiés, commande de test et résultat, écarts à la spec, dette repérée.

Interdits : secrets en dur, montants en flottant, désactiver ou affaiblir un test pour le faire passer,
toucher à une autre filiale.
