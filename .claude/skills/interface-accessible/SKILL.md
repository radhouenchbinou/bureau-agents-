---
name: interface-accessible
description: Construire des écrans accessibles et responsives (clavier, lecteur d'écran, contrastes, mobile, thème sombre) dans le framework déjà présent dans la filiale.
---
# Interface accessible

- Éléments natifs d'abord (`button`, `label`, `select`) ; un clic = un bouton, une navigation = un lien.
- Tout est atteignable et utilisable au clavier ; focus visible ; ordre de tabulation logique.
- Chaque champ a un libellé ; chaque icône seule a un `aria-label` ; les messages d'état sont annoncés
  (`role="status"` / `aria-live`).
- Contraste suffisant en clair et en sombre ; aucune information portée par la seule couleur.
- Mobile : largeur 360 px sans défilement horizontal, cibles tactiles ≥ 40 px.
- Données externes insérées comme texte (jamais `innerHTML` avec des données).
- Vérifier : navigation clavier complète, rendu mobile, thème sombre, états vide / chargement / erreur.
