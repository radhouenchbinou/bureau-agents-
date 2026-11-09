# Feuille de route

Le backlog vit dans l'outil du Siège (tableaux **Features** et **Bugs**, sur Notion ou en local dans
`portfolio/features.json` / `portfolio/bugs.json`). Pour le voir dans l'ordre de traitement :

```
node siege/backlog.js file
```

Ce fichier ne garde que la vue d'ensemble des jalons du projet de test RNE v2 (reconstruction du scrapper
à partir de zéro) :

| Jalon | Contenu |
|---|---|
| 0 · Fondations | Contrats d'interface C1-C4, faux serveur RNE |
| 1 · Collecter la liste (MVP) | Scraper, rythme poli, CSV, pilotage, push git, systemd |
| 2 · Tableau de bord local | KPI, pilotage, analyse, filtres jq, réglages, technique |
| 3 · Fiches et base | Job fiches, import PostgreSQL, sauvegardes |
| 4 · Distribué et Google Cloud | Serveurs distants, instances, VM |
| 5 · Traduction | Multi-LLM, contrôle, coûts, évaluation Ollama |
| 6 · Exposition, mobile, CI/CD | Accès sécurisé, orchestrateur, CI/CD, app mobile |

**Critère de validation de la structure** : à la fin du jalon 6, RNE v2 offre les mêmes fonctions que le
scrapper actuel, avec specs, ADR, rapports et doc pour chaque ticket.
