// Drives headless Chrome over CDP against a running Galaxy build and prints one
// JSON result line per scenario. Run through hack/verify.sh, which provides the
// fake stream and preview server.
//
// Usage: node check.mjs <scenario> <url> <out-dir>
// Scenarios: functional | labels | layout | perf | webgl | stream | nometrics | auth
// Env: THROTTLE (CPU slowdown factor for perf), CHROME (browser binary),
// FAKE_BIN/FAKE_PID/FAKE_ARGS (stream: the fake stream to restart).

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [scenario, url, outDir] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "galaxy-verify-"))}`,
    "--window-size=1456,830",
    "--use-angle=metal",
    "--enable-gpu",
    ...(scenario === "webgl" ? ["--disable-webgl"] : []),
    "about:blank",
  ],
  { stdio: "ignore" },
);

let target;
for (let i = 0; i < 50 && !target; i++) {
  try {
    target = (await (await fetch(`http://localhost:${PORT}/json/list`)).json()).find((t) => t.type === "page");
  } catch {
    await sleep(200);
  }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let seq = 0;
const pending = new Map();
const logs = [];
const sse = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Network.eventSourceMessageReceived") sse.push({ event: m.params.eventName, data: m.params.data });
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled") logs.push(m.params.args.map((a) => a.value).join(" "));
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    logs.push(`EXCEPTION ${(d.exception?.description ?? d.text).split("\n").slice(0, 3).join(" | ")}`);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, `${scenario}-${name}.png`), Buffer.from(r.result.data, "base64"));
};
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
const click = async (x, y) => {
  await mouse("mousePressed", x, y, { clickCount: 1 });
  await mouse("mouseReleased", x, y, { clickCount: 1 });
};
const clickButton = (text) => ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click(); 1`);
const search = async (query) => {
  await ev(`document.querySelector('input[placeholder^="Search"]') || [...document.querySelectorAll('button')].find(b => b.textContent.includes('FILTERS'))?.click(); 1`);
  await sleep(400);
  await ev(`(() => { const i = document.querySelector('input[placeholder^="Search"]'); i.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(query)});
    i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await sleep(300);
  for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
};
const detailPanel = () =>
  ev(`(() => { const h = [...document.querySelectorAll('div')].find(d => d.textContent?.trim() === 'DETAILS');
    return h ? h.closest('.rounded-xl')?.querySelector('.font-semibold')?.textContent.trim() : null; })()`);
const labelStats = () =>
  ev(`(() => {
    const els = [...document.querySelectorAll('[data-style]')].filter(e => e.style.display === 'block');
    const rects = els.map(e => e.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps++;
    }
    const byStyle = {}; els.forEach(e => byStyle[e.dataset.style] = (byStyle[e.dataset.style] || 0) + 1);
    return { visible: els.length, byStyle, overlaps };
  })()`);

async function orbit() {
  // Each orbit starts a new frame counter and stops the previous one, which
  // would otherwise double-count frames in the second view.
  await ev(`(() => { const gen = (window.__gen = (window.__gen || 0) + 1); window.__frames = [];
    (function tick(t) { if (window.__gen !== gen) return; window.__frames.push(t); requestAnimationFrame(tick); })(performance.now()); return 1; })()`);
  await mouse("mousePressed", 900, 450, { clickCount: 1 });
  const start = Date.now();
  for (let k = 1; Date.now() - start < 10000; k++) {
    await mouse("mouseMoved", 900 + Math.sin(k / 20) * 300, 450 + Math.cos(k / 35) * 80, { buttons: 1 });
    await sleep(16);
  }
  await mouse("mouseReleased", 900, 450, { clickCount: 1 });
  const f = await ev(`window.__frames`);
  const d = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b);
  return {
    avgFps: +(d.length / ((f.at(-1) - f[0]) / 1000)).toFixed(1),
    p99FrameMs: +d[Math.floor(d.length * 0.99)].toFixed(1),
    maxFrameMs: +d.at(-1).toFixed(1),
  };
}

await send("Page.enable");
await send("Runtime.enable");
if (scenario === "stream") await send("Network.enable");
if (scenario === "perf" && process.env.THROTTLE) await send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.THROTTLE) });
await send("Page.navigate", { url });
await sleep(9000);

const result = { scenario };
const failures = [];

