// What the reader can use (issue #160), before the page is drawn: the web
// app's Help link says ("?view=admin,reviewer,stems", or "member"), and it's
// kept on the device for the next visit. Without it, a member's view. Flags
// on <html> let theme.css hide the parts for others, so nothing flashes.
(() => {
  const KEY = "songverse.docs.view";
  let view = null;
  try {
    const params = new URLSearchParams(location.search);
    const given = params.get("view");
    if (given !== null) {
      localStorage.setItem(KEY, given);
      params.delete("view");
      const query = params.toString();
      history.replaceState(null, "", location.pathname + (query ? `?${query}` : "") + location.hash);
    }
    view = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: a member's view.
  }
  const root = document.documentElement;
  for (const can of (view || "member").split(/[\s,]+/)) {
    if (["admin", "reviewer", "stems", "all"].includes(can)) root.dataset[`can${can[0].toUpperCase()}${can.slice(1)}`] = "";
  }
})();
