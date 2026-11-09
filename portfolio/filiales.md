# Registre des filiales

Changer ce registre = changer d'écosystème. Les chemins sont relatifs au siège.
Ajoutez une filiale avec `/nouvelle-filiale <Nom> <dossier>` (voir le README).

| Filiale | Préfixe | Dossier | Repo git | Statut |
|---|---|---|---|---|
| Groupe | GRP | `portfolio` | — | Transverse |
| Entreprise IA | EIA | `projets/entreprise-ia/siege` | `projets/entreprise-ia` | Active |

`Groupe` = demandes transverses (contrats, décisions d'architecture), traitées par les services partagés ;
documents dans `portfolio/`.

Plusieurs filiales peuvent partager un même repo (un dossier chacune) : une branche `feature/<ID>` par
ticket, jamais deux tickets sur la même branche.
