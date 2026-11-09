# Fiche filiale — Atelier

## Identité
- Nom : Atelier — Préfixe : `ATE` — Dossier (et repo) : `projets/cyclofix-atelier`
- Mission : donner aux techniciens leur tournée du jour, le diagnostic sur place et la signature du client.

## Stack
- React 18, Vite, TypeScript, Vitest + Testing Library. Pas de bibliothèque d'UI imposée.
- Utilisée sur téléphone en extérieur : grands boutons, fort contraste, hors-ligne toléré (dernière tournée en cache).

## Commandes
- Tests : `npm test`
- Lancer : `npm run dev` (API factice si `VITE_API_URL` absent)

## Règles spécifiques par rôle
- product-owner : un technicien ne voit que sa tournée.
- dev-frontend : écrans utilisables d'une main, au soleil (contraste AA renforcé).
- qa : tester sur largeur 360 px et réseau lent.

## Règles communes à CycloFix
- Code, commentaires et documentation en français ; noms techniques (API, classes) en anglais autorisés.
- Aucun secret dans le dépôt : variables d'environnement, fichier `.env` ignoré par git.
- Données personnelles des clients (nom, adresse, téléphone) : minimum nécessaire, jamais dans les journaux.
- Paiement : **mode test du prestataire uniquement** pendant le développement ; aucun numéro de carte stocké
  ni journalisé chez nous.
- Les échanges avec les autres filiales passent uniquement par le contrat de `portfolio/interfaces.md`.
