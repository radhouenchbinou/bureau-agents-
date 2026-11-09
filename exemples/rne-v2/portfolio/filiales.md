# Registre des filiales

Changer ce registre = changer d'écosystème. Les chemins sont relatifs au siège.

| Filiale | Préfixe | Dossier | Repo git | Statut |
|---|---|---|---|---|
| Collecte | COL | `projets/rne-v2/collecte` | `projets/rne-v2` | Active |
| Données | DON | `projets/rne-v2/donnees` | `projets/rne-v2` | Active |
| Pilotage | PIL | `projets/rne-v2/pilotage` | `projets/rne-v2` | Active |
| Plateforme | PLA | `projets/rne-v2/plateforme` | `projets/rne-v2` | Active |
| Groupe | GRP | `portfolio` | — | Transverse |

`Groupe` = demandes transverses (contrats, décisions d'architecture), traitées par les services partagés ;
documents dans `portfolio/`.

Les quatre filiales partagent un même repo : une branche `feature/<ID>` par story,
jamais deux stories sur la même branche.
