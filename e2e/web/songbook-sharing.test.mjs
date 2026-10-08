// Songbook sharing (issue #211): a songbook shared with one of your people
// or one of your teams, to view - it, its numbers and the songs in it,
// while they're in it - or to edit its entries and details too (not delete,
// share or bulk-upload into it). A team's share is its members'. Only who
// owns it shares it; someone it's shared with can leave it.
import { chromium } from "playwright";
import { WEB, api, call, check, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const owner = await user("Songbook owner");
const friend = await user("Songbook friend");
const bandmate = await user("Songbook bandmate");
const stranger = await user("Songbook stranger");

// The owner and the friend are each other's people.
await api(owner, "POST", "/people/requests", { email: friend.email });
const request = (await api(friend, "GET", "/people")).incoming.find((i) => i.from.id === owner.id);
await api(friend, "POST", `/people/requests/${request.id}/accept`);
// A band the owner runs, the bandmate in it.
const team = await api(owner, "POST", "/teams", { name: `Shared book band ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('sbm${stamp}', '${team.id}', '${bandmate.id}', 'MEMBER', now())`);

const song = (who, title) => api(who, "POST", "/song-versions", { title: `${title} ${stamp}`, language: "en", artists: ["Band"], content: "[G]Hello\n", contentFormat: "CHORDPRO" });
const [first, second] = [await song(owner, "Book one"), await song(owner, "Book two")];
const friends = await song(friend, "Friend's own");
const secret = await song(stranger, "Stranger's secret");
const book = await api(owner, "POST", "/songbooks", { name: `Shared book ${stamp}`, abbreviation: `SB${stamp % 1000}`, kind: "NUMBERED" });
const entryOne = await api(owner, "POST", `/songbooks/${book.id}/entries`, { songVersionId: first.id, entryCode: "1" });
const entryTwo = await api(owner, "POST", `/songbooks/${book.id}/entries`, { songVersionId: second.id, entryCode: "2" });

const status = async (who, method, path, body) => (await call(who, method, path, body)).status;
check("not shared: a stranger sees neither the songbook nor its songs", (await status(friend, "GET", `/songbooks/${book.id}`)) === 403 && (await status(friend, "GET", `/song-versions/${first.id}`)) === 403);
check("only with one of your people", (await status(owner, "PUT", `/songbooks/${book.id}/shares/users/${stranger.id}`, { canEdit: false })) === 403);
check("only by who owns it", (await status(friend, "PUT", `/songbooks/${book.id}/shares/users/${friend.id}`, { canEdit: true })) === 403);

// Shared with the friend, to view.
let shares = await api(owner, "PUT", `/songbooks/${book.id}/shares/users/${friend.id}`, { canEdit: false });
check("shared with the friend, to view", shares.length === 1 && shares[0].user.id === friend.id && shares[0].canEdit === false, JSON.stringify(shares));
let listed = (await api(friend, "GET", "/songbooks")).find((one) => one.id === book.id);
check("in their songbooks, to view", listed?.access === "view", JSON.stringify(listed));
check("its songs readable through it", (await status(friend, "GET", `/song-versions/${first.id}`)) === 200);
check("found by number", (await api(friend, "GET", `/songbook-entries?q=${encodeURIComponent(`${book.abbreviation} 1`)}`)).some((hit) => hit.songVersionId === first.id));
check("their songs to put in their own sets", (await call(friend, "POST", `/setlists/${(await api(friend, "POST", "/setlists", { name: `Friend set ${stamp}` })).id}/items`, { songVersionId: first.id })).status === 201);
check("but not changed", (await status(friend, "PATCH", `/songbooks/${book.id}`, { name: "Mine now" })) === 403 && (await status(friend, "POST", `/songbooks/${book.id}/entries`, { songVersionId: friends.id, entryCode: "3" })) === 403);
check("nor its shares seen", (await status(friend, "GET", `/songbooks/${book.id}/shares`)) === 403);

// Shared with the band: its members see it, its sets take its songs.
await api(owner, "PUT", `/songbooks/${book.id}/shares/teams/${team.id}`, { canEdit: false });
check("a team member sees it through the band", (await api(bandmate, "GET", "/songbooks")).some((one) => one.id === book.id && one.access === "view"));
check("and its songs", (await status(bandmate, "GET", `/song-versions/${second.id}`)) === 200);
const teamSet = await api(owner, "POST", "/setlists", { name: `Band set ${stamp}`, teamId: team.id });
check("a band set takes the shared songbook's songs", (await call(owner, "POST", `/setlists/${teamSet.id}/items`, { songVersionId: second.id })).status === 201);

// To edit: entries and details, with songs the friend can see - not deleting, sharing or bulk-uploading.
await api(owner, "PUT", `/songbooks/${book.id}/shares/users/${friend.id}`, { canEdit: true });
check("shared to edit", (await api(friend, "GET", `/songbooks/${book.id}`)).access === "edit");
check("its details changed", (await status(friend, "PATCH", `/songbooks/${book.id}`, { publisher: "The band" })) === 200);
check("their own song added", (await status(friend, "POST", `/songbooks/${book.id}/entries`, { songVersionId: friends.id, entryCode: "3" })) === 201);
check("never a song they can't see", (await status(friend, "POST", `/songbooks/${book.id}/entries`, { songVersionId: secret.id, entryCode: "4" })) === 403);
check("their song now open to the band", (await status(bandmate, "GET", `/song-versions/${friends.id}`)) === 200);
check("not deleted by them", (await status(friend, "DELETE", `/songbooks/${book.id}`)) === 403);
check("nor bulk-uploaded into", (await status(friend, "POST", `/songbooks/${book.id}/bulk-upload/preview`, { filenames: ["1.cho"], type: "CHORDPRO" })) === 403);
check("nor shared on", (await status(friend, "PUT", `/songbooks/${book.id}/shares/teams/${team.id}`, { canEdit: true })) === 403);

// A song taken out of the songbook: no longer readable through it.
await call(owner, "DELETE", `/songbooks/${book.id}/entries/${entryTwo.id}`);
check("a song taken out isn't readable through it any more", (await status(friend, "GET", `/song-versions/${second.id}`)) === 403);
void entryOne;

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await step("the owner: Share, with the people and teams, to view or edit", async () => {
    await signIn(page, owner);
    await page.goto(`${WEB}/songbooks/${book.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("songbook-share").click();
    const shares = page.getByTestId("songbook-shares");
    await shares.locator(`[data-share="user:${friend.id}"]`).waitFor();
    await shares.locator(`[data-share="team:${team.id}"]`).waitFor();
    // Stops sharing with the band, from the dialog.
    await shares.locator(`[data-share="team:${team.id}"]`).getByRole("button").click();
    await shares.locator(`[data-share="team:${team.id}"]`).waitFor({ state: "detached" });
    if ((await api(bandmate, "GET", "/songbooks")).some((one) => one.id === book.id)) throw new Error("the band still sees it");
    // And back, to edit.
    await page.getByTestId("songbook-share-with").selectOption(`team:${team.id}`);
    await page.getByTestId("songbook-share-rights").selectOption("edit");
    await page.getByTestId("songbook-share-add").click();
    await shares.locator(`[data-share="team:${team.id}"]`).waitFor();
    if ((await api(bandmate, "GET", `/songbooks/${book.id}`)).access !== "edit") throw new Error("not to edit");
  });

  await step("someone it's shared with: marked, no Share or Delete, the sidebar says so", async () => {
    await page.context().clearCookies();
    await signIn(page, friend);
    await page.goto(`${WEB}/songbooks/${book.id}`);
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="songbook-shared-with-me"][data-access="edit"]').waitFor();
    if (await page.getByTestId("songbook-share").count()) throw new Error("they can share it");
    await page.getByText("Shared with you", { exact: false }).first().waitFor();
  });
} finally {
  await browser.close();
}

// Leaving it: gone from their songbooks, its songs with it.
check("someone it's shared with leaves it", (await status(friend, "DELETE", `/songbooks/${book.id}/shares/users/me`)) === 200);
check("gone from their songbooks", !(await api(friend, "GET", "/songbooks")).some((one) => one.id === book.id));
check("its songs too", (await status(friend, "GET", `/song-versions/${first.id}`)) === 403);
finish();
