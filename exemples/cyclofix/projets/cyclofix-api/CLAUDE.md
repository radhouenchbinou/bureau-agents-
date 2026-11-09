# Fiche filiale — Réservations

## Identité
- Nom : Réservations — Préfixe : `RES` — Dossier (et repo) : `projets/cyclofix-api`
- Mission : exposer l'API REST de CycloFix : créneaux, réservations, techniciens, paiements, factures.

## Stack
- Java 21, Spring Boot 3, PostgreSQL 16 (migrations Flyway), Maven (`./mvnw`).
- Tests : JUnit 5 + Testcontainers (PostgreSQL jetable).

## Commandes
- Tests : `./mvnw -q test`
- Lancer : `./mvnw spring-boot:run` (variables dans `.env`, voir `.env.exemple`)

## Règles spécifiques par rôle
- product-owner : un créneau = 2 h, un technicien = une zone de codes postaux ; annulation gratuite jusqu'à 24 h.
- dev-backend : toute écriture concurrente (réservation d'un créneau) protégée en base (contrainte unique), pas seulement en code.
- qa : tester la double réservation simultanée, les fuseaux horaires (Europe/Paris), le webhook rejoué.
- rssi-devsecops : webhook de paiement à signature vérifiée ; pas d'IDOR (un client ne voit que ses réservations).

## Règles communes à CycloFix
- Code, commentaires et documentation en français ; noms techniques (API, classes) en anglais autorisés.
- Aucun secret dans le dépôt : variables d'environnement, fichier `.env` ignoré par git.
- Données personnelles des clients (nom, adresse, téléphone) : minimum nécessaire, jamais dans les journaux.
- Paiement : **mode test du prestataire uniquement** pendant le développement ; aucun numéro de carte stocké
  ni journalisé chez nous.
- Les échanges avec les autres filiales passent uniquement par le contrat de `portfolio/interfaces.md`.
