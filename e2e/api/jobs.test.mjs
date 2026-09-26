// Background jobs (issue #92): the Worker runs them - the API only adds
// them - and says so with a heartbeat; Admin sees who runs them, each
// queue's counts and the last jobs, the backfills' results among them.
import { api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";
import { startFakeProviders } from "../lib/fake-providers.mjs";

const fake = await startFakeProviders();
const admin = await user("Admin");
const someone = await user("Someone");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
await api(admin, "DELETE", "/admin/artwork");

let status = await api(admin, "GET", "/admin/jobs");
check("the Worker is running: its heartbeat under a minute old", !!status.worker && Date.now() - Date.parse(status.worker.at) < 60000, JSON.stringify(status.worker));
check("this API doesn't run jobs itself (JOBS_IN_API=false, as in production)", status.thisApiRunsJobs === false && status.api === null, JSON.stringify(status));
check("the queues", status.queues.map((q) => q.name).join() === "lookups,bulk-upload,user-maintenance", JSON.stringify(status.queues));
check("admins only", (await call(someone, "GET", "/admin/jobs")).status === 403);

// A new song's artwork: a job, run by the Worker.
const song = await api(someone, "POST", "/song-versions", { title: `Queued ${stamp}`, language: "en", artists: ["Queue"] });
let imageUrl = null;
for (let i = 0; i < 60 && !imageUrl; i++) {
  imageUrl = (await api(someone, "GET", `/song-versions/${song.id}`)).imageUrl;
  if (!imageUrl) await new Promise((resolve) => setTimeout(resolve, 250));
}
check("a new song's artwork, found by the Worker", !!imageUrl);

// A backfill: started, then its result among the recent jobs.
const r = await call(admin, "POST", "/admin/artwork/backfill");
check("a backfill starts", r.status === 201 && r.body.queued === true, JSON.stringify(r.body));
let done = null;
for (let i = 0; i < 180 && !done; i++) {
  status = await api(admin, "GET", "/admin/jobs");
  done = status.recent.find((job) => job.name === "artwork-backfill" && Date.parse(job.finishedAt) > Date.now() - 180000);
  if (!done) await new Promise((resolve) => setTimeout(resolve, 500));
}
check("its result among the recent jobs", done?.state === "completed" && typeof done.result?.tried === "number" && typeof done.result?.found === "number", JSON.stringify(done));
check("the artwork job there too", status.recent.some((job) => job.name === "artwork" && job.queue === "lookups"));

fake.close();
finish();
