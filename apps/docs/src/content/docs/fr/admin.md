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

Les administrateurs globaux gèrent tout le serveur depuis **Tableau de bord**, dans la section **Administration** de la barre latérale (les relecteurs y trouvent **Relecture**).

### Utilisateurs

Tous les comptes, avec leur statut, leurs chants et leur stockage. Pour chaque personne, vous pouvez :

- **Modifier la limite de stockage** - laissez vide pour la limite par défaut ;
- **Nommer relecteur**, ou retirer ce rôle ;
- **Bannir** (la personne est déconnectée et ne peut plus se connecter jusqu'à la levée du bannissement ; son contenu reste) ;
- **Supprimer l'utilisateur**, en choisissant ce que devient ce qui lui appartient : le supprimer tout de suite, ou le garder pour un **lien de transfert**. Qui ouvre ce lien en étant connecté, avant qu'il n'expire, en devient propriétaire.

### Authentification

Comment Songverse envoie ses e-mails (vérification, réinitialisation du mot de passe) via Resend, et si la **connexion avec Google** est proposée. Les réglages enregistrés ici prennent effet tout de suite ; **Revenir aux variables d'environnement** retourne à la configuration du serveur.

### Sécurité

Comment l'API se protège. **Limiter les requêtes** plafonne le nombre de requêtes qu'elle accepte par minute : par utilisateur connecté, par adresse avant connexion, et un nombre plus serré pour les requêtes coûteuses (envois de fichiers, recherches de pochettes et d'artistes, adhésion par lien). Au-delà, la requête est refusée jusqu'à la fin de la minute et l'application affiche « Trop de requêtes, réessayez dans un instant ». **Proxys devant l'API** indique combien de proxys (un répartiteur de charge, Traefik…) la précèdent, pour qu'elle compte chaque visiteur par sa propre adresse plutôt que celle du proxy. **Documentation de l'API** décide qui peut lire `/api/docs` : tout le monde, ou seulement les administrateurs globaux. **Content-Security-Policy** indique aux navigateurs quels scripts, connexions et cadres les pages de Songverse peuvent utiliser, pour qu'un script glissé dans une page ne s'exécute pas : **Appliquée** (par défaut), **Seulement signalée** - rien n'est refusé, et ce qui l'aurait été va dans le journal du serveur web, pour essayer un changement d'abord - ou **Désactivée**. Chaque réglage indique d'où il vient - enregistré ici, une variable d'environnement ou la valeur par défaut - et **Revenir aux variables d'environnement** retourne à la configuration du serveur.

### Stockage

Où sont gardés les fichiers envoyés (un stockage objet comme Cloudflare R2, ou le disque local pour le développement), l'espace utilisé, et la **limite de stockage par défaut** par utilisateur. Les administrateurs globaux n'ont pas de limite.

### Catalogues

Gère les catalogues de recueils publiés (voir [Recueils](/fr/songbooks/#à-partir-du-catalogue-dun-recueil-publié)) : en ajouter, modifier leurs entrées dans un tableau, les importer ou les exporter en CSV ou JSON.

### Maintenance du serveur

La page **Métadonnées** a deux tâches de maintenance : **Vérifier** compare les migrations de la base de données présentes sur le serveur avec celles appliquées, et **Exécuter le script de départ** réapplique les données intégrées (catégories d'étiquettes, étiquettes, accordages). On peut le relancer sans risque.

**Tâches de fond** montre si le Worker - le processus serveur qui fait le travail lent en arrière-plan (trouver illustrations et artistes, les imports de recueils, les prises enregistrées, le nettoyage horaire des transferts expirés) - tourne, combien de tâches attendent dans chaque file ou ont échoué, et le résultat des dernières, actualisés toutes les quelques secondes. Les recherches en lot de l'administrateur ont leur propre file : les recherches d'un nouveau chant n'attendent jamais derrière. Il signale aussi un Worker sans `SETTINGS_ENCRYPTION_KEY`, ou pas celle de l'API : il ne peut alors pas utiliser les secrets enregistrés ici (clés des sources, stockage). Il indique quel ffmpeg a le Worker, qui convertit les prises enregistrées en Opus (voir [Enregistrer une piste](/fr/library/#enregistrer-une-piste)) ; sans lui, les prises restent telles qu'enregistrées (WAV), environ huit fois plus lourdes. **Tâches en échec** liste les tâches qui ont échoué, avec la raison ; **Effacer les tâches en échec** vide cette liste, dans toutes les files. **Aucun Worker ne tourne** signifie que les tâches attendent : voir Deploy.md dans le dépôt pour en installer un, ou laisser l'API les exécuter elle-même (`JOBS_IN_API`).

**Sources de métadonnées** liste où chercher les chants et les artistes - MusicBrainz, Apple Music, Deezer et Spotify - dans l'ordre où elles sont interrogées. Déplacez-en une avec les flèches, et cochez ce que chacune fournit, parmi ce qu'elle sait faire : **Infos du chant** (la **Détection automatique** d'un chant, voir [La bibliothèque](/fr/library/)), **Illustrations d'album** (l'image d'un chant), **Photos d'artistes** et **Biographies d'artistes** (celles de MusicBrainz viennent de Wikipédia, via Wikidata). **(demande une clé)** à côté signifie qu'elle est cochée mais ne peut être interrogée tant que ses réglages n'ont pas de clé. Les résultats de la détection automatique les plus proches du titre et de l'artiste viennent en premier, puis la première sortie du chant, et cet ordre départage le reste ; l'illustration d'un nouveau chant et la photo d'un artiste viennent de la première source ici, parmi celles cochées, qui en a une. **Enregistrer la configuration** garde la liste ; **Revenir aux variables d'environnement** revient à `METADATA_PROVIDERS` (celles listées, dans l'ordre, pour tout ce qu'elles savent faire, comme `musicbrainz,deezer`), ou aux quatre dans cet ordre sans elle.

Les **Réglages** de chaque source s'ouvrent en dessous :
- **MusicBrainz** : le **Contact** envoyé à MusicBrainz avec chaque requête, comme il le demande - une adresse web ou e-mail (sinon `MUSICBRAINZ_CONTACT`).

- **Apple Music** : la **Boutique Apple Music (pays)** interrogée - deux lettres, comme us ou fr - et, en option, la clé MusicKit de l'API Apple Music. Sans clé, Apple Music est interrogé via iTunes Search, qui n'en demande pas. Avec une clé, via l'API Apple Music : les mêmes chants, avec leur ISRC, leurs auteurs et les photos d'artistes. Créez une clé MusicKit dans votre compte Apple Developer (Certificates, Identifiers & Profiles > Keys), puis saisissez son **Team ID**, son **Key ID** et sa **Clé privée (.p8)** - tout le fichier, lignes BEGIN et END comprises. La clé privée est gardée chiffrée et n'est plus jamais affichée : laissez-la vide pour garder l'actuelle. En attendant une clé, **Adresse de jetons développeur (sans clé)** peut recevoir une adresse qui répond par un jeton développeur (`{"token": "eyJ…"}`, ou `APPLE_MUSIC_TOKEN_URL`) ; chaque jeton est gardé jusqu'à son expiration. Ses jetons sont signés par qui gère cette adresse, pas par votre compte Apple : ils peuvent cesser de fonctionner à tout moment - une clé, une fois enregistrée, est utilisée à la place. **Tester la connexion** fait une recherche avec la clé ou le jeton. **Revenir aux variables d'environnement** efface les deux et revient à `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID` et `APPLE_MUSIC_PRIVATE_KEY` (ou `APPLE_MUSIC_TOKEN_URL`), ou à iTunes Search sans elles.
- **Deezer** ne demande pas de clé.
- **Spotify** demande une application : créez-en une sur Spotify for Developers (developer.spotify.com > Dashboard > Create app, avec la Web API) et saisissez son **Client ID** et son **Client secret** - gardé chiffré et plus jamais affiché ; laissez-le vide pour garder l'actuel - et le **Marché (pays)** interrogé (sinon `SPOTIFY_MARKET`, sinon le pays Apple Music). Personne ne se connecte à Spotify : Songverse interroge en tant qu'application. Ses résultats apportent le lien Spotify du chant et son ISRC. **Tester la connexion** fait une recherche ; **Revenir aux variables d'environnement** revient à `SPOTIFY_CLIENT_ID` et `SPOTIFY_CLIENT_SECRET`, ou à ne pas interroger Spotify sans elles.

**Illustrations des chants** active ou non l'illustration des chants (**Trouver les illustrations des chants**) : trouvée toute seule pour un nouveau chant, depuis les sources cochées pour **Illustrations d'album**. **Enregistrer la configuration** le garde ; **Revenir aux réglages par défaut** revient à activé. **Trouver les illustrations des chants qui n'en ont pas** en cherche jusqu'à 50 à la fois, les plus récents d'abord, en arrière-plan : son résultat apparaît dans **Tâches de fond**. Un chant sans résultat n'est pas réessayé ; un chant dont la recherche a échoué (une source en panne ou qui refuse) l'est, la fois suivante. Voir [Illustration](/fr/library/#illustration).

**Photos et biographies des artistes** les active ou non (**Chercher les photos et biographies des artistes**) : une photo depuis les sources cochées pour **Photos d'artistes**, et une courte biographie de Wikipédia, trouvée via MusicBrainz et Wikidata, en anglais et en français. **Enregistrer la configuration** le garde ; **Revenir aux variables d'environnement** revient à `ARTIST_LOOKUPS` (`off` les désactive), ou activé sans elle. **Chercher les artistes pas encore cherchés** en cherche jusqu'à 25 à la fois, les plus récemment crédités d'abord, en arrière-plan : son résultat apparaît dans **Tâches de fond**. Un artiste dont la recherche a échoué est réessayé la fois suivante. Voir [Artistes](/fr/library/#artistes).
