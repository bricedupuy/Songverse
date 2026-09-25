---
title: Administration
description: Relire les chants proposés au catalogue global, et gérer un serveur SongVerse.
---

## Relecteurs

Un relecteur (ou un administrateur global) vérifie les chants proposés au catalogue global. La page **Relecture** liste ce qui attend. Pour chaque chant, vous pouvez :

- **Approuver et publier**, avec si vous voulez une mention de confiance affichée sur le chant global (« Texte officiel de l'éditeur »). Le chant lui-même passe au catalogue, au nom de la personne qui l'a proposé ; ses fichiers restent les siens ;
- **Fusionner avec** un chant semblable déjà dans le catalogue : le sien reste alors à elle, comme sa propre version de celui-ci ;
- **Demander des modifications**, ou **Refuser**, avec une note pour la personne qui l'a proposé.

Vous ne pouvez pas relire vos propres propositions. Les administrateurs globaux peuvent aussi **Publier maintenant** leurs propres chants sans relecture.

## Administrateurs globaux

Les administrateurs globaux gèrent tout le serveur depuis **Administration** dans la barre latérale.

### Utilisateurs

Tous les comptes, avec leur statut, leurs chants et leur stockage. Pour chaque personne, vous pouvez :

- **Modifier la limite de stockage** - laissez vide pour la limite par défaut ;
- **Nommer relecteur**, ou retirer ce rôle ;
- **Bannir** (la personne est déconnectée et ne peut plus se connecter jusqu'à la levée du bannissement ; son contenu reste) ;
- **Supprimer l'utilisateur**, en choisissant ce que devient ce qui lui appartient : le supprimer tout de suite, ou le garder pour un **lien de transfert**. Qui ouvre ce lien en étant connecté, avant qu'il n'expire, en devient propriétaire.

### Authentification

Comment SongVerse envoie ses e-mails (vérification, réinitialisation du mot de passe) via Resend, et si la **connexion avec Google** est proposée. Les réglages enregistrés ici prennent effet tout de suite ; **Revenir aux variables d'environnement** retourne à la configuration du serveur.

### Stockage

Où sont gardés les fichiers envoyés (un stockage objet comme Cloudflare R2, ou le disque local pour le développement), l'espace utilisé, et la **limite de stockage par défaut** par utilisateur. Les administrateurs globaux n'ont pas de limite.

### Catalogues

Gère les catalogues de recueils publiés (voir [Recueils](/fr/songbooks/#à-partir-du-catalogue-dun-recueil-publié)) : en ajouter, modifier leurs entrées dans un tableau, les importer ou les exporter en CSV ou JSON.

### Maintenance du serveur

La page **Métadonnées** a deux tâches de maintenance : **Vérifier** compare les migrations de la base de données présentes sur le serveur avec celles appliquées, et **Exécuter le script de départ** réapplique les données intégrées (catégories d'étiquettes, étiquettes, accordages). On peut le relancer sans risque.
