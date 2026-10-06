---
title: Recueils
description: Des collections de chants - simples ou numérotées comme un recueil imprimé - et les catalogues de recueils publiés.
---

Un **recueil** est une collection de chants. Les vôtres s'affichent sous **Recueils** dans la barre latérale.

## Créer un recueil

Choisissez **Créer un recueil** et son **Type** :

- **Simple** - une collection sans ordre ; les chants n'ont pas de numéro.
- **Numéroté** - les chants sont numérotés comme dans une édition imprimée, et chaque numéro est unique.

Donnez-lui un nom, et si vous voulez une abréviation, une langue, un éditeur et une année. Choisissez à qui il appartient : vous, une équipe, ou tout le monde (administrateurs globaux seulement).

![Un recueil](../../../assets/screenshots/fr/songbook.jpg)

La page d'un recueil parle de ses entrées : son nom, avec son nombre d'entrées (et son éditeur et son année), puis les entrées. **Détails** ouvre ce qui le décrit - son nom, son abréviation, sa langue, son éditeur et son année, les sections d'un recueil numéroté - et **Supprimer le recueil**.

### Couleur et image

Qui gère un recueil lui donne une **Couleur** et une image sous **Détails**, dans **Couleur et image**, comme pour une équipe (voir [Couleur et image](/fr/teams/#couleur-et-image)) : elles s'affichent à côté de son nom dans la barre latérale et les listes.

## Les chants d'un recueil

Sous **Chansons**, **Ajouter une chanson** en la cherchant et, dans un recueil numéroté, en indiquant son numéro.

Les chants sont listés dans l'ordre des numéros (1, 2, 10, 100), et un numéro simple est gardé sans zéros devant : « 0245 » est 245.

Un recueil numéroté peut avoir des **sections** : des plages de numéros avec un libellé, comme les volumes imprimés d'un recueil (1-371 « JEM1 », 372-721 « JEM2 »…). Vous pouvez ensuite filtrer le recueil par section.

La page d'un chant liste ses recueils avec sa référence complète - l'abréviation du recueil, le numéro et le volume : **JEM 855 · JEM3** - et **Copier** met « Titre — JEM 855 · JEM3 » dans le presse-papiers, pour la donner à quelqu'un qui n'utilise pas Songverse. Une liste l'indique aussi sous chaque chant.

## À partir du catalogue d'un recueil publié

Le **Catalogue de recueils** (**Parcourir le catalogue**) est un annuaire de recueils publiés : numéros, titres, crédits, tonalités et plus - mais ni paroles ni accords.

Un catalogue peut indiquer ses volumes imprimés, comme les sections d'un recueil. Commencer un recueil à partir de lui les copie ; un recueil commencé avant que le catalogue les ait propose **Utiliser les volumes du catalogue**.

Commencer un recueil à partir d'un catalogue vous donne toutes ses entrées d'un coup. Celles dont le chant n'est pas encore dans votre bibliothèque sont listées dans **Entrées en attente** : **Démarrer** l'une d'elles crée le chant avec les détails du catalogue, puis vous ajoutez paroles et accords.

## Import en masse

Pour remplir vite un recueil numéroté, l'**Import en masse** ajoute de nombreux fichiers ChordPro ou PDF d'un coup. Chaque fichier est associé à un chant par le numéro dans son nom (`0245.cho` ou `JEM_0245.pdf` correspond au numéro 245). Vérifiez les correspondances, puis **Confirmer l'import**. Deux fichiers avec le même numéro sont tous deux marqués en conflit, chacun nommant l'autre (« Même numéro que … »), et aucun n'est importé. Seuls les fichiers du type choisi sont associés (un PDF à côté d'un fichier ChordPro n'est pas un conflit). Les fichiers système, comme les copies `._0245.cho` de macOS ou `.DS_Store`, sont ignorés et seulement comptés.
