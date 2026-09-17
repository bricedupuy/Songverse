import type en from "./en.js";

// Keep this in sync with en.ts's key shape - TypeScript will flag a
// mismatch since it's typed against `typeof en`.
const fr: typeof en = {
  nav: {
    platform: "Plateforme",
    library: "Bibliothèque",
    dashboard: "Tableau de bord",
    admin: "Administration",
    signOut: "Se déconnecter",
  },
  dashboard: {
    welcomeBack: "Bon retour, {{name}}",
    songs: "Chansons",
    artists: "Artistes",
    teams: "Équipes",
    recentlyUpdated: "Récemment mis à jour",
    viewAll: "Tout afficher",
    noSongsYet: "Aucune chanson pour l'instant. Ajoutez la première pour commencer.",
    addASong: "+ Ajouter une chanson",
    noTeamsYet: "Vous ne faites partie d'aucune équipe pour l'instant.",
    language: "Langue",
    languageDescription: "Choisissez la langue d'affichage de l'interface de SongVerse.",
  },
  library: {
    title: "Bibliothèque",
    addASong: "+ Ajouter une chanson",
    noSongsYet: "Aucune chanson pour l'instant. Ajoutez la première pour commencer.",
    filterPlaceholder: "Filtrer par titre, artiste, langue, statut…",
    columnTitle: "Titre",
    columnArtist: "Artiste",
    columnLanguage: "Langue",
    columnStatus: "Statut",
    columnTags: "Étiquettes",
    columnUpdated: "Mis à jour",
  },
  breadcrumb: {
    addASong: "Ajouter une chanson",
    song: "Chanson",
  },
  admin: {
    title: "Administration",
    description: "Outils opérationnels pour les administrateurs globaux.",
    serverAndApi: "Serveur et API",
    serverAndApiDescription:
      "Tâches de maintenance de la base de données qui nécessitaient auparavant un terminal dans le conteneur de l'API.",
    migrationStatus: "État des migrations",
    migrationStatusDescription: "Compare les migrations présentes sur le disque à celles appliquées à la base de données.",
    checkStatus: "Vérifier",
    checking: "Vérification…",
    runSeed: "Exécuter le script de départ",
    runSeedDescription:
      "Réapplique les données de départ (catégories d'étiquettes, étiquettes, préréglages d'accordage). Sans risque à réexécuter.",
    running: "Exécution…",
    confirm: "Confirmer",
    cancel: "Annuler",
  },
};

export default fr;
