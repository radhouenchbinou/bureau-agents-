---
description: Audit sécurité complet d'une filiale par le RSSI
argument-hint: <filiale>
---
Filiale à auditer : $ARGUMENTS

Délègue à `rssi-devsecops` un audit complet (pas seulement un diff) de la filiale,
avec en tête `Filiale : <nom> — dossier <chemin>`. Rapport attendu :
`<dossier>/docs/rapports/audit-<AAAA-MM-JJ>.md`.

Présente ensuite au CEO : nombre de constats par gravité, les 3 plus graves, et
propose de créer une story corrective par constat critique ou haut (question à choix).
