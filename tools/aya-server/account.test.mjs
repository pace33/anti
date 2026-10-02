import { test } from "node:test";
import assert from "node:assert/strict";
import { makeServer, joinSettings } from "./server.mjs";
import { playerNameForProfile } from "./account.mjs";
import { WebSocket } from "ws";
import { once } from "node:events";
test("account names match Craft exactly; roles/codes are not inferred from caller nicknames", () => {
  assert.equal(
    playerNameForProfile({ role: "student", userCode: 22 }, "22@abc.com"),
    "aiedue22",
  );
  assert.equal(
    playerNameForProfile({ role: "teacher" }, "y5496694@gmail.com"),
    "y5496694",
  );
  assert.equal(
    playerNameForProfile({ role: "teacher" }, "a.b+c@gmail.com"),
    "a.b+c",
  );
  assert.throws(() =>
    playerNameForProfile({ role: "student" }, "someone@gmail.com"),
  );
  assert.throws(() => playerNameForProfile({ role: "admin", userCode: 22 }));
  const u = new URL(
    "http://x/game/join.ashx?username=spoof&userId=3&websocketUrl=webrtc://100000001",
  );
  const s = joinSettings(u, "http://x", { name: "aiedue22", userId: 1234 });
  assert.equal(s.UserName, "aiedue22");
  assert.equal(s.UserId, 1234);
});
test("account launch, single-use cookie exchange, resource gate and native packet relay", async () => {
  const key = "test-host",
    s = makeServer({
      hostKey: key,
      requireAuth: true,
      relay: true,
      publicOrigin: "http://class.example/robl",
      verifyAccount: async (token) => {
        if (token !== "test-account") throw Error("denied");
        return {
          uid: "test-uid",
          name: "aiedue22",
          userId: 1234,
          role: "student",
          expires: Date.now() + 600000,
        };
      },
    });
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  const port = s.address().port,
    base = `http://127.0.0.1:${port}`;
  const pub = (headers = {}) => ({
    Host: "class.example",
    "x-robl-public": "1",
    ...headers,
  });
  const post = async (p, b = {}, headers = pub()) => {
    const r = await fetch(base + p, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    return [r, await r.json()];
  };
  let host, guest;
  try {
    assert.equal(
      (await fetch(base + "/runtime/Aya.App.wasm", { headers: pub() })).status,
      401,
    );
    assert.equal((await post("/launch")).at(0).status, 401);
    assert.equal(
      (await post("/game-host/create", {}, pub({ "x-aya-host-key": key }))).at(
        0,
      ).status,
      401,
    );
    const [l, v] = await post(
      "/launch",
      { name: "spoof" },
      pub({ Authorization: "Bearer test-account" }),
    );
    assert.equal(l.status, 200);
    assert.equal(v.name, "aiedue22");
    const ticket = new URL(v.launchUrl).hash.slice(8);
    const [r, a] = await post("/session", { ticket });
    assert.equal(a.name, "aiedue22");
    const cookie = r.headers.get("set-cookie").split(";")[0];
    assert.equal((await post("/session", { ticket })).at(0).status, 401);
    const join = await fetch(
      base +
        "/game/join.ashx?username=spoof&userId=9&websocketUrl=webrtc://100000001",
      { headers: pub({ Cookie: cookie }) },
    );
    assert.equal(JSON.parse(await join.text()).UserName, "aiedue22");
    const [, hc] = await post(
      "/game-host/create",
      {},
      { "x-aya-host-key": key },
    );
    host = new WebSocket(`ws://127.0.0.1:${port}${hc.websocketUrl}`);
    await once(host, "open");
    await post("/host-ready", {}, { "x-aya-host-key": key });
    const [, gc] = await post(
      "/game-host/join",
      { connectCode: "100000001" },
      pub({ Cookie: cookie }),
    );
    const hq = [];
    host.on("message", (b, binary) => {
      if (binary) hq.push(b);
    });
    guest = new WebSocket(`ws://127.0.0.1:${port}${gc.websocketUrl}`, {
      headers: pub({ Cookie: cookie }),
    });
    await once(guest, "open");
    const packet = Buffer.from([1, 0, 0, 0, 42, 43]);
    guest.send(packet);
    for (let i = 0; i < 20 && !hq.length; i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(hq[0].readUInt32LE(0), 1);
    assert.deepEqual([...hq[0].subarray(4)], [42, 43]);
    assert.equal(
      (
        await post(
          "/game-host/join",
          { connectCode: "100000001" },
          pub({ Cookie: cookie }),
        )
      ).at(0).status,
      409,
    );
  } finally {
    host?.terminate();
    guest?.terminate();
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
});
