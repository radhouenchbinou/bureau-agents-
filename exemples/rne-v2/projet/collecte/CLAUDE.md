# Fiche filiale — Collecte

> Lire aussi `../CLAUDE.md` (règles communes RNE v2).

## Identité
- Nom : Collecte — Préfixe : `COL` — Dossier : `projets/rne-v2/collecte`
- Mission : récupérer, poliment et avec reprise, la liste des entreprises actives du
  RNE (job « liste ») puis la fiche détaillée de chacune (job « fiches »).

## Domaine métier — l'API du RNE (ce qu'on sait)

**Liste** : `GET https://www.registre-entreprises.tn/api/rne-api/front-office/shortEntites`
- Filtres : `etatRegistre=Actif`, `notInStatusList=EN_COURS_CREATION`, `typeEntite=M`, `limit=20`.
- 20 résultats max par appel (`limit` plafonné côté serveur).
- Pagination par curseur : `afterId` = `identifiantUnique` du dernier élément reçu →
  appels forcément séquentiels.
- Réponse : `registres` (liste) et `total` = nombre restant **après** le curseur
  (~245 000 au départ, ~12 200 appels).
- Ni cookie ni authentification ; envoyer un User-Agent navigateur et le `Referer` du site.
- Ordre : décroissant sur la chaîne `identifiantUnique` (quelques anciens formats en
  tête, ex. `Z932038`, puis `RNE11851`, `RNE11850`…).
- Champs : `identifiantUnique`, `denomination` (arabe, toujours rempli, ~20 % masqués
  `####`), `denominationLatin` (souvent vide), `nomCommercialFr/Ar`.
- Latence observée ~3 s par appel.
- Fin de liste : page vide avec `total` nul/absent. Observé : sur la dernière page,
  réponse **200 sans corps** quand l'appel précédent annonçait `total` < 20.

**Fiche** : `GET …/api/rne-api/front-office/entites/short-details/{identifiant}`
- Identifiant envoyé **tel quel** : la version complétée de zéros répond 400
  `{"key":"NONE"}` (`998132E` marche, `0998132E` non) → « introuvable », pas une erreur.

## Stack
- Python 3.8+ stdlib (`urllib`, `json`, `fcntl`, `csv`…). Pas de base de données ici.
- Sorties dans `RNE_DATA_DIR` (défaut `.`).

## Commandes
- Tests : `python3 -m unittest discover -s collecte/tests`
- Faux serveur : `python3 collecte/outils/faux_rne.py` (après COL-001), activé par `RNE_API_URL`.

## Règles spécifiques par rôle
- product-owner : le rythme par défaut et la politesse sont des exigences, pas des options.
- dev-backend : **un seul fichier par job** (`rne_scraper.py`, `rne_details.py`), car
  le déploiement ne copie que lui. Écriture du JSONL au fil de l'eau + `flush` ;
  metadata écrite **après** le flush, de façon atomique (fichier temporaire + rename).
- qa : toujours tester reprise après coupure brutale (ligne JSONL tronquée), 429 avec
  `Retry-After`, 503 répétés, réponse invalide, curseur bloqué, dernière page vide.
- rssi-devsecops : aucune donnée envoyée ailleurs qu'au RNE ; chemins de fichiers
  jamais construits à partir de données reçues.

## Contraintes
- **Plafond de connexions simultanées au RNE : fixé par le CEO (5 par défaut).**
  Ne jamais le relever ni le contourner.
- Ne jamais lancer de scraping complet depuis une session de développement.
