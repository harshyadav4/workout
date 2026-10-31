// Run with: npm run check
//
// Two phones and one account, through the real load, merge and push code. Only
// the server is a stand-in: `fetch` answers the way PostgREST does. The two
// promises under test are "a deleted injury stays deleted on every phone" and
// "the app keeps working before migration 0016 has run".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { RemoteState, SyncableState } from "@/lib/sync";
import type { Injury, InjuryDeletion, PainLog, ScheduledSession } from "@/lib/types";

type Row = Record<string, unknown>;

const USER = "00000000-0000-0000-0000-000000000001";
const INJURY_TABLES = ["injuries", "pain_logs", "injury_deletions"];
const tables = new Map<string, Row[]>();
const missing = new Set<string>();
const refused = new Set<string>();
const requests: string[] = [];

const rowsOf = (table: string) => tables.get(table) ?? [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeServer(input: unknown, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const table = url.pathname.split("/").pop() ?? "";
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  requests.push(`${method} ${table}`);

  if (missing.has(table)) {
    return Promise.resolve(json({ code: "PGRST205", message: "Could not find the table" }, 404));
  }
  if (refused.has(table) && method !== "GET") {
    return Promise.resolve(json({ code: "42501", message: "permission denied" }, 403));
  }
  if (method === "GET" || method === "HEAD") {
    return Promise.resolve(json(rowsOf(table)));
  }
  if (method === "POST") {
    const key = url.searchParams.get("on_conflict")?.split(",") ?? ["user_id", "id"];
    const body = JSON.parse(String(init?.body)) as Row | Row[];
    const next = [...rowsOf(table)];
    for (const row of Array.isArray(body) ? body : [body]) {
      const at = next.findIndex((old) => key.every((column) => old[column] === row[column]));
      // The real table's second unique key: a write on the wrong key fails on it.
      const clash =
        table === "pain_logs" &&
        next.some(
          (old, index) =>
            index !== at && old.user_id === row.user_id && old.injury_id === row.injury_id && old.date === row.date
        );
      if (clash) {
        return Promise.resolve(json({ code: "23505", message: "duplicate key" }, 409));
      }
      if (at >= 0) {
        next[at] = row;
      } else {
        next.push(row);
      }
    }
    tables.set(table, next);
    return Promise.resolve(new Response(null, { status: 201 }));
  }
  if (method === "DELETE") {
    const ids = url.searchParams.get("id");
    const user = url.searchParams.get("user_id");
    if (ids) {
      const wanted = ids.replace(/^in\.\(|\)$/g, "").split(",").map((id) => id.replace(/"/g, ""));
      tables.set(table, rowsOf(table).filter((row) => !wanted.includes(String(row.id))));
    } else if (user) {
      tables.set(table, rowsOf(table).filter((row) => `eq.${String(row.user_id)}` !== user));
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.resolve(json({ message: `unexpected ${method}` }, 500));
}

const hip: Injury = { id: "hip", place: "hip", side: "left", startDate: "2026-10-01", worseWith: "Deep squats" };
const knee: Injury = { id: "knee", place: "knee", side: "both", startDate: "2026-10-02" };
const neck: Injury = {
  id: "neck",
  place: "neck",
  startDate: "2026-10-03",
  stopSign: true,
  healedDate: "2026-10-20",
  workout: {
    sessionTemplateId: "s1",
    frequency: { kind: "weekdays", weekdays: [1, 3] },
    startDate: "2026-10-03",
    endDate: "2026-10-28"
  }
};
const score = (id: string, injuryId: string, date: string, value: number): PainLog => ({
  id,
  injuryId,
  date,
  score: value
});

const blank = (over: Partial<SyncableState> = {}): SyncableState => ({
  templates: [],
  sessionTemplates: [],
  scheduledSessions: [],
  logs: [],
  setLogs: [],
  measurements: [],
  profile: { name: "A", email: "a@b.co", heightCm: 170, weightKg: 70 },
  injuries: [],
  painLogs: [],
  deletedInjuries: [],
  ...over
});

async function main() {
  // Before the client is made: it reads these, and takes `fetch`, once.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-key";
  globalThis.fetch = fakeServer as typeof fetch;
  // Node 20 has none, and the client wants one to exist. It is never opened here.
  Object.assign(globalThis, { WebSocket: class {} });

  const sync = await import("@/lib/sync");
  const { reconcile } = await import("@/lib/reconcile");
  const { loadUserState, pushChanges, remoteBaseline, clearUserRows, snapshotState } = sync;

  /** What a phone does when it opens: read, merge, and remember what the account holds. */
  async function open(local: SyncableState) {
    const remote: RemoteState = await loadUserState();
    const merged = reconcile(local, remote);
    return { state: merged, known: remoteBaseline(remote) };
  }

  /** What a phone does after a change: send the difference. */
  async function save(phone: { state: SyncableState; known: SyncableState }, next: SyncableState) {
    const snapshot = snapshotState(next);
    await pushChanges(USER, phone.known, snapshot);
    return { state: snapshot, known: snapshot };
  }

  const removeOnPhone = (state: SyncableState, id: string, deletion: InjuryDeletion): SyncableState => ({
    ...state,
    injuries: (state.injuries ?? []).filter((injury) => injury.id !== id),
    painLogs: (state.painLogs ?? []).filter((log) => log.injuryId !== id),
    deletedInjuries: [...(state.deletedInjuries ?? []), deletion]
  });

  // --- what the tables hold, and the row shape -----------------------------------

  for (const injury of [hip, knee, neck]) {
    assert.deepEqual(sync.rowToInjury(sync.injuryToRow(injury, USER)), injury, `${injury.id} survives the trip`);
  }
  {
    const log = score("p", "hip", "2026-10-01", 0);
    assert.deepEqual(sync.rowToPainLog(sync.painLogToRow(log, USER)), log, "a score of 0 is not lost");
    assert.equal(sync.painLogToRow(log, USER).user_id, USER);
    const deletion: InjuryDeletion = { id: "hip", deletedAt: "2026-10-05T10:00:00.000Z" };
    const row = sync.injuryDeletionToRow(deletion, USER);
    assert.deepEqual(sync.rowToInjuryDeletion(row), deletion);
    assert.deepEqual(
      Object.keys(row).sort(),
      ["deleted_at", "id", "user_id"],
      "after a delete the account holds no health detail, only the id"
    );
  }
  assert.equal(sync.rowToInjury({ id: "x", place: "nowhere", start_date: "2026-10-01" }), undefined);

  // The columns the code writes are the columns the migration creates.
  {
    const sql = readFileSync("supabase/migrations/0016_injuries.sql", "utf8");
    const rows: Record<string, Row> = {
      injuries: sync.injuryToRow(neck, USER),
      pain_logs: sync.painLogToRow(score("p", "hip", "2026-10-01", 3), USER),
      injury_deletions: sync.injuryDeletionToRow({ id: "hip", deletedAt: "2026-10-05T10:00:00.000Z" }, USER)
    };
    for (const table of INJURY_TABLES) {
      const body = new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1];
      assert.ok(body, `0016 creates ${table}`);
      for (const column of Object.keys(rows[table])) {
        assert.match(body, new RegExp(`^\\s*${column}\\s`, "m"), `${table} has a ${column} column`);
      }
      assert.ok(sql.includes(`alter table ${table} enable row level security;`), `${table} is private to each person`);
      assert.ok(sql.includes(`drop policy if exists "own rows" on ${table};`), `${table} can run twice`);
      assert.ok(sql.includes(`create policy "own rows" on ${table} for all`), `${table} has its policy`);
    }
  }

  // Every table written is also cleared by "delete all my data".
  for (const table of sync.TABLES) {
    assert.ok((sync.USER_TABLES as readonly string[]).includes(table), `delete all my data clears ${table}`);
  }

  // --- two phones ----------------------------------------------------------------

  let phoneA = await open(blank());
  let phoneB = await open(blank());

  phoneA = await save(phoneA, {
    ...phoneA.state,
    injuries: [hip, knee],
    painLogs: [score("a1", "hip", "2026-10-01", 6), score("a2", "knee", "2026-10-02", 4)]
  });
  assert.equal(rowsOf("injuries").length, 2, "both injuries reach the account");
  assert.equal(rowsOf("pain_logs").length, 2);

  phoneB = await open(phoneB.state);
  assert.deepEqual(
    phoneB.state.injuries?.map((injury) => injury.id).sort(),
    ["hip", "knee"],
    "the other phone sees them"
  );
  assert.equal(phoneB.state.painLogs?.length, 2);

  // The same day on both phones: one score, and the push does not fail on the key.
  phoneB = await save(phoneB, {
    ...phoneB.state,
    painLogs: [...(phoneB.state.painLogs ?? []).filter((log) => log.id !== "a1"), score("b1", "hip", "2026-10-01", 5)]
  });
  assert.equal(rowsOf("pain_logs").filter((row) => row.injury_id === "hip").length, 1, "one score per day");
  assert.equal(rowsOf("pain_logs").find((row) => row.injury_id === "hip")?.score, 5, "the newer score wins");
  phoneA = await open(phoneA.state);
  assert.equal(phoneA.state.painLogs?.find((log) => log.injuryId === "hip")?.score, 5);

  // Neither phone knows of the other's score: each mints its own id for one day.
  // This must not fail, or that phone's every later push fails with it.
  {
    const day = "2026-10-03";
    const first = snapshotState({ ...phoneA.state, painLogs: [...(phoneA.state.painLogs ?? []), score("a3", "knee", day, 6)] });
    await pushChanges(USER, phoneA.known, first);
    const second = snapshotState({ ...phoneB.state, painLogs: [...(phoneB.state.painLogs ?? []), score("b3", "knee", day, 7)] });
    await pushChanges(USER, phoneB.known, second);
    const that = rowsOf("pain_logs").filter((row) => row.date === day);
    assert.equal(that.length, 1, "one score that day");
    assert.equal(that[0].score, 7, "the last phone's score");
    phoneA = await open(first);
    phoneB = await open(second);
    assert.equal(phoneA.state.painLogs?.filter((log) => log.date === day).length, 1);
    assert.equal(phoneA.state.painLogs?.find((log) => log.date === day)?.score, 7, "both phones agree");
    assert.equal(phoneB.state.painLogs?.find((log) => log.date === day)?.score, 7);
  }

  // --- a deleted injury stays deleted --------------------------------------------

  const deletion: InjuryDeletion = { id: "hip", deletedAt: "2026-10-10T10:00:00.000Z" };
  phoneA = await save(phoneA, removeOnPhone(phoneA.state, "hip", deletion));
  assert.deepEqual(rowsOf("injuries").map((row) => row.id), ["knee"], "the row leaves the account");
  assert.deepEqual([...new Set(rowsOf("pain_logs").map((row) => row.injury_id))], ["knee"], "its scores leave too");
  assert.deepEqual(rowsOf("injury_deletions").map((row) => row.id), ["hip"], "only the id stays behind");

  // The other phone still holds it, and logged a score offline.
  phoneB = { ...phoneB, state: { ...phoneB.state, painLogs: [...(phoneB.state.painLogs ?? []), score("b2", "hip", "2026-10-11", 3)] } };
  phoneB = await open(phoneB.state);
  assert.deepEqual(phoneB.state.injuries?.map((injury) => injury.id), ["knee"], "it goes from the other phone");
  assert.deepEqual([...new Set(phoneB.state.painLogs?.map((log) => log.injuryId))], ["knee"], "offline scores for it go too");
  phoneB = await save(phoneB, { ...phoneB.state });
  assert.deepEqual(rowsOf("injuries").map((row) => row.id), ["knee"], "that phone's push does not bring it back");
  assert.deepEqual([...new Set(rowsOf("pain_logs").map((row) => row.injury_id))], ["knee"]);

  // A third phone never read the account, so it pushes what it holds. The row
  // comes back for a moment, and the next phone to open removes it for good.
  await pushChanges(USER, blank({ profile: phoneA.state.profile }), blank({
    profile: phoneA.state.profile,
    injuries: [hip],
    painLogs: [score("c1", "hip", "2026-10-12", 2)]
  }));
  assert.equal(rowsOf("injuries").some((row) => row.id === "hip"), true, "a stale phone can write it back");
  phoneA = await open(phoneA.state);
  assert.deepEqual(phoneA.state.injuries?.map((injury) => injury.id), ["knee"], "the deletion still wins");
  await pushChanges(USER, phoneA.known, snapshotState(phoneA.state));
  assert.deepEqual(rowsOf("injuries").map((row) => row.id), ["knee"], "and the account heals itself");
  assert.deepEqual([...new Set(rowsOf("pain_logs").map((row) => row.injury_id))], ["knee"]);

  // A phone whose own deletion has not reached the account yet keeps it deleted.
  {
    const local = removeOnPhone(blank({ injuries: [knee] }), "knee", { id: "knee", deletedAt: "2026-10-13T10:00:00.000Z" });
    const merged = reconcile(local, await loadUserState());
    assert.deepEqual(merged.injuries, [], "a read of the old row does not undo it");
  }

  // --- an injury's workout on two phones -------------------------------------------
  {
    const workout = (over = {}) => ({
      sessionTemplateId: "t",
      frequency: { kind: "every" as const, days: 1 as const },
      startDate: "2026-11-01",
      endDate: "2026-11-04",
      ...over
    });
    const day = (date: string, status: ScheduledSession["status"] = "planned"): ScheduledSession => ({
      id: `day-${date}`,
      date,
      dayIndex: 0,
      sessionTemplateId: "t",
      sessionName: "Shoulder exercises",
      exercises: [],
      type: "workout",
      status,
      source: "manual"
    });
    const shoulder: Injury = { id: "sh", place: "shoulder", side: "left", startDate: "2026-11-01", workout: workout() };
    const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];

    phoneA = await open(phoneA.state);
    phoneA = await save(phoneA, {
      ...phoneA.state,
      injuries: [...(phoneA.state.injuries ?? []), shoulder],
      scheduledSessions: days.map((date) => day(date))
    });
    phoneB = await open(phoneB.state);
    assert.equal(phoneB.state.scheduledSessions.length, 4, "the other phone gets its days");

    // Every 2 days now, on the first phone. The second still holds the old days.
    phoneA = await open(phoneA.state);
    phoneA = await save(phoneA, {
      ...phoneA.state,
      injuries: phoneA.state.injuries?.map((item) =>
        item.id === "sh" ? { ...item, workout: workout({ frequency: { kind: "every", days: 2 }, endDate: "2026-11-03" }) } : item
      ),
      scheduledSessions: [day("2026-11-01"), day("2026-11-03")]
    });
    assert.equal(rowsOf("scheduled_sessions").length, 2);
    phoneB = await open(phoneB.state);
    assert.deepEqual(
      phoneB.state.scheduledSessions.map((item) => item.date).sort(),
      ["2026-11-01", "2026-11-03"],
      "the old days go from the other phone"
    );
    phoneB = await save(phoneB, { ...phoneB.state });
    assert.equal(rowsOf("scheduled_sessions").length, 2, "and that phone does not send them back");

    // Healed on the first phone. One day was done, and it stays.
    phoneB = { ...phoneB, state: { ...phoneB.state, scheduledSessions: [day("2026-11-01", "completed"), day("2026-11-03")] } };
    phoneB = await save(phoneB, { ...phoneB.state });
    phoneA = await open(phoneA.state);
    phoneA = await save(phoneA, {
      ...phoneA.state,
      injuries: phoneA.state.injuries?.map((item) => (item.id === "sh" ? { ...item, healedDate: "2026-11-02" } : item)),
      scheduledSessions: phoneA.state.scheduledSessions.filter((item) => item.status === "completed")
    });
    phoneB = await open(phoneB.state);
    assert.deepEqual(phoneB.state.scheduledSessions.map((item) => item.status), ["completed"], "days ahead go, done stays");
    phoneB = await save(phoneB, { ...phoneB.state });
    assert.equal(rowsOf("scheduled_sessions").length, 1, "and they stay gone");

    // Deleted on the first phone, with days ahead still on the second.
    const other: Injury = { ...shoulder, id: "wr", place: "wrist", workout: workout({ sessionTemplateId: "w2" }) };
    const wristDay: ScheduledSession = { ...day("2026-11-02"), id: "wrist-day", sessionTemplateId: "w2" };
    phoneA = await open(phoneA.state);
    phoneA = await save(phoneA, {
      ...phoneA.state,
      injuries: [...(phoneA.state.injuries ?? []), other],
      scheduledSessions: [...phoneA.state.scheduledSessions, wristDay]
    });
    phoneB = await open(phoneB.state);
    assert.ok(phoneB.state.scheduledSessions.some((item) => item.id === "wrist-day"));
    phoneA = await open(phoneA.state);
    phoneA = await save(phoneA, {
      ...removeOnPhone(phoneA.state, "wr", { id: "wr", deletedAt: "2026-11-02T10:00:00.000Z" }),
      scheduledSessions: phoneA.state.scheduledSessions.filter((item) => item.id !== "wrist-day")
    });
    phoneB = await open(phoneB.state);
    assert.ok(!phoneB.state.scheduledSessions.some((item) => item.id === "wrist-day"), "they go with the injury");

    // A phone that added its injury and workout offline loses nothing: the account has not heard of it.
    const offline: Injury = { ...shoulder, id: "new", place: "knee", workout: workout({ sessionTemplateId: "w3" }) };
    const offlineDay: ScheduledSession = { ...day("2026-11-02"), id: "offline-day", sessionTemplateId: "w3" };
    const merged = reconcile(
      { ...phoneB.state, injuries: [...(phoneB.state.injuries ?? []), offline], scheduledSessions: [...phoneB.state.scheduledSessions, offlineDay] },
      await loadUserState()
    );
    assert.ok(merged.scheduledSessions.some((item) => item.id === "offline-day"), "work done offline survives the read");
    assert.ok(merged.injuries?.some((item) => item.id === "new"));

    // A server with no tables says nothing, so nothing is dropped.
    const silent = reconcile(
      { ...blank(), injuries: [offline], scheduledSessions: [offlineDay] },
      { templates: [], sessionTemplates: [], scheduledSessions: [], logs: [], setLogs: [], measurements: [] }
    );
    assert.equal(silent.scheduledSessions.length, 1);

    // Every 2 days on one phone: new ids on some of the same dates. The other phone
    // must not end up with two workouts on one day.
    {
      const old = (date: string): ScheduledSession => ({ ...day(date), id: `old-${date}`, sessionTemplateId: "f1" });
      const fresh = (date: string): ScheduledSession => ({ ...day(date), id: `new-${date}`, sessionTemplateId: "f1" });
      const often: Injury = { ...shoulder, id: "f", place: "elbow", workout: workout({ sessionTemplateId: "f1" }) };
      const others = (list: ScheduledSession[]) => list.filter((item) => item.sessionTemplateId !== "f1");
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, {
        ...phoneA.state,
        injuries: [...(phoneA.state.injuries ?? []), often],
        scheduledSessions: [...phoneA.state.scheduledSessions, ...days.map(old)]
      });
      phoneB = await open(phoneB.state);
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, {
        ...phoneA.state,
        injuries: phoneA.state.injuries?.map((item) =>
          item.id === "f"
            ? { ...item, workout: workout({ sessionTemplateId: "f1", frequency: { kind: "every", days: 2 }, endDate: "2026-11-03" }) }
            : item
        ),
        scheduledSessions: [...others(phoneA.state.scheduledSessions), fresh("2026-11-01"), fresh("2026-11-03")]
      });
      phoneB = await open(phoneB.state);
      assert.deepEqual(
        phoneB.state.scheduledSessions.filter((item) => item.sessionTemplateId === "f1").map((item) => item.id),
        ["new-2026-11-01", "new-2026-11-03"],
        "one workout a day, the account's"
      );
      phoneB = await save(phoneB, { ...phoneB.state });
      assert.equal(rowsOf("scheduled_sessions").filter((row) => row.session_template_id === "f1").length, 2, "and none go back");
    }

    // Deleted with no signal, app closed, opened online: the account still holds it all.
    {
      const planned = (date: string): ScheduledSession => ({ ...day(date), id: `off-${date}`, sessionTemplateId: "o1" });
      const done: ScheduledSession = { ...planned("2026-11-01"), status: "completed" };
      const gone: Injury = { ...shoulder, id: "o", place: "calf", workout: workout({ sessionTemplateId: "o1" }) };
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, {
        ...phoneA.state,
        injuries: [...(phoneA.state.injuries ?? []), gone],
        scheduledSessions: [...phoneA.state.scheduledSessions, done, planned("2026-11-02"), planned("2026-11-03")]
      });
      const offline = removeOnPhone(
        {
          ...phoneA.state,
          scheduledSessions: phoneA.state.scheduledSessions.filter((item) => item.sessionTemplateId !== "o1")
        },
        "o",
        { id: "o", deletedAt: "2026-11-02T10:00:00.000Z" }
      );
      phoneA = await open(offline);
      const kept = () => phoneA.state.scheduledSessions.filter((item) => item.sessionTemplateId === "o1").map((item) => item.id);
      assert.deepEqual(kept(), [], "its days do not come back as normal workouts");
      phoneA = await save(phoneA, { ...phoneA.state });
      assert.deepEqual(
        rowsOf("scheduled_sessions").filter((row) => row.session_template_id === "o1").map((row) => row.id),
        [],
        "they leave the account too"
      );
      assert.equal(rowsOf("injuries").some((row) => row.id === "o"), false);
      phoneB = await open(phoneB.state);
      assert.equal(phoneB.state.scheduledSessions.filter((item) => item.sessionTemplateId === "o1").length, 0, "and the other phone");
      // A day still open on the other phone goes as well: with no label, finishing it would write normal logs.
      const open1: ScheduledSession = { ...planned("2026-11-05"), id: "open-day", status: "active" };
      const merged = reconcile(
        { ...phoneB.state, injuries: [...(phoneB.state.injuries ?? []), gone], scheduledSessions: [...phoneB.state.scheduledSessions, open1] },
        await loadUserState()
      );
      assert.equal(merged.scheduledSessions.some((item) => item.id === "open-day"), false);
    }

    // Stopped on one phone. The other phone's days go too, a day done there among them.
    {
      const stopping: Injury = { ...shoulder, id: "s", place: "forearm", workout: workout({ sessionTemplateId: "s1w" }) };
      const days2 = ["2026-11-01", "2026-11-02"].map((date): ScheduledSession => ({ ...day(date), id: `s-${date}`, sessionTemplateId: "s1w" }));
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, {
        ...phoneA.state,
        injuries: [...(phoneA.state.injuries ?? []), stopping],
        scheduledSessions: [...phoneA.state.scheduledSessions, ...days2]
      });
      phoneB = await open(phoneB.state);
      phoneB = await open({
        ...phoneB.state,
        scheduledSessions: phoneB.state.scheduledSessions.map((item) => (item.id === "s-2026-11-01" ? { ...item, status: "completed" as const } : item))
      });
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, {
        ...phoneA.state,
        injuries: phoneA.state.injuries?.map((item) => (item.id === "s" ? { ...item, workout: undefined } : item)),
        scheduledSessions: phoneA.state.scheduledSessions.filter((item) => item.sessionTemplateId !== "s1w")
      });
      phoneB = await open(phoneB.state);
      assert.equal(phoneB.state.scheduledSessions.some((item) => item.sessionTemplateId === "s1w"), false, "no day of it is left");
      phoneB = await save(phoneB, { ...phoneB.state });
      assert.equal(rowsOf("scheduled_sessions").some((row) => row.session_template_id === "s1w"), false, "and none goes back");
    }

    // Healed with no signal, app closed, opened online.
    {
      const planned = (date: string): ScheduledSession => ({ ...day(date), id: `heal-${date}`, sessionTemplateId: "h1" });
      const healing: Injury = { ...shoulder, id: "healing", place: "shin", workout: workout({ sessionTemplateId: "h1" }) };
      const statusOf = (list: Injury[] | undefined) => list?.find((item) => item.id === "healing");
      const dayIds = (list: ScheduledSession[]) => list.filter((item) => item.sessionTemplateId === "h1").map((item) => item.id).sort();
      const all = ["2026-11-01", "2026-11-02", "2026-11-03"].map(planned);
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, {
        ...phoneA.state,
        injuries: [...(phoneA.state.injuries ?? []), healing],
        scheduledSessions: [...phoneA.state.scheduledSessions, ...all]
      });
      phoneB = await open(phoneB.state);

      phoneB = await open({
        ...phoneB.state,
        injuries: phoneB.state.injuries?.map((item) =>
          item.id === "healing" ? { ...item, healedDate: "2026-11-02", unsent: true } : item
        ),
        scheduledSessions: phoneB.state.scheduledSessions.filter((item) => !["heal-2026-11-02", "heal-2026-11-03"].includes(item.id))
      });
      assert.equal(statusOf(phoneB.state.injuries)?.healedDate, "2026-11-02", "healed stays healed");
      assert.deepEqual(dayIds(phoneB.state.scheduledSessions), ["heal-2026-11-01"], "and its days ahead stay gone");
      phoneB = await save(phoneB, { ...phoneB.state });
      assert.equal(rowsOf("injuries").find((row) => row.id === "healing")?.healed_date, "2026-11-02", "the account hears it");
      assert.deepEqual(rowsOf("scheduled_sessions").filter((row) => row.session_template_id === "h1").map((row) => row.id), ["heal-2026-11-01"]);

      // Read back, the phone has nothing left to tell, so another phone may now reopen it.
      phoneB = await open(phoneB.state);
      assert.equal(statusOf(phoneB.state.injuries)?.unsent, undefined);
      phoneA = await open(phoneA.state);
      assert.equal(statusOf(phoneA.state.injuries)?.healedDate, "2026-11-02");
      assert.deepEqual(dayIds(phoneA.state.scheduledSessions), ["heal-2026-11-01"]);
      phoneA = await save(phoneA, {
        ...phoneA.state,
        injuries: phoneA.state.injuries?.map((item) => (item.id === "healing" ? { ...item, healedDate: undefined } : item)),
        scheduledSessions: [...phoneA.state.scheduledSessions, { ...planned("2026-11-03"), id: "back" }]
      });
      phoneB = await open(phoneB.state);
      assert.equal(statusOf(phoneB.state.injuries)?.healedDate, undefined, "it has come back, on both phones");
      assert.deepEqual(dayIds(phoneB.state.scheduledSessions), ["back", "heal-2026-11-01"]);
      phoneB = await save(phoneB, { ...phoneB.state });
      assert.equal(rowsOf("injuries").find((row) => row.id === "healing")?.healed_date, null, "and the other phone does not undo that");

      // The same the other way: it comes back with no signal, on a healed row.
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, {
        ...phoneA.state,
        injuries: phoneA.state.injuries?.map((item) => (item.id === "healing" ? { ...item, healedDate: "2026-11-03" } : item)),
        scheduledSessions: phoneA.state.scheduledSessions.filter((item) => item.id !== "back")
      });
      phoneA = await open({
        ...phoneA.state,
        injuries: phoneA.state.injuries?.map((item) =>
          item.id === "healing" ? { ...item, healedDate: undefined, unsent: true } : item
        ),
        scheduledSessions: [...phoneA.state.scheduledSessions, { ...planned("2026-11-04"), id: "back-offline" }]
      });
      assert.equal(statusOf(phoneA.state.injuries)?.healedDate, undefined, "the last word on this phone holds");
      assert.ok(phoneA.state.scheduledSessions.some((item) => item.id === "back-offline"), "with its new day");
      phoneA = await save(phoneA, { ...phoneA.state });
      assert.equal(rowsOf("injuries").find((row) => row.id === "healing")?.healed_date, null);
    }

    // A doctor's workout set up with no signal on an injury the account already has,
    // one day done, app closed, opened online. It all stays, and it all goes up.
    {
      const planned = (date: string): ScheduledSession => ({ ...day(date), id: `w-${date}`, sessionTemplateId: "w1" });
      const plain: Injury = { ...shoulder, id: "ws", place: "biceps", workout: undefined };
      const ownDays = (list: ScheduledSession[]) => list.filter((item) => item.sessionTemplateId === "w1").map((item) => item.id).sort();
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, { ...phoneA.state, injuries: [...(phoneA.state.injuries ?? []), plain] });
      phoneA = await open({
        ...phoneA.state,
        injuries: phoneA.state.injuries?.map((item) =>
          item.id === "ws" ? { ...item, workout: workout({ sessionTemplateId: "w1" }), unsent: true } : item
        ),
        scheduledSessions: [
          ...phoneA.state.scheduledSessions,
          { ...planned("2026-11-01"), status: "completed" },
          planned("2026-11-02"),
          planned("2026-11-03")
        ]
      });
      const held = phoneA.state.injuries?.find((item) => item.id === "ws");
      assert.equal(held?.workout?.sessionTemplateId, "w1", "the workout is not lost");
      assert.deepEqual(ownDays(phoneA.state.scheduledSessions), ["w-2026-11-01", "w-2026-11-02", "w-2026-11-03"], "nor its days");
      phoneA = await save(phoneA, { ...phoneA.state });
      assert.equal((rowsOf("injuries").find((row) => row.id === "ws")?.workout as { sessionTemplateId?: string })?.sessionTemplateId, "w1");
      phoneB = await open(phoneB.state);
      assert.equal(phoneB.state.injuries?.find((item) => item.id === "ws")?.workout?.sessionTemplateId, "w1", "the other phone hears");
      assert.equal(ownDays(phoneB.state.scheduledSessions).length, 3);

      // Changed to every 2 days with no signal: this phone's days stand, with no old day beside them.
      phoneA = await open({
        ...phoneA.state,
        injuries: phoneA.state.injuries?.map((item) =>
          item.id === "ws"
            ? { ...item, workout: workout({ sessionTemplateId: "w1", frequency: { kind: "every", days: 2 }, endDate: "2026-11-05" }), unsent: true }
            : item
        ),
        scheduledSessions: [
          ...phoneA.state.scheduledSessions.filter((item) => !["w-2026-11-02", "w-2026-11-03"].includes(item.id)),
          { ...planned("2026-11-03"), id: "w2-2026-11-03" },
          { ...planned("2026-11-05"), id: "w2-2026-11-05" }
        ]
      });
      assert.deepEqual(ownDays(phoneA.state.scheduledSessions), ["w-2026-11-01", "w2-2026-11-03", "w2-2026-11-05"], "one workout a day");
      phoneA = await save(phoneA, { ...phoneA.state });
      assert.deepEqual(
        rowsOf("scheduled_sessions").filter((row) => row.session_template_id === "w1").map((row) => row.id).sort(),
        ["w-2026-11-01", "w2-2026-11-03", "w2-2026-11-05"],
        "and the account agrees"
      );

      // Stopped with no signal: the account's days go too.
      phoneA = await open({
        ...phoneA.state,
        injuries: phoneA.state.injuries?.map((item) => (item.id === "ws" ? { ...item, workout: undefined, unsent: true } : item)),
        scheduledSessions: phoneA.state.scheduledSessions.filter((item) => item.sessionTemplateId !== "w1")
      });
      assert.equal(phoneA.state.injuries?.find((item) => item.id === "ws")?.workout, undefined, "it stays stopped");
      assert.deepEqual(ownDays(phoneA.state.scheduledSessions), [], "with no day left");
      phoneA = await save(phoneA, { ...phoneA.state });
      assert.equal(rowsOf("scheduled_sessions").some((row) => row.session_template_id === "w1"), false);
    }

    // A push cut off after the days and before the injury's row. The mark repairs it.
    {
      const plain: Injury = { ...shoulder, id: "cut", place: "groin", workout: undefined };
      const dayCut: ScheduledSession = { ...day("2026-11-02"), id: "cut-day", sessionTemplateId: "c1" };
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, { ...phoneA.state, injuries: [...(phoneA.state.injuries ?? []), plain] });
      await pushChanges(USER, blank({ profile: phoneA.state.profile }), blank({ profile: phoneA.state.profile, scheduledSessions: [dayCut] }));
      phoneA = await open({
        ...phoneA.state,
        injuries: phoneA.state.injuries?.map((item) =>
          item.id === "cut" ? { ...item, workout: workout({ sessionTemplateId: "c1" }), unsent: true } : item
        ),
        scheduledSessions: [...phoneA.state.scheduledSessions, dayCut]
      });
      assert.equal(phoneA.state.injuries?.find((item) => item.id === "cut")?.workout?.sessionTemplateId, "c1", "the label survives");
      assert.ok(phoneA.state.scheduledSessions.some((item) => item.id === "cut-day"));
      phoneA = await save(phoneA, { ...phoneA.state });
      assert.ok(rowsOf("injuries").find((row) => row.id === "cut")?.workout, "and reaches the account");
    }

    // The workout outlives its injury. Once it is a normal workout, its days are safe.
    {
      const later: Injury = { ...shoulder, id: "later", place: "quad", workout: workout({ sessionTemplateId: "n1" }) };
      const oldDay: ScheduledSession = { ...day("2026-11-01"), id: "old-injury-day", sessionTemplateId: "n1" };
      const normal = (id: string, status: ScheduledSession["status"] = "planned"): ScheduledSession => ({
        ...day("2026-11-06"),
        id,
        sessionTemplateId: "n1",
        status
      });
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, {
        ...phoneA.state,
        injuries: [...(phoneA.state.injuries ?? []), later],
        scheduledSessions: [...phoneA.state.scheduledSessions, oldDay]
      });
      phoneB = await open(phoneB.state);

      // The first phone deletes it, then does the workout as a normal one.
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, {
        ...removeOnPhone(phoneA.state, "later", { id: "later", deletedAt: "2026-11-05T10:00:00.000Z" }),
        scheduledSessions: [...phoneA.state.scheduledSessions.filter((item) => item.id !== "old-injury-day"), normal("normal-done", "completed")]
      });

      // The second phone still holds the old injury, and opens.
      phoneB = await open(phoneB.state);
      const held = phoneB.state.scheduledSessions.filter((item) => item.sessionTemplateId === "n1").map((item) => item.id);
      assert.deepEqual(held, ["normal-done"], "its old day goes, and the normal workout stays");
      phoneB = await save(phoneB, { ...phoneB.state });
      assert.deepEqual(
        rowsOf("scheduled_sessions").filter((row) => row.session_template_id === "n1").map((row) => row.id),
        ["normal-done"],
        "and the out-of-date phone takes nothing from the account"
      );

      // Deleted with no signal, then planned as a normal workout on the same phone.
      const again: Injury = { ...shoulder, id: "again", place: "ankle", workout: workout({ sessionTemplateId: "n2" }) };
      const old2: ScheduledSession = { ...day("2026-11-01"), id: "old2", sessionTemplateId: "n2" };
      phoneA = await open(phoneA.state);
      phoneA = await save(phoneA, {
        ...phoneA.state,
        injuries: [...(phoneA.state.injuries ?? []), again],
        scheduledSessions: [...phoneA.state.scheduledSessions, old2]
      });
      phoneA = await open({
        ...removeOnPhone(phoneA.state, "again", { id: "again", deletedAt: "2026-11-05T10:00:00.000Z" }),
        scheduledSessions: [
          ...phoneA.state.scheduledSessions.filter((item) => item.id !== "old2"),
          { ...normal("normal-planned"), sessionTemplateId: "n2" }
        ]
      });
      assert.deepEqual(
        phoneA.state.scheduledSessions.filter((item) => item.sessionTemplateId === "n2").map((item) => item.id),
        ["normal-planned"],
        "the account's old day goes, and the new one stays"
      );
      phoneA = await save(phoneA, { ...phoneA.state });
    }

    tables.set("scheduled_sessions", []);
    tables.set("injuries", rowsOf("injuries").filter((row) => row.id === "knee"));
    phoneA = await open(blank());
    phoneB = await open(blank());
  }

  // --- before migration 0016 ------------------------------------------------------

  {
    const kept = new Map(tables);
    tables.clear();
    INJURY_TABLES.forEach((table) => missing.add(table));

    const remote = await loadUserState();
    assert.equal(remote.injuries, undefined, "a missing table says nothing");
    assert.equal(remote.painLogs, undefined);
    assert.equal(remote.deletedInjuries, undefined);

    const local = blank({ injuries: [knee], painLogs: [score("x", "knee", "2026-10-14", 4)] });
    const merged = reconcile(local, remote);
    assert.deepEqual(merged.injuries, [knee], "injuries stay on the phone");

    const known = remoteBaseline(remote);
    await pushChanges(USER, known, {
      ...snapshotState(merged),
      measurements: [{ id: "m", date: "2026-10-14", metric: "weight", value: 70 }]
    });
    assert.equal(rowsOf("body_measurements").length, 1, "everything else still saves");

    await clearUserRows(USER);
    assert.equal(rowsOf("body_measurements").length, 0, "delete all my data still works");

    // A second phone could read the day and not the injury, and would treat it as a
    // normal workout. So a day of an injury's workout waits on this phone.
    const mine: Injury = {
      ...knee,
      id: "held",
      workout: { sessionTemplateId: "doctor", frequency: { kind: "every", days: 1 }, startDate: "2026-11-01", endDate: "2026-11-02" }
    };
    const session = (id: string, sessionTemplateId: string): ScheduledSession => ({
      id,
      date: "2026-11-01",
      dayIndex: 0,
      sessionTemplateId,
      sessionName: id,
      exercises: [],
      type: "workout",
      status: "planned",
      source: "manual"
    });
    const before = reconcile(blank({ injuries: [mine], scheduledSessions: [session("doctor-day", "doctor"), session("legs-day", "legs")] }), await loadUserState());
    await pushChanges(USER, remoteBaseline(await loadUserState()), snapshotState(before));
    assert.deepEqual(rowsOf("scheduled_sessions").map((row) => row.id), ["legs-day"], "only the normal workout goes up");

    // A later change on the same run does not send it either, and asks nothing of the missing tables.
    await pushChanges(USER, snapshotState(before), {
      ...snapshotState(before),
      scheduledSessions: before.scheduledSessions.map((item) => ({ ...item, sessionName: `${item.sessionName} edited` }))
    });
    assert.deepEqual(rowsOf("scheduled_sessions").map((row) => row.id), ["legs-day"], "still held back");

    // 0016 has run. The next open sends the injury and its day together.
    missing.clear();
    const after = await loadUserState();
    await pushChanges(USER, remoteBaseline(after), snapshotState(reconcile(before, after)));
    assert.deepEqual(rowsOf("scheduled_sessions").map((row) => row.id).sort(), ["doctor-day", "legs-day"], "the day goes up");
    assert.deepEqual(rowsOf("injuries").map((row) => row.id), ["held"], "with its injury");

    tables.clear();
    kept.forEach((rows, table) => tables.set(table, rows));
  }

  // Only a missing table is forgiven. A real failure must still reach the screen.
  {
    refused.add("injuries");
    await assert.rejects(
      pushChanges(USER, blank({ profile: phoneA.state.profile }), blank({ profile: phoneA.state.profile, injuries: [neck] })),
      (error: { code?: string }) => error.code === "42501",
      "a refused write is not swallowed"
    );
    refused.clear();
  }

  // --- delete all my data --------------------------------------------------------

  await clearUserRows(USER);
  for (const table of INJURY_TABLES) {
    assert.equal(rowsOf(table).length, 0, `${table} is emptied`);
  }

  console.log("injury sync checks passed");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
