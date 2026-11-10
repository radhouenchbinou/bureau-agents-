# EIA-017 — Journal d'activité par agent dans sa fiche détaillée

## Ce que fait la fonctionnalité
La fiche d'un agent affiche son journal : ses missions, ses actions, ses refus par la garde et ses exceptions, du plus récent au plus ancien.

## Fonctionnement
- Module `siege/lib/journal-agents.js` : ouverture d'une entrée (`ouvrir`), ajout d'événement (`evenement`), clôture (`clore`), lecture paginée, réconciliation et purge au démarrage du Siège puis toutes les heures.
- Les entrées sont en ajout seul. Un secret ou un jeton est masqué avant écriture.
- La garde (`siege/garde.js`) inscrit les refus et les exceptions utilisées. Les sous-agents confiés par l'outil `Agent` sont ouverts et rattachés à leur ticket.
- L'interface (`siege/public/journal-agent.js`) affiche la liste par 20, les détails repliables, le filtre par ticket et un bandeau si l'écriture échoue.

## Où c'est dans le code
- `siege/lib/journal-agents.js`, `siege/public/journal-agent.js`, `siege/server.js` (routes et entretien), `siege/garde.js` (branchements).
- Tests : `siege/test/journal-agents.test.js` (dont les sous-agents et la sécurité des secrets), `siege/test/journal-agent-ui.test.js`.

## Limites connues
- Recette manuelle mobile (360 px), thème sombre et clavier : non faite.
- `siege/garde.js` est une zone critique : la fusion a demandé de résoudre des conflits dans ce fichier. Une relecture RSSI dédiée serait utile.
- Une règle de garde (`~/**`) reste à trancher par le CEO.

## Validation
- Recette, revue de code et sécurité validées par le CEO, sans rapport écrit.
