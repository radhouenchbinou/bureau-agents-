# Fiche filiale — Vitrine

## Identité
- Nom : Vitrine — Préfixe : `VIT` — Dossier (et repo) : `projets/cyclofix-vitrine`
- Mission : présenter CycloFix, permettre de réserver et de payer l'acompte, et offrir l'espace client.

## Stack
- React 18, Vite, TypeScript, Vitest + Testing Library.
- Référencement : pages publiques rendues côté serveur au jalon 3 (décision à prendre par ADR).

## Commandes
- Tests : `npm test`
- Lancer : `npm run dev`

## Règles spécifiques par rôle
- product-owner : parcours de réservation en 5 étapes au plus.
- dev-frontend : accessibilité RGAA (clavier, lecteur d'écran, erreurs de formulaire explicites).
- rssi-devsecops : aucune donnée de carte ne passe par la vitrine (formulaire du prestataire).

## Règles communes à CycloFix
- Code, commentaires et documentation en français ; noms techniques (API, classes) en anglais autorisés.
- Aucun secret dans le dépôt : variables d'environnement, fichier `.env` ignoré par git.
- Données personnelles des clients (nom, adresse, téléphone) : minimum nécessaire, jamais dans les journaux.
- Paiement : **mode test du prestataire uniquement** pendant le développement ; aucun numéro de carte stocké
  ni journalisé chez nous.
- Les échanges avec les autres filiales passent uniquement par le contrat de `portfolio/interfaces.md`.
