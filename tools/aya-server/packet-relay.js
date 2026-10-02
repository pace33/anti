/* Aiedue native-packet relay. No ICE/STUN/TURN dependency; datagrams retain boundaries. */
(function (root) {
  "use strict";
  let socket = null,
    role = "",
    handle = 0,
    module = null,
    next = 1,
    localPeerId = "";
  const peers = new Map(),
    pending = [];
  let bytesIn = 0,
    bytesOut = 0;
  function dispatch(type, id, data) {
    if (!handle || !module) {
      if (pending.length > 4096) throw Error("Relay queue limit");
      pending.push({ type, id, data });
      return;
    }
    const fn =
      module[
        type === "open"
          ? "_aya_webrtc_transport_open"
          : type === "close"
            ? "_aya_webrtc_transport_close"
            : "_aya_webrtc_transport_message"
      ];
    if (type !== "message") {
      fn(handle, id);
      return;
    }
    const p = module._aya_webrtc_allocate(data.length);
    if (!p) throw Error("Packet allocation failed");
    try {
      module.HEAPU8.set(data, p);
      fn(handle, id, p, data.length);
    } finally {
      module._aya_webrtc_free(p);
    }
  }
  function flush() {
    if (handle && module)
      for (const e of pending.splice(0)) dispatch(e.type, e.id, e.data);
  }
  function stop() {
    socket?.close();
    socket = null;
    peers.clear();
    pending.length = 0;
    handle = 0;
    module = null;
    role = "";
  }
  root.ayaGameWebRtc = {
    async configure(c) {
      stop();
      role = c.role === "host" ? "host" : "guest";
      const u = new URL(c.websocketUrl, location.href);
      u.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      await new Promise((resolve, reject) => {
        socket = new WebSocket(u);
        socket.binaryType = "arraybuffer";
        socket.onopen = resolve;
        socket.onerror = () => reject(Error("게임 연결 실패"));
        socket.onclose = () => {
          for (const id of peers.keys()) dispatch("close", id);
          peers.clear();
        };
        socket.onmessage = (e) => {
          if (typeof e.data === "string") {
            const m = JSON.parse(e.data);
            if (m.type === "welcome") localPeerId = m.peerId;
            if (m.type === "peer-joined") {
              const id = m.connectionId;
              peers.set(id, { id, peerId: m.peerId });
              dispatch("open", id);
            }
            if (m.type === "peer-left") {
              peers.delete(m.connectionId);
              dispatch("close", m.connectionId);
            }
            if (m.type === "host-left") socket.close();
            return;
          }
          const b = new Uint8Array(e.data);
          if (b.length < 5) return;
          const id = new DataView(b.buffer).getUint32(0, true);
          if (!peers.has(id)) return;
          bytesIn += b.length - 4;
          dispatch("message", id, b.subarray(4));
        };
      });
    },
    setModule(m, r) {
      module = m;
      if (r) role = r;
      flush();
    },
    startHost(h) {
      handle = Number(h);
      flush();
      return role === "host";
    },
    connectClient(h, u) {
      if (!/^webrtc:\/\/\d{9}\/?$/.test(u)) return false;
      handle = Number(h);
      flush();
      return role === "guest";
    },
    send(h, id, value) {
      if (
        Number(h) !== handle ||
        !peers.has(Number(id)) ||
        socket?.readyState !== 1 ||
        socket.bufferedAmount > 16 * 1024 * 1024
      )
        return false;
      const b = value instanceof Uint8Array ? value : new Uint8Array(value);
      if (!b.length || b.length > 8 * 1024 * 1024) return false;
      const out = new Uint8Array(b.length + 4);
      new DataView(out.buffer).setUint32(0, Number(id), true);
      out.set(b, 4);
      socket.send(out);
      bytesOut += b.length;
      return true;
    },
    close(h, id) {
      if (Number(h) !== handle) return;
      peers.delete(Number(id));
    },
    stop,
    debugState() {
      return {
        role,
        localPeerId,
        signalingState: socket?.readyState ?? 3,
        mode: "authenticated-native-wss-relay",
        bytesIn,
        bytesOut,
        connections: [...peers.values()].map((p) => ({
          ...p,
          state: "connected",
          channel: "open",
        })),
      };
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
