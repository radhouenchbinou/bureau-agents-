# Exemple : CycloFix (entreprise fictive)

CycloFix répare les vélos **à domicile** : le client réserve un créneau sur le site, un technicien
passe avec son atelier mobile, le client paie en ligne. Tout est inventé (marque, personnes, données) ;
l'exemple sert à essayer l'entreprise d'agents sur un écosystème réaliste, **un repo par filiale** :

| Filiale | Préfixe | Dossier (= repo) | Rôle |
|---|---|---|---|
| Réservations | RES | `projets/cyclofix-api` | API REST : créneaux, réservations, techniciens, paiements |
| Atelier | ATE | `projets/cyclofix-atelier` | Application web des techniciens : tournée du jour, diagnostic, pièces |
| Vitrine | VIT | `projets/cyclofix-vitrine` | Site public : tarifs, réservation, espace client |
| Groupe | GRP | `portfolio` | Contrats d'interface et décisions transverses |

Le backlog (`portfolio/features.json`) compte **14 features en 4 jalons**. Il montre les cas utiles à tester :
- un **contrat d'interface** d'abord (GRP-001 : API des réservations utilisée par l'atelier et la vitrine) ;
- des features **mono-filiale** (RES-001, ATE-001…) avec dépendances ;
- une feature **multi-filiales** livrée d'un bloc : GRP-002 « Acompte payé en ligne », parent de RES-004
  (API de paiement, le producteur) et VIT-003 (écran de paiement, le consommateur) ; les deux PR, une par repo,
  sont fusionnées ensemble ou pas du tout.

## Installer l'exemple dans votre siège

Depuis la racine du siège :

```bash
cp exemples/cyclofix/portfolio/filiales.md exemples/cyclofix/portfolio/roadmap.md exemples/cyclofix/portfolio/features.json portfolio/
mkdir -p projets
for r in cyclofix-api cyclofix-atelier cyclofix-vitrine; do
  cp -r exemples/cyclofix/projets/$r projets/$r
  git -C projets/$r init -q -b main && git -C projets/$r add -A && git -C projets/$r commit -qm "Fondations"
done
node siege/backlog.js file        # GRP-001 doit être le premier ticket
```

Ensuite, si vous voulez la partie GitHub : créez trois repos vides, déclarez-les dans Siège › Intégrations ›
GitHub (un repo par dossier). Puis dans Claude Code : `/feature`.
