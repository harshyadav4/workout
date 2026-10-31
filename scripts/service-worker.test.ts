// Run with: npm run check
//
// public/sw.js against stand-ins for the browser's caches and the network. Real
// browsers ran it too, but only here can a phone be made to run out of space.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ORIGIN = "https://arise.test";
const absolute = (key: string | { url: string }) => new URL(typeof key === "string" ? key : key.url, ORIGIN).href;

type Handler = (event: Record<string, unknown>) => void;

interface FakeRequest {
  method: string;
  url: string;
  mode: string;
  headers: Headers;
}

const request = (path: string, headers: Record<string, string> = {}, mode = "cors"): FakeRequest => ({
  method: "GET",
  url: `${ORIGIN}${path}`,
  mode,
  headers: new Headers(headers)
});

function worker(files: string[]) {
  const listeners = new Map<string, Handler>();
  const stores = new Map<string, Map<string, Response>>();
  const state = {
    online: true,
    roomFor: Infinity,
    fetched: [] as string[],
    failWith: undefined as string | undefined,
    release: ""
  };

  const openStore = (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      match: async (key: string | { url: string }) => store.get(absolute(key))?.clone(),
      put: async (key: string | { url: string }, response: Response) => {
        const total = [...stores.values()].reduce((sum, item) => sum + item.size, 0);
        if (!store.has(absolute(key)) && total >= state.roomFor) {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        }
        store.set(absolute(key), response);
      },
      add: async (key: string) => {
        store.set(absolute(key), await network(key));
      },
      delete: async (key: string | { url: string }) => store.delete(absolute(key)),
      keys: async () => [...store.keys()].map((url) => ({ url }))
    };
  };

  const caches = {
    open: async (name: string) => openStore(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (key: string | { url: string }) => {
      for (const store of stores.values()) {
        const hit = store.get(absolute(key));
        if (hit) return hit.clone();
      }
      return undefined;
    }
  };

  const network = async (input: string | FakeRequest, init?: { headers?: Record<string, string> }) => {
    if (!state.online) {
      throw new TypeError("Failed to fetch");
    }
    const url = absolute(input);
    const path = new URL(url).pathname;
    const isData =
      typeof input === "string" ? init?.headers?.RSC === "1" : input.headers.has("RSC");
    state.fetched.push(`${isData ? "data " : ""}${path}`);
    if (state.failWith && path === state.failWith) {
      return new Response("no", { status: 500 });
    }
    if (path === "/offline-files.json") {
      return new Response(JSON.stringify(files));
    }
    return isData
      ? new Response(`data of ${path}`, { headers: { "content-type": "text/x-component" } })
      : new Response(`page ${path}${state.release}`, { headers: { "content-type": "text/html" } });
  };

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => listeners.set(type, handler),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined }
  };
  new Function("self", "caches", "fetch", readFileSync("public/sw.js", "utf8"))(self, caches, network);

  const fire = (type: string, event: Record<string, unknown>) => listeners.get(type)?.(event);

  return {
    state,
    caches,
    stores,
    async install() {
      const waits: Promise<unknown>[] = [];
      fire("install", { waitUntil: (wait: Promise<unknown>) => waits.push(wait) });
      await Promise.all(waits);
    },
    async save() {
      const waits: Promise<unknown>[] = [];
      fire("message", { data: { type: "save-offline" }, waitUntil: (wait: Promise<unknown>) => waits.push(wait) });
      await Promise.all(waits);
    },
    /** What the worker answers, or undefined when it leaves the request alone. */
    async ask(what: FakeRequest): Promise<Response | undefined> {
      let answer: Promise<Response> | undefined;
      fire("fetch", { request: what, respondWith: (given: Promise<Response>) => (answer = given) });
      return answer;
    }
  };
}

const CODE = ["/_next/static/chunks/a.js", "/_next/static/chunks/b.css"];
const TABS = ["/", "/plan", "/skills", "/progress", "/profile"];
const isSaved = async (w: ReturnType<typeof worker>) => Boolean(await w.caches.match("/offline-files.json"));

