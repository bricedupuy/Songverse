// English is the source-of-truth key set - every other locale file should
// have exactly these keys. Only the pilot surfaces (sidebar, dashboard,
// library) are covered so far; other pages fall back to their hardcoded
// English strings until translated.
const en = {
  nav: {
    platform: "Platform",
    library: "Library",
    dashboard: "Dashboard",
    admin: "Admin",
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
  admin: {
    title: "Admin",
    description: "Operational tools for global admins.",
    serverAndApi: "Server & API",
    serverAndApiDescription: "Database maintenance tasks that used to require a terminal in the API container.",
    migrationStatus: "Migration status",
    migrationStatusDescription: "Compares migrations on disk against what's applied to the database.",
    checkStatus: "Check status",
    checking: "Checking…",
    runSeed: "Run seed script",
    runSeedDescription: "Re-applies the seed data (tag categories, tags, tuning presets). Safe to re-run.",
    running: "Running…",
    confirm: "Confirm",
    cancel: "Cancel",
  },
};

export default en;
