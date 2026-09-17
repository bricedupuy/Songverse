// English is the source-of-truth key set - every other locale file should
// have exactly these keys. Only the pilot surfaces (sidebar, dashboard,
// library) are covered so far; other pages fall back to their hardcoded
// English strings until translated.
const en = {
  nav: {
    platform: "Platform",
    library: "Library",
    dashboard: "Dashboard",
    signOut: "Sign out",
  },
  dashboard: {
    welcomeBack: "Welcome back, {{name}}",
    songs: "Songs",
    artists: "Artists",
    teams: "Teams",
    recentlyUpdated: "Recently updated",
    viewAll: "View all",
    noSongsYet: "No songs yet. Add your first one to get started.",
    addASong: "+ Add a song",
    noTeamsYet: "You're not part of any teams yet.",
    language: "Language",
    languageDescription: "Choose the language SongVerse's interface is shown in.",
  },
  library: {
    title: "Library",
    addASong: "+ Add a song",
    noSongsYet: "No songs yet. Add your first one to get started.",
    filterPlaceholder: "Filter by title, artist, language, status…",
    columnTitle: "Title",
    columnArtist: "Artist",
    columnLanguage: "Language",
    columnStatus: "Status",
    columnTags: "Tags",
    columnUpdated: "Updated",
  },
  breadcrumb: {
    addASong: "Add a song",
    song: "Song",
  },
};

export default en;
