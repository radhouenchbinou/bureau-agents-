# EIA-018 — Vue 2.5D du Bureau (bouton)

## Ce que fait la fonctionnalité
Un bouton « Vue 2.5D » dans le Bureau bascule l'affichage de l'immeuble d'agents en perspective inclinée, sans bibliothèque 3D.

## Fonctionnement
- Le bouton (`aria-pressed`) bascule la classe `vue25d` sur l'immeuble.
- La préférence est gardée dans le navigateur (`localStorage` `siege.vue25d`) ; une erreur d'accès au stockage est ignorée.
- Le mouvement est désactivé si l'utilisateur préfère moins de mouvement (`prefers-reduced-motion`).

## Où c'est dans le code
- `siege/public/app.js` : `preferenceVue25d`, `basculer25d`, rendu de la barre du Bureau.
- `siege/public/style.css` : `.bureau-barre`, `.immeuble.vue25d`, règle de mouvement réduit.

## Limites connues
- Pas de Three.js : la vue 3D réelle n'est pas faite. Ce choix a été pris en raison de la règle « aucune dépendance npm sans accord du CEO ».

## Validation
- Recette, revue de code et sécurité validées par le CEO, sans rapport écrit.
