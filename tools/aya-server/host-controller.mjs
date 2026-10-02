import fs from "node:fs";
import path from "node:path";
import { WebSocket } from "ws";
const origin = process.env.AYA_CONTROL_ORIGIN || "http://127.0.0.1:3074";
const cdp = process.env.AYA_CDP_ORIGIN || "http://127.0.0.1:9234";
for (const value of [origin, cdp])
  if (new URL(value).hostname !== "127.0.0.1")
    throw Error("Controller endpoints must remain loopback-only");
const key = fs
  .readFileSync(
    process.env.AYA_HOST_KEY_FILE ||
      "/home/aiedue/aya-private-preview/host-key",
    "utf8",
  )
  .trim();
const map = path.resolve(process.env.AYA_MAP_PATH || "test-park.rbxlx");
const h = await (await fetch(origin + "/health")).json();
if (h.ready && h.hostConnected && process.env.AYA_FORCE_RESTART !== "1") {
  console.log("Existing 에이두 로블 host ready");
  process.exit(0);
}
if (h.players > 0) throw Error("Refusing to restart an occupied game");
let info;
for (let i = 0; i < 40; i++) {
  try {
    info = await (await fetch(cdp + "/json/version")).json();
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!info?.webSocketDebuggerUrl)
  throw Error("Private browser CDP did not become ready");
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.once("open", resolve);
  ws.once("error", reject);
});
let seq = 0;
const pending = new Map();
ws.on("message", (raw) => {
  const x = JSON.parse(raw);
  if (x.id && pending.has(x.id)) {
    const p = pending.get(x.id);
    pending.delete(x.id);
    clearTimeout(p.timer);
    x.error ? p.reject(Error(x.error.message)) : p.resolve(x.result);
  }
});
ws.on("close", () => {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(Error("Browser control connection closed"));
  }
  pending.clear();
});
const cmd = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error("CDP timeout: " + method));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(
      JSON.stringify({
        id,
        method,
        params,
        ...(sessionId ? { sessionId } : {}),
      }),
    );
  });
try {
  const { targetInfos } = await cmd("Target.getTargets");
  for (const t of targetInfos)
    if (
      t.type === "page" &&
      t.url.startsWith(origin + "/runtime?apptype=server")
    )
      await cmd("Target.closeTarget", { targetId: t.targetId });
  for (let i = 0; i < 30; i++) {
    if (!(await (await fetch(origin + "/health")).json()).hostConnected) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const { targetId } = await cmd("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cmd("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const rpc = (method, params) => cmd(method, params, sessionId);
  await rpc("Page.enable", {});
  await rpc("Runtime.enable", {});
  await rpc("Network.enable", {});
  await rpc("Network.setCacheDisabled", { cacheDisabled: true });
  const init = `(()=>{const original=window.fetch.bind(window),key=${JSON.stringify(key)},origin=${JSON.stringify(origin)};window.fetch=(input,options={})=>{const u=new URL(input instanceof Request?input.url:String(input),location.href);if(u.origin===origin&&u.pathname==='/game-host/create'){const headers=new Headers(options.headers||(input instanceof Request?input.headers:undefined));headers.set('x-aya-host-key',key);return original(input,{...options,headers})}return original(input,options)}})()`;
  await rpc("Page.addScriptToEvaluateOnNewDocument", { source: init });
  await rpc("Page.navigate", {
    url: origin + "/runtime?apptype=server&embedded=1&u=AiedueRoblHost&uid=1",
  });
  const evaluate = async (expression) => {
    const x = await rpc("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (x.exceptionDetails) throw Error(x.exceptionDetails.text);
    return x.result.value;
  };
  let formReady = false;
  for (let i = 0; i < 80; i++) {
    if (await evaluate("!!document.getElementById('srv-place-file')")) {
      formReady = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!formReady) throw Error("Host form did not load");
  const { root } = await rpc("DOM.getDocument", {});
  const { nodeId } = await rpc("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "#srv-place-file",
  });
  await rpc("DOM.setFileInputFiles", { nodeId, files: [map] });
  await evaluate(
    "document.getElementById('srv-max-players').value='8';document.getElementById('srv-start-button').click()",
  );
  let state;
  for (let i = 0; i < 120; i++) {
    state = await evaluate(
      "({code:document.getElementById('srv-connect-code')?.textContent?.trim(),log:document.getElementById('srv-log')?.textContent,error:document.getElementById('srv-error')?.textContent})",
    );
    if (state.code && state.log?.includes("Server ready. Keep this tab open."))
      break;
    if (
      state.error ||
      /Aborted\(|Failed to start|RuntimeError/.test(state.log || "")
    )
      throw Error("Native host startup failed: " + (state.error || ""));
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!state?.code || !state.log?.includes("Server ready. Keep this tab open."))
    throw Error("Native host readiness timeout");
  const ready = await fetch(origin + "/host-ready", {
    method: "POST",
    headers: { "x-aya-host-key": key },
  });
  if (!ready.ok) throw Error("Readiness publication failed");
  console.log(
    JSON.stringify({
      game: "에이두 로블",
      nativeReady: true,
      map: path.basename(map),
      connectCode: state.code,
    }),
  );
} finally {
  ws.close();
}
