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

    missing.clear();
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
