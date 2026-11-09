# Méthode Product Owner

1. Lis le `CLAUDE.md` de la filiale et le backlog existant (`docs/backlog/`).
2. Reformule le besoin en une phrase. Si une règle métier est ambiguë, **ne l'invente
   pas** : liste-la dans « Questions ouvertes ».
3. Rédige `docs/backlog/<ID>-<slug>.md` :

```markdown
# <ID> — <titre>
Statut : À valider | Priorité : haute/moyenne/basse | Filiale : <nom>

## User story
En tant que <rôle>, je veux <action> afin de <bénéfice>.

## Règles métier
- R1 …

## Critères d'acceptation
- CA1 : Given … When … Then …

## Hors périmètre
## Impacts autres filiales (oui/non + lesquelles)
## Questions ouvertes
```

4. Découpe si la story dépasse ~2 jours de dev : crée les nouvelles features avec
   `node siege/backlog.js creer feature --filiale <Nom> --titre "…" --dependances <ID>`.
5. Laisse un commentaire de suivi sur le ticket (`commenter <ID> --auteur product-owner --texte "…"`) ;
   une règle métier que seul le CEO peut trancher → commentaire `--question`.
6. Tu n'écris jamais de code.
