// Sync play (issue #13), at the API's WebSocket (/sync): signing in, the
// clock's pings, joining a set only its viewers can, leading only for who
// can edit it, the leader's updates reaching the followers (and nobody
// else's), a leader dropping off (the session stays) and taking back the
// lead, and the end of the session.
import { API, api, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const owner = await user("Leader");
const member = await user("Follower");
const stranger = await user("Stranger");
const team = await api(owner, "POST", "/teams", { name: `Sync band ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tms${stamp}', '${team.id}', '${member.id}', 'MEMBER', now())`);
const set = await api(owner, "POST", "/setlists", { name: `Sync set ${stamp}`, teamId: team.id });

/** A device: its messages as they come, and a wait for the next one that matches. */
async function device(who) {
  const ws = new WebSocket(`${API.replace(/^http/, "ws")}/sync`);
  // Messages no wait has claimed yet: a wait takes the first that matches, already here or to come.
  const messages = [];
  const waiting = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const w = waiting.find((one) => one.match(message));
    if (w) {
      waiting.splice(waiting.indexOf(w), 1);
      w.resolve(message);
    } else messages.push(message);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const next = (match, ms = 3000) =>
    new Promise((resolve) => {
      const early = messages.findIndex(match);
      if (early >= 0) return resolve(messages.splice(early, 1)[0]);
      const w = { match, resolve };
      waiting.push(w);
      setTimeout(() => {
        if (waiting.includes(w)) {
          waiting.splice(waiting.indexOf(w), 1);
          resolve(null);
        }
      }, ms);
    });
  const send = (message) => ws.send(JSON.stringify(message));
  if (who) {
    const ready = next((m) => m.type === "ready");
    send({ type: "hello", token: who.bearer });
    await ready;
  }
  return { ws, messages, next, send, close: () => ws.close() };
}
const session = (m) => m.type === "session";
const error = (m) => m.type === "error";

// --- signing in, and the clock
let anon = await device(null);
anon.send({ type: "join", setId: set.id });
check("not signed in: nothing but the clock", (await anon.next(error))?.code === "unauthorized");
const before = Date.now();
anon.send({ type: "ping", id: 7, sent: 123 });
const pong = await anon.next((m) => m.type === "pong");
check("a ping's answer: the server's time, and what was sent", pong?.id === 7 && pong.sent === 123 && pong.at >= before - 5 && pong.at <= Date.now() + 5, JSON.stringify(pong));
anon.send({ type: "hello", token: "not-a-token" });
check("a bad token: refused", (await anon.next(error))?.code === "unauthorized");
anon.close();

// --- joining
const outsider = await device(stranger);
outsider.send({ type: "join", setId: set.id });
check("someone who can't open the set can't join it", (await outsider.next(error))?.code === "not-found");
outsider.close();

const follower = await device(member);
follower.send({ type: "join", setId: set.id });
let seen = await follower.next(session);
check("a member joins: no session yet, and they can't lead", seen?.session === null && seen.canLead === false && seen.leading === false && seen.members.some((m) => m.id === member.id), JSON.stringify(seen));
follower.send({ type: "lead" });
check("nor lead", (await follower.next(error))?.code === "forbidden");

let leader = await device(owner);
leader.send({ type: "join", setId: set.id });
seen = await leader.next(session);
check("the set's owner can lead", seen?.canLead === true && seen.session === null);
check("the others hear who joined", (await follower.next((m) => session(m) && m.members.length === 2)) !== null);

// --- leading
leader.send({ type: "lead" });
seen = await follower.next((m) => session(m) && m.session);
check("a session, led by the owner", seen?.session.leader.id === owner.id && seen.session.leader.online && seen.leading === false, JSON.stringify(seen?.session));
check("the leader knows it", (await leader.next((m) => session(m) && m.leading)) !== null);

const metronome = { settings: { tempo: 90, numerator: 3, denominator: 4, beats: ["accent", "normal", "normal"], subdivision: 1, countIn: 0, countInOnly: false }, playing: true, anchorAt: Date.now() + 500, anchorPosition: 0 };
leader.send({ type: "update", metronome, itemId: "item-1" });
seen = await follower.next((m) => session(m) && m.session?.metronome);
check("the leader's metronome and song reach the followers", seen?.session.metronome.settings.tempo === 90 && seen.session.metronome.anchorAt === metronome.anchorAt && seen.session.itemId === "item-1", JSON.stringify(seen?.session));
follower.send({ type: "update", itemId: "item-2" });
check("a follower can't change it", (await follower.next(error))?.code === "forbidden");
leader.send({ type: "update", metronome: { ...metronome, anchorAt: "soon" } });
check("nor can the leader send nonsense", (await leader.next(error))?.code === "bad-request");

// --- the leader drops off: the session stays; they take the lead back
leader.close();
seen = await follower.next((m) => session(m) && m.session && !m.session.leader.online);
check("the leader gone: the session stays, their metronome with it", seen?.session.metronome?.playing === true && seen.session.leader.id === owner.id, JSON.stringify(seen?.session));
leader = await device(owner);
leader.send({ type: "join", setId: set.id });
await leader.next(session);
leader.send({ type: "lead" });
seen = await follower.next((m) => session(m) && m.session?.leader.online);
check("back, and leading again: where it was", seen?.session.metronome?.anchorAt === metronome.anchorAt && seen.session.itemId === "item-1");

// --- the end
leader.send({ type: "end" });
seen = await follower.next((m) => session(m) && m.session === null);
check("ended: no session for anyone", seen !== null);
leader.close();
follower.close();

finish();
