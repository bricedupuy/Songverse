---
title: Administration
description: Relire les chants proposés au catalogue global, et gérer un serveur Songverse.
---

## Relecteurs

Un relecteur (ou un administrateur global) vérifie les chants proposés au catalogue global. La page **Relecture** liste ce qui attend. Pour chaque chant, vous pouvez :

- **Approuver et publier**, avec si vous voulez une mention de confiance affichée sur le chant global (« Texte officiel de l'éditeur »). Le chant lui-même passe au catalogue, au nom de la personne qui l'a proposé ; ses fichiers restent les siens ;
- **Fusionner avec** un chant semblable déjà dans le catalogue : le sien y est intégré - ses versions, fichiers et listes passent à ce chant, sa façon de le chanter devient sa version de celui-ci, et les détails qu'elle avait changés vous arrivent comme une proposition ;
- **Demander des modifications**, ou **Refuser**, avec une note pour la personne qui l'a proposé.

Vous ne pouvez pas relire vos propres propositions. Les administrateurs globaux peuvent aussi **Publier maintenant** leurs propres chants sans relecture.

La page **Relecture** liste aussi les **Modifications proposées** pour les chants du catalogue (voir [Proposer une modification](/fr/library/#proposer-une-modification)). Chacune montre ce qu'elle change, depuis le chant tel qu'il était quand elle a été proposée ; **Accepter** l'enregistre dans le chant au nom de son auteur, **Refuser** demande une note. Si le chant a été modifié depuis au même endroit, elle dit où, et ne peut qu'être refusée.

![Une modification proposée, pour le relecteur](../../../assets/screenshots/fr/suggestion-review.jpg)

## Administrateurs globaux

Les administrateurs globaux gèrent tout le serveur depuis **Administration** dans la barre latérale.

### Utilisateurs

Tous les comptes, avec leur statut, leurs chants et leur stockage. Pour chaque personne, vous pouvez :

- **Modifier la limite de stockage** - laissez vide pour la limite par défaut ;
- **Nommer relecteur**, ou retirer ce rôle ;
- **Bannir** (la personne est déconnectée et ne peut plus se connecter jusqu'à la levée du bannissement ; son contenu reste) ;
- **Supprimer l'utilisateur**, en choisissant ce que devient ce qui lui appartient : le supprimer tout de suite, ou le garder pour un **lien de transfert**. Qui ouvre ce lien en étant connecté, avant qu'il n'expire, en devient propriétaire.

### Authentification

Comment Songverse envoie ses e-mails (vérification, réinitialisation du mot de passe) via Resend, et si la **connexion avec Google** est proposée. Les réglages enregistrés ici prennent effet tout de suite ; **Revenir aux variables d'environnement** retourne à la configuration du serveur.

### Stockage

Où sont gardés les fichiers envoyés (un stockage objet comme Cloudflare R2, ou le disque local pour le développement), l'espace utilisé, et la **limite de stockage par défaut** par utilisateur. Les administrateurs globaux n'ont pas de limite.

### Catalogues

Gère les catalogues de recueils publiés (voir [Recueils](/fr/songbooks/#à-partir-du-catalogue-dun-recueil-publié)) : en ajouter, modifier leurs entrées dans un tableau, les importer ou les exporter en CSV ou JSON.

### Maintenance du serveur

La page **Métadonnées** a deux tâches de maintenance : **Vérifier** compare les migrations de la base de données présentes sur le serveur avec celles appliquées, et **Exécuter le script de départ** réapplique les données intégrées (catégories d'étiquettes, étiquettes, accordages). On peut le relancer sans risque.

**Sources de métadonnées** choisit où la **Détection automatique** d'un chant le cherche (voir [La bibliothèque](/fr/library/)) : MusicBrainz, Apple Music et Deezer, sans clé pour aucune. Cochez celles à utiliser et ordonnez-les avec les flèches : les résultats les plus proches du titre et de l'artiste viennent toujours en premier, puis la première sortie du chant, et cet ordre départage le reste. **Enregistrer la configuration** le garde ; **Revenir aux variables d'environnement** revient à la variable `METADATA_PROVIDERS` (celles à utiliser, dans l'ordre, comme `musicbrainz,deezer`), ou aux trois dans cet ordre sans elle.

**API Apple Music (clé MusicKit)** est facultatif. Sans clé, Apple Music est interrogé via iTunes Search, qui n'en demande pas. Avec une clé, via l'API Apple Music : les mêmes chants, avec leur ISRC et leurs auteurs. Créez une clé MusicKit dans votre compte Apple Developer (Certificates, Identifiers & Profiles > Keys), puis saisissez son **Team ID**, son **Key ID** et sa **Clé privée (.p8)** - tout le fichier, lignes BEGIN et END comprises. La clé privée est gardée chiffrée et n'est plus jamais affichée : laissez-la vide pour garder l'actuelle. **Tester la connexion** fait une recherche avec. **Revenir aux variables d'environnement** revient à `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID` et `APPLE_MUSIC_PRIVATE_KEY`, ou à iTunes Search sans elles.

**Illustrations des chants** active ou non les illustrations venues d'Apple Music (**Trouver les illustrations des chants**) et règle la **Boutique Apple Music (pays)** interrogée - deux lettres, comme us ou fr. **Enregistrer la configuration** les garde ; **Revenir aux réglages par défaut** revient à activé, boutique us. **Trouver les illustrations des chants qui n'en ont pas** en cherche jusqu'à 50 à la fois, les plus récents d'abord ; un chant sans résultat n'est pas réessayé. Voir [Illustration](/fr/library/#illustration).
