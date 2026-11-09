---
name: documentation-html
description: Tenir à jour la documentation HTML d'une filiale (page autonome, sommaire, une section par module, journal des versions) à partir de la spec, de l'ADR et des rapports.
---
# Documentation HTML

Fichier : `<filiale>/docs/site/index.html` — une seule page autonome (CSS intégré, aucun script ni
ressource externe), lisible sur mobile, thème clair et sombre.

## Structure
1. Sommaire (ancres).
2. Une section par module : **ce que ça fait** (pour l'utilisateur), **comment ça marche** (pour un
   développeur, schéma texte si utile), **décisions** (lien relatif vers l'ADR), **limites connues**.
3. Journal des versions en bas : date, ID du ticket, résumé en une ligne.

## Règles
Écrire pour le développeur qui arrive demain ; phrases courtes ; exemples concrets (commandes, fichiers) ;
ne jamais recopier un secret ni une donnée réelle ; mettre à jour sans réécrire ce qui reste vrai.
