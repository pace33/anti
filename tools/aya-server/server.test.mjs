import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { WebSocket } from "ws";
import { makeServer, joinSettings } from "./server.mjs";

test("join settings keep engine, account, and asset scope local", () => {
  const u = new URL(
    "http://localhost/game/join.ashx?username=AiedueTest&userId=1001&websocketUrl=webrtc://100000001",
  );
  const j = joinSettings(u, "http://localhost");
  assert.equal(j.UserName, "AiedueTest");
  assert.equal(j.BaseUrl, "http://localhost/");
  assert.equal(j.CharacterAppearance, "");
  assert.equal(j.MachineAddress, "webrtc://100000001");
  for (const val of ["0", "NaN", "9007199254740992"]) {
    u.searchParams.set("userId", val);
    assert.throws(() => joinSettings(u, "http://localhost"));
  }
  u.searchParams.set("userId", "1001");
  u.searchParams.set("username", "<script>");
  assert.throws(() => joinSettings(u, "http://localhost"));
});

test("private room authentication, own signaling, ranges, and lifecycle", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aya-test-"));
  fs.writeFileSync(
    path.join(tmp, "Aya.App.wasm"),
    Buffer.from([0, 97, 115, 109, 1, 2, 3, 4]),
  );
  const server = makeServer({ runtimeDir: tmp, hostKey: "unit-private-key" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const post = async (p, b = {}, key = "") =>
    fetch(origin + p, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "x-aya-host-key": key } : {}),
      },
      body: JSON.stringify(b),
    });
  try {
    const settings = await fetch(
      origin +
        "/game/join.ashx?username=RoblTest&userId=1001&websocketUrl=webrtc://100000001",
    );
    assert.match(settings.headers.get("content-type"), /^text\/plain/);
    const payload = await settings.text();
    assert.ok(payload.startsWith("\r\n{"));
    assert.equal(JSON.parse(payload.slice(2)).UserName, "RoblTest");
    assert.equal((await post("/game-host/create")).status, 403);
    assert.equal(
      (await post("/game-host/join", { connectCode: "100000001" })).status,
      503,
    );
    const r = await post("/game-host/create", {}, "unit-private-key");
    assert.equal(r.status, 200);
    const cfg = await r.json();
    const host = new WebSocket(
      origin.replace("http:", "ws:") + cfg.websocketUrl,
    );
    sockets.push(host);
    const hello = once(host, "message");
    await once(host, "open");
    assert.equal(JSON.parse((await hello)[0]).peerId, "host");
    assert.equal((await post("/host-ready")).status, 403);
    assert.equal(
      (await post("/host-ready", {}, "unit-private-key")).status,
      200,
    );
    const join = await (
      await post("/game-host/join", {
        connectCode: cfg.connectCode,
        userId: 99,
      })
    ).json();
    const joined = once(host, "message");
    const guest = new WebSocket(
      origin.replace("http:", "ws:") + join.websocketUrl,
    );
    sockets.push(guest);
    const guestHello = once(guest, "message");
    await once(guest, "open");
    const guestId = JSON.parse((await guestHello)[0]).peerId;
    assert.equal(JSON.parse((await joined)[0]).peerId, guestId);
    const offer = once(guest, "message");
    host.send(
      JSON.stringify({
        type: "offer",
        target: guestId,
        sdp: { type: "offer", sdp: "test" },
      }),
    );
    assert.equal(JSON.parse((await offer)[0]).fromPeer, "host");
    const answer = once(host, "message");
    guest.send(
      JSON.stringify({
        type: "answer",
        target: "host",
        sdp: { type: "answer", sdp: "test" },
      }),
    );
    assert.equal(JSON.parse((await answer)[0]).fromPeer, guestId);
    const health = await (await fetch(origin + "/health")).json();
    assert.equal(health.ready, true);
    assert.equal(health.players, 1);
    const range = await fetch(origin + "/runtime/Aya.App.wasm", {
      headers: { range: "bytes=0-3" },
    });
    assert.equal(range.status, 206);
    assert.equal(
      range.headers.get("cross-origin-embedder-policy"),
      "require-corp",
    );
    assert.equal((await range.arrayBuffer()).byteLength, 4);
    assert.equal(
      (
        await fetch(origin + "/runtime/Aya.App.wasm", {
          headers: { range: "bytes=99-100" },
        })
      ).status,
      416,
    );
    assert.equal(
      (await fetch(origin + "/runtime/..%2Fserver.mjs")).status,
      404,
    );
    const closed = once(guest, "close");
    host.close();
    await closed;
    await new Promise((r) => setTimeout(r, 20));
    assert.equal((await (await fetch(origin + "/health")).json()).ready, false);
  } finally {
    for (const ws of sockets) ws.terminate();
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
