# RNE v2 — règles communes aux 4 filiales

Reconstruction, à partir de zéro, d'un outil qui collecte la liste des personnes
morales actives du Registre National des Entreprises tunisien
(https://www.registre-entreprises.tn), récupère leurs fiches détaillées, les importe
dans PostgreSQL, les traduit, et pilote le tout depuis un tableau de bord, en local
puis sur Google Cloud.

| Filiale | Dossier | Préfixe |
|---|---|---|
| Collecte | `collecte/` | COL |
| Données | `donnees/` | DON |
| Pilotage | `pilotage/` | PIL |
| Plateforme | `plateforme/` | PLA |

## Contraintes valables partout (non négociables)

- **Python 3.8+, bibliothèque standard uniquement** pour tout le code Python : pas de
  `requests`, pas de `pip install`. Seule exception : l'application mobile (Node/Ionic).
- **Politesse envers le RNE** : appels séquentiels, pauses, backoff long sur 429/503.
  Ne jamais paralléliser ni réduire les délais sans demande explicite du CEO.
- **Aucun appel au vrai serveur RNE pendant le développement ou les tests** : tout se
  teste contre le faux serveur RNE (`collecte/outils/faux_rne.py`, story COL-001).
  Quelques vrais appels seulement sur demande explicite du CEO.
- **Aucune ressource cloud réelle** (gcloud, VM, bucket, GitHub) créée ou modifiée par
  un agent : tests avec faux `gcloud` / faux `ssh` / faux `git remote` locaux.
- Code, journaux, commentaires et documentation **en français**.
- Secrets (mots de passe, clés d'API) : jamais dans le code ni dans git ;
  `rne-scraper.env` (ignoré par git) ou réglages en fichier `600`.
- Les échanges entre filiales passent **uniquement** par les contrats de
  `portfolio/interfaces.md` (au siège). Pas de contrat → pas de développement.

## Tests

`python3 -m unittest discover -s <filiale>/tests` pour chaque filiale. Chaque story
livre ses tests ; la suite de toutes les filiales doit passer avant une revue.
