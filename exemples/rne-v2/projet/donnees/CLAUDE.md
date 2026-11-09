# Fiche filiale — Données

> Lire aussi `../CLAUDE.md` (règles communes RNE v2).

## Identité
- Nom : Données — Préfixe : `DON` — Dossier : `projets/rne-v2/donnees`
- Mission : transformer ce que produit la Collecte en données exploitables : import
  PostgreSQL, sauvegardes, traduction des textes arabes, évaluation de modèles.

## Domaine métier
- Base cible : table `rne` (base `komptacloud_scrapping`), partagée avec d'autres
  applications (dont Kompta). Colonne `application_creation` : `'scrapper'` pour nos fiches.
- **Règle d'or : ne jamais modifier ni supprimer une fiche créée par une autre application.**
- Identifiants : < 8 caractères → complétés de zéros à gauche ; 8 caractères → gardés
  si « 7 chiffres + lettre » (`\d{7}[A-Z]`) ou « RNE + 5 chiffres » (`RNE\d{5}`) ;
  sinon rejet tracé dans un fichier de rejets.
- Schéma de la table `rne` : **à fournir par le CEO** (`pg_dump -s -t rne -t rne_seq`) ;
  en attendant, l'architecte définit une table minimale de test, sans prétendre
  reproduire le vrai schéma.

## Stack
- Python 3.8+ stdlib ; PostgreSQL via les binaires `psql`, `pg_dump`, `pg_restore`
  (pas de driver Python). Fournisseurs de LLM appelés en REST via `urllib`.

## Commandes
- Tests : `python3 -m unittest discover -s donnees/tests`
- Tests base : base temporaire créée puis supprimée par le test, jamais la vraie base.

## Règles spécifiques par rôle
- dev-backend : imports par lots (`\copy` vers table temporaire puis `INSERT … ON
  CONFLICT`) ; une sauvegarde n'apparaît qu'une fois complète et vérifiée
  (`pg_restore --list`).
- qa : toujours tester qu'une fiche d'une autre application reste intacte, les
  identifiants limites (7, 8, 9 caractères), les doublons, la reprise d'import.
- rssi-devsecops : mot de passe de base jamais journalisé ni renvoyé ; requêtes SQL
  jamais construites par concaténation de données reçues ; clés d'API de LLM jamais
  dans les journaux.

## Contraintes
- Coûts LLM : modèles gratuits ou sur crédits d'abord, le plus puissant d'abord ;
  tout appel réel à un LLM dans un test doit être explicitement autorisé par le CEO.