if (scenario === "functional") {
  let hit = null;
  for (let y = 250; y < 650 && !hit; y += 12)
    for (let x = 450; x < 1000 && !hit; x += 12) {
      await mouse("mouseMoved", x, y);
      await sleep(20);
      if ((await ev(`document.body.style.cursor`)) === "pointer") hit = [x, y];
    }
  result.hover = !!hit;
  if (hit) {
    await click(...hit);
    await sleep(1500);
    result.clickPanel = await detailPanel();
  }
  await click(1300, 700);
  await sleep(800);
  result.panelAfterEmptyClick = await detailPanel();
  await search("deployment/ns-03/app-02");
  await sleep(1500);
  result.searchPanel = await detailPanel();
  await shot("search");
  await clickButton("RESET VIEW");
  await sleep(1500);
  result.panelAfterReset = await detailPanel();
  // The only failed pods in the fake stream are the crash-looping ones.
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('ERRORS'))?.click(); 1`);
  await sleep(1500);
  await shot("crashy");
  result.crashyPanel = await ev(`(() => { const t = document.body.innerText; return ['HEALTH', 'restarts: 7', 'WARNINGS', 'BackOff', 'USAGE', 'requested'].filter(s => !t.includes(s)); })()`);
  await clickButton("RESET VIEW");
  if (!result.hover) failures.push("no node found under the pointer");
  if (!result.clickPanel) failures.push("click did not open the detail panel");
  if (result.panelAfterEmptyClick) failures.push("empty click did not close the panel");
  if (!result.searchPanel?.includes("app-02")) failures.push("search + Enter did not select app-02");
  if (result.panelAfterReset) failures.push("reset did not clear the selection");
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('LEGEND'))?.click(); 1`);
  await sleep(500);
  result.usageLegend = await ev(`document.body.innerText.includes('Size and glow: usage over requests')`);
  if (!result.usageLegend) failures.push("legend does not describe the usage encoding");
  if (result.crashyPanel?.length) failures.push(`crash-looping pod panel is missing: ${result.crashyPanel.join(", ")}`);
}

if (scenario === "labels") {
  result.topology = await labelStats();
  await shot("topology");
  await search("deployment/ns-03/app-02");
  await sleep(2000);
  result.topologyZoomed = await labelStats();
  await shot("topology-zoomed");
  await clickButton("RESET VIEW");
  await clickButton("Clusters");
  await sleep(9000);
  result.clusters = await labelStats();
  await shot("clusters");
  await clickButton("3D");
  await sleep(2000);
  result.clusters2d = await labelStats();
  await shot("clusters-2d");
  for (const [state, stats] of Object.entries(result)) {
    if (typeof stats !== "object") continue;
    if (stats.overlaps > 0) failures.push(`${state}: ${stats.overlaps} overlapping labels`);
  }
  if ((result.topology.byStyle.primary ?? 0) < 20) failures.push("topology: fewer than 20 Deployments labeled (SC-003)");
  if (!result.topologyZoomed.byStyle.detail) failures.push("topology zoomed: no Pod labels");
}

if (scenario === "layout") {
  const switchedAt = logs.length;
  await clickButton("Clusters");
  await sleep(9000);
  // SC-002 is about a settled layout: count only the updates after each view's
  // first "settled" log, not the ones that arrive while it is still relaxing.
  const afterSettle = (segment) => {
    const i = segment.findIndex((l) => l.includes("settled in"));
    return i < 0 ? [] : segment.slice(i + 1).filter((l) => l.includes("displacement")).map((l) => Number(l.match(/([0-9.]+)%/)?.[1]));
  };
  const displacement = [...afterSettle(logs.slice(0, switchedAt)), ...afterSettle(logs.slice(switchedAt))];
  const settled = logs.filter((l) => l.includes("settled in"));
  result.settled = settled;
  result.updates = displacement.length;
  result.maxDisplacementPct = Math.max(0, ...displacement);
  if (settled.length < 2) failures.push("a view never settled");
  if (result.maxDisplacementPct >= 5) failures.push(`unrelated displacement reached ${result.maxDisplacementPct}% (SC-002 is < 5%)`);
}

if (scenario === "perf") {
  result.throttle = Number(process.env.THROTTLE ?? 1);
  result.topology = await orbit();
  await clickButton("Clusters");
  await sleep(6000);
  result.clusters = await orbit();
  for (const view of ["topology", "clusters"]) if (result[view].avgFps < 30) failures.push(`${view}: ${result[view].avgFps} fps (SC-001 is ≥ 30)`);
}

