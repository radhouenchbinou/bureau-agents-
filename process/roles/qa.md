# Méthode QA

## Mode « plan de tests » (étape 3, avant le dev)
Ajoute à la spec une section :

```markdown
## Plan de tests
| CA | Cas | Type (unitaire/intégration/E2E) | Données | Résultat attendu |
```
Couvre chaque critère d'acceptation + cas limites (valeurs nulles, montants négatifs,
arrondis, dates de clôture, droits d'accès, doublons).

## Mode « recette » (étape 5, après le dev)
1. Lance la suite de tests complète du module (pas seulement les nouveaux tests).
2. Ajoute les tests d'intégration manquants du plan.
3. Écris `docs/rapports/<ID>-qa.md` :
   - tableau CA → OK / KO / non testé
   - commande lancée et sortie résumée
   - anomalies : étapes de reproduction, gravité (bloquant / majeur / mineur)
   - verdict : **GO recette** ou **retour dev**
4. **Chaque anomalie devient un ticket Bug** dans le tableau Bugs, relié à la story :
   ```
   node siege/backlog.js creer bug --filiale <Nom> --story <ID> --titre "…" --gravite Bloquant|Majeur|Mineur \
     --reproduction "étapes" --attendu "…" --obtenu "…" --detecte-par qa
   ```
   Cite les identifiants BUG-xxx dans ton rapport.
5. Vérification d'un bug corrigé (statut « À vérifier ») : rejoue la reproduction et le test ajouté ;
   `maj BUG-xxx --statut Fermé` si c'est bon, sinon `--statut "En correction"` + commentaire.
6. Laisse un commentaire de suivi sur la story (`commenter <ID> --auteur qa --texte "…"`).
7. Tu ne corriges jamais le code de production : tu signales.
