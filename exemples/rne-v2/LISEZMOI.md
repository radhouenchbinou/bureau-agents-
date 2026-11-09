# Exemple : RNE v2

Reconstruction, à partir de zéro, d'un outil de collecte du Registre National des Entreprises tunisien
(liste des entreprises actives, fiches détaillées, import PostgreSQL, traduction, tableau de bord, Google
Cloud, application mobile). Le backlog est issu du reverse engineering de l'outil existant : **34
features** ordonnées en **7 jalons**, réparties sur **4 filiales** qui partagent un même repo :

| Filiale | Préfixe | Dossier |
|---|---|---|
| Collecte | COL | `projets/rne-v2/collecte` |
| Données | DON | `projets/rne-v2/donnees` |
| Pilotage | PIL | `projets/rne-v2/pilotage` |
| Plateforme | PLA | `projets/rne-v2/plateforme` |

C'est un bon terrain d'essai : plusieurs filiales, des contrats d'interface entre elles (fichiers JSONL,
pilotage des jobs, réglages), une API externe à ménager, des secrets, du cloud.

## Installer l'exemple dans votre siège

Depuis la racine du siège :

```bash
cp exemples/rne-v2/portfolio/filiales.md exemples/rne-v2/portfolio/roadmap.md portfolio/
cp exemples/rne-v2/portfolio/features.json portfolio/
mkdir -p projets && cp -r exemples/rne-v2/projet projets/rne-v2
git -C projets/rne-v2 init -b main && git -C projets/rne-v2 add -A && git -C projets/rne-v2 commit -m "Fondations"
node siege/backlog.js file        # GRP-001 doit être le premier ticket
```

Puis dans Claude Code : `/feature`.

## Règles importantes de l'exemple

- Aucun appel au vrai serveur du RNE pendant le développement : tout passe par le faux serveur (COL-001).
- Aucune ressource cloud réelle créée par un agent.
- Python 3.8+, bibliothèque standard uniquement.

Voir `projet/CLAUDE.md` et la fiche de chaque filiale.