if (scenario === "stream") {
  // Every patch must build on the version before it; a gap means the client
  // applied a patch to the wrong base.
  const chain = () => {
    let version = null;
    const gaps = [];
    for (const { event, data } of sse) {
      const d = JSON.parse(data);
      if (event === "snapshot") version = d.version;
      else if (d.base !== version) gaps.push(`${d.base}->${d.version} after ${version}`);
      else version = d.version;
    }
    return gaps;
  };
  const newestPod = () => {
    const patch = sse.filter((m) => m.event === "patch").map((m) => JSON.parse(m.data)).at(-1);
    return patch?.clusters[0]?.upsert?.pods?.at(-1)?.key;
  };
  const size = (event) => sse.filter((m) => m.event === event).reduce((n, m) => n + m.data.length, 0);
  const count = (event) => sse.filter((m) => m.event === event).length;

  const pod = newestPod();
  await search(pod ?? "no patch received");
  await sleep(1500);
  result.patchedPodPanel = await detailPanel();
  result.snapshotBytes = size("snapshot");
  result.patches = count("patch");
  result.patchBytes = size("patch");
  // What the same updates cost when every one resends the whole snapshot.
  result.fullSnapshotBytes = result.snapshotBytes * result.patches;

  // A restarted backend starts over at version 1, so the client must take the
  // new snapshot rather than wait for a patch on its old base.
  process.kill(Number(process.env.FAKE_PID));
  await sleep(1000);
  spawn(process.env.FAKE_BIN, process.env.FAKE_ARGS.split(" "), { stdio: "ignore", detached: true }).unref();
  await sleep(8000);
  result.snapshots = count("snapshot");
  const resyncedPod = newestPod();
  await clickButton("RESET VIEW");
  await search(resyncedPod ?? "no patch received");
  await sleep(1500);
  result.resyncedPodPanel = await detailPanel();
  result.gaps = chain();

  if (!pod || !result.patchedPodPanel?.includes(pod.split("/").at(-1))) failures.push(`pod added by a patch (${pod}) is not selectable`);
  if (result.snapshots < 2) failures.push("no new snapshot after the connection dropped");
  if (!resyncedPod || !result.resyncedPodPanel?.includes(resyncedPod.split("/").at(-1))) failures.push(`pod added after the resync (${resyncedPod}) is not selectable`);
  if (result.gaps.length) failures.push(`patches out of sequence: ${result.gaps.join(", ")}`);
}

if (scenario === "nometrics") {
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('LEGEND'))?.click(); 1`);
  await sleep(500);
  result.hint = await ev(`document.body.innerText.includes('install metrics-server')`);
  if (!result.hint) failures.push("no metrics-server hint in the legend without metrics");
}

if (scenario === "auth") {
  const text = () => ev(`document.body.innerText`);
  const signIn = (password) =>
    ev(`(async () => {
      const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(document.getElementById('galaxy-password'), ${JSON.stringify(password)});
      await new Promise((r) => setTimeout(r, 100));
      document.querySelector('form button[type=submit]').click(); return 1; })()`);
  result.loginShown = (await text()).includes("Sign in to see the cluster");
  result.anonymousStream = await ev(`fetch('/api/v1/clusters').then((r) => { r.body?.cancel(); return r.status; })`);
  await signIn("wrong-password");
  await sleep(2000);
  result.wrongPassword = (await text()).includes("Wrong username or password");
  await signIn("verify-secret");
  await sleep(6000);
  result.signedIn = (await text()).includes("TOPOLOGY");
  await shot("signed-in");
  await clickButton("Sign out");
  await sleep(1500);
  result.signedOut = (await text()).includes("Sign in to see the cluster");
  result.streamAfterSignOut = await ev(`fetch('/api/v1/clusters').then((r) => { r.body?.cancel(); return r.status; })`);
  if (!result.loginShown) failures.push("no login form before signing in");
  if (result.anonymousStream !== 401) failures.push(`anonymous stream returned ${result.anonymousStream}, not 401`);
  if (!result.wrongPassword) failures.push("wrong password did not show an error");
  if (!result.signedIn) failures.push("correct password did not load the Topology view");
  if (!result.signedOut) failures.push("sign out did not return to the login form");
  if (result.streamAfterSignOut !== 401) failures.push(`stream after sign-out returned ${result.streamAfterSignOut}, not 401`);
}

if (scenario === "webgl") {
  result.message = await ev(`document.body.innerText.includes('GALAXY NEEDS WEBGL2')`);
  if (!result.message) failures.push("no WebGL2 message with WebGL disabled");
}

const errors = logs.filter((l) => l.startsWith("EXCEPTION"));
if (errors.length) failures.push(...errors);
result.failures = failures;
console.log(JSON.stringify(result));
chrome.kill();
process.exit(failures.length ? 1 : 0);
