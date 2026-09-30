// The docs' parts for some readers only (issue #160): the page's contents
// list follows the sections hidden for this reader, and a line at the top
// switches between what they can use and everything.
(() => {
  const KEY = "songverse.docs.view";
  const root = document.documentElement;
  const french = root.lang.startsWith("fr");
  const text = french
    ? { mine: "Vous voyez ce que vous pouvez utiliser.", all: "Tout afficher", everything: "Vous voyez tout.", back: "N'afficher que ce que je peux utiliser" }
    : { mine: "Showing what you can use.", all: "Show everything", everything: "Showing everything.", back: "Only what I can use" };

  // A section's headings, in the "On this page" lists: hidden with it.
  for (const block of document.querySelectorAll("main [data-audience]")) {
    for (const heading of block.querySelectorAll("h2[id], h3[id], h4[id]")) {
      for (const link of document.querySelectorAll(`a[href="#${CSS.escape(heading.id)}"]`)) {
        if (!block.contains(link)) (link.closest("li") ?? link).setAttribute("data-audience", block.getAttribute("data-audience"));
      }
    }
  }

  // Only where there's something to hide, or hidden: the switch.
  if (!document.querySelector("[data-audience]")) return;
  const showingAll = "canAll" in root.dataset;
  const line = document.createElement("p");
  line.className = "sv-audience";
  line.append(`${showingAll ? text.everything : text.mine} `);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = showingAll ? text.back : text.all;
  button.addEventListener("click", () => {
    let view = "member";
    try {
      view = localStorage.getItem(KEY) || "member";
      const parts = view.split(/[\s,]+/).filter((part) => part !== "all");
      view = (showingAll ? parts : [...parts, "all"]).join(",") || "member";
      localStorage.setItem(KEY, view);
    } catch {
      // Storage blocked: for this page only.
    }
    if (showingAll) delete root.dataset.canAll;
    else root.dataset.canAll = "";
    location.reload();
  });
  line.append(button);
  document.querySelector("main .sl-markdown-content")?.prepend(line);
})();