async function main() {
  // --- saving ---------------------------------------------------------------------
  {
    const w = worker(CODE);
    await w.save();
    assert.ok(await isSaved(w), "the release is marked as saved");
    for (const file of CODE) {
      assert.ok(await w.caches.match(file), `${file} is saved`);
    }
    for (const tab of TABS) {
      assert.equal(await (await w.caches.match(tab))?.text(), `page ${tab}`, `${tab} keeps its page`);
      assert.ok(w.state.fetched.includes(`data ${tab}`), `the data of ${tab} is fetched`);
    }

    const before = w.state.fetched.length;
    await w.save();
    assert.equal(w.state.fetched.length, before + 1, "a release already saved costs one small request");
  }

  // --- a tab change with no signal ------------------------------------------------
  {
    const w = worker(CODE);
    await w.save();

    const online = await w.ask(request("/plan?_rsc=abc", { RSC: "1" }));
    assert.equal(await online?.text(), "data of /plan", "with signal, the network answers");

    w.state.online = false;
    for (const tab of TABS) {
      const answer = await w.ask(request(`${tab}?_rsc=abc`, { RSC: "1" }));
      assert.equal(await answer?.text(), `data of ${tab}`, `${tab} answers from what was saved`);
      assert.equal(answer?.headers.get("content-type"), "text/x-component", "in the shape Next needs");
    }
    const build = await w.ask(request("/plan?mode=build&_rsc=abc", { RSC: "1" }));
    assert.equal(await build?.text(), "data of /plan", "Build on the Plan tab is the Plan tab");

    const unknown = await w.ask(request("/nowhere?_rsc=abc", { RSC: "1" }));
    assert.equal(unknown?.type, "error", "a tab never saved fails, and Next falls back to loading the page");

    assert.equal(
      await w.ask(request("/plan?_rsc=abc", { RSC: "1", "Next-Router-Prefetch": "1" })),
      undefined,
      "a prefetch is left alone: its answer has another shape"
    );

    // A page must never come back as data, or data as a page.
    for (const tab of TABS) {
      const page = await w.ask(request(tab, {}, "navigate"));
      assert.equal(await page?.text(), `page ${tab}`, `opening ${tab} with no signal gives its page`);
    }
    const buildPage = await w.ask(request("/plan?mode=build", {}, "navigate"));
    assert.equal(await buildPage?.text(), "page /plan", "not Today, when Plan is reloaded on Build");
    const elsewhere = await w.ask(request("/about", {}, "navigate"));
    assert.equal(await elsewhere?.text(), "page /", "anything else opens Today");
  }

  // --- a tab that cannot be saved -------------------------------------------------
  {
    const w = worker(CODE);
    w.state.failWith = "/progress";
    await w.save();
    assert.equal(await isSaved(w), false, "a failure leaves the release unsaved, so the next open tries again");
    w.state.failWith = undefined;
    await w.save();
    assert.ok(await isSaved(w), "and it does");
  }

  // --- a full phone ---------------------------------------------------------------
  {
    const OLD = ["/_next/static/chunks/old-1.js", "/_next/static/chunks/old-2.js", "/_next/static/chunks/old-3.js"];
    const w = worker(OLD);
    await w.save();
    assert.ok(await w.caches.match(OLD[0]));

    // The next release, on a phone with room for only one release.
    const next = worker(["/_next/static/chunks/new-1.js", "/_next/static/chunks/new-2.js", "/_next/static/chunks/new-3.js"]);
    const everything = [...w.stores.entries()];
    for (const [name, store] of everything) {
      const copy = new Map<string, Response>();
      for (const [key, value] of store) {
        // Not the mark that says which release is saved: that one is the next release's to write.
        if (!key.endsWith("/offline-files.json")) copy.set(key, value.clone());
      }
      next.stores.set(name, copy);
    }
    const held = [...next.stores.values()].reduce((sum, store) => sum + store.size, 0);
    // Room for the mark that says the release is saved, and no more.
    next.state.roomFor = held + 1;

    await next.save();
    assert.ok(await isSaved(next), "the save finishes on a full phone");
    assert.ok(await next.caches.match("/_next/static/chunks/new-1.js"), "with the new code");
    assert.equal(await next.caches.match(OLD[0]), undefined, "and the old code made room");
  }

  // Any other failure of the same step is not taken for a full phone.
  {
    const OLD = ["/_next/static/chunks/old-1.js"];
    const w = worker(OLD);
    await w.save();
    const next = worker(["/_next/static/chunks/new-1.js"]);
    for (const [name, store] of w.stores) {
      const copy = new Map<string, Response>();
      for (const [key, value] of store) {
        if (!key.endsWith("/offline-files.json")) copy.set(key, value.clone());
      }
      next.stores.set(name, copy);
    }
    next.state.failWith = "/_next/static/chunks/new-1.js";
    await next.save();
    assert.ok(await next.caches.match(OLD[0]), "the old code stays until the new code is in");
    assert.equal(await isSaved(next), false);
  }

  // --- the next release ----------------------------------------------------------
  // Between the new worker's install and the end of its save, the phone may lose
  // signal. What it holds must still open: old pages with the old code.
  {
    const OLD = "/_next/static/chunks/old.js";
    const NEW = "/_next/static/chunks/new.js";
    const before = worker([OLD]);
    await before.save();
    const after = worker([NEW]);
    for (const [name, store] of before.stores) {
      after.stores.set(name, new Map([...store].map(([key, value]) => [key, value.clone()])));
    }
    after.state.release = " new";

    await after.install();
    assert.equal(await (await after.caches.match("/plan"))?.text(), "page /plan", "install leaves the saved page");
    assert.ok(await after.caches.match(OLD), "and its code");
    after.state.online = false;
    const offline = await after.ask(request("/plan", {}, "navigate"));
    assert.equal(await offline?.text(), "page /plan", "so the app still opens with no signal");
    const code = await after.ask(request(OLD));
    assert.ok(code, "with its code");

    after.state.online = true;
    await after.save();
    assert.equal(await (await after.caches.match("/plan"))?.text(), "page /plan new", "the save brings the new page");
    assert.ok(await after.caches.match(NEW), "and the new code");
    assert.equal(await after.caches.match(OLD), undefined, "and the old code goes last");
  }

  // The same release, saved by a worker from before the tab data: it still gets it.
  {
    const w = worker(CODE);
    await w.save();
    for (const store of w.stores.values()) {
      for (const key of store.keys()) {
        if (key.endsWith("?tab-data")) store.delete(key);
      }
    }
    await w.save();
    assert.ok(await w.caches.match("/plan?tab-data"), "the tab data is saved");
  }

  console.log("service worker checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
