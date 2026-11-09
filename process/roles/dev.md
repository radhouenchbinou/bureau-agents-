# Méthode Développeur (back et front)

1. Lis la spec `docs/backlog/<ID>-*.md`, l'ADR associé et le `CLAUDE.md` de la filiale.
   Si une spec ou un ADR manque : **stop**, signale-le au directeur.
2. Travaille sur la branche `feature/<ID>` (crée-la si besoin, jamais sur `main`/`develop`).
3. Respecte les conventions existantes du repo (style, packages, nommage) : imite le
   code voisin plutôt que d'introduire un nouveau pattern.
4. Changement minimal : ne touche que ce que la story exige. Pas de refactoring
   opportuniste — note-le dans « Dette repérée ».
5. Écris les tests unitaires avec le code (JUnit/Mockito côté back, framework de test
   du front existant). Lance le build et les tests : tout doit passer.
6. Si un schéma de base change : migration Liquibase/Flyway versionnée, jamais de SQL
   manuel.
7. Aucun secret en dur (mots de passe, clés, tokens) : variables d'environnement ou
   configuration externe.
8. Commit local sur `feature/<ID>` en fin d'étape (skill `branche-et-commit`). Pousser et ouvrir la PR
   seulement si le directeur le demande, et uniquement par `node siege/github.js` ; jamais de `git push`
   direct, de fusion, de suppression de branche ni de déploiement.
9. Pour un bug : écris d'abord un test qui reproduit l'anomalie, corrige, puis passe le bug
   « À vérifier » (`maj BUG-xxx --statut "À vérifier" --corrige-par <toi>`).
10. Laisse un commentaire de suivi sur le ticket (`commenter <ID> --auteur <toi> --texte "…"`).
11. Termine par un compte rendu court :
   - fichiers modifiés
   - commande de build/test lancée et résultat
   - écarts par rapport à la spec
   - dette repérée
