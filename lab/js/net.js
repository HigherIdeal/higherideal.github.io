import { ROOM_ID } from "./config.js?v=7";
import { addPlayer, autoChoice, createLobby, dispatch, markDisconnect, projectView } from "./engine.js?v=7";

const SNAP = "bang-snapshot";
const LOCK = "bang-host-lock";
const JOIN_TIMEOUT_MS = 12000;
const RETRY_MS = 700;

function peerOptions() {
  return {
    host: "0.peerjs.com",
    secure: true,
    port: 443,
    path: "/",
    debug: 0,
  };
}

function newId() {
  return crypto.randomUUID();
}

export function connect({ playerId, nickname, onView, onStatus, onToast }) {
  const channel = new BroadcastChannel(`bang-${ROOM_ID}`);
  const conns = new Map();
  const seen = new Set();
  const quietSince = new Map();
  let peer = null;
  let guestConn = null;
  let isHost = false;
  let state = null;
  let destroyed = false;
  let seqSeen = 0;
  let foundHost = false;
  let mode = "idle";
  let attempt = 0;
  let retryTimer = 0;
  let roomMisses = 0;
  let guestSince = 0;

  const report = (kind, text) => onStatus?.({ mode: kind, text, isHost });
  const toast = (text) => { if (text) onToast?.(text); };

  function seenAction(id) {
    if (!id) return false;
    if (seen.has(id)) return true;
    seen.add(id);
    if (seen.size > 600) seen.delete(seen.values().next().value);
    return false;
  }

  function persist() {
    try { localStorage.setItem(SNAP, JSON.stringify(state)); } catch { /* quota */ }
  }

  function broadcast() {
    if (!isHost || !state) return;
    state.seq = (state.seq || 0) + 1;
    persist();
    onView(projectView(state, playerId));
    for (const p of state.players) {
      if (p.id === playerId) continue;
      const msg = { kind: "state", to: p.id, view: projectView(state, p.id) };
      const conn = conns.get(p.id);
      if (conn?.open) {
        try { conn.send(msg); } catch { /* closed */ }
      }
      channel.postMessage(msg);
    }
  }

  function fail(to, text) {
    const msg = { kind: "toast", to, text };
    if (conns.get(to)?.open) {
      try { conns.get(to).send(msg); } catch { /* closed */ }
    }
    channel.postMessage(msg);
    if (to === playerId) toast(text);
  }

  function apply(fromId, action) {
    if (!isHost || !state || !fromId) return;
    if (action.type !== "join" && action.type !== "disconnect" && seenAction(action.actionId)) return;
    if (action.type === "join") {
      const result = addPlayer(state, fromId, action.nickname);
      if (!result.ok) fail(fromId, result.error);
      else broadcast();
      return;
    }
    if (action.type === "disconnect") {
      markDisconnect(state, fromId);
      conns.delete(fromId);
      broadcast();
      return;
    }
    const result = dispatch(state, fromId, action);
    if (!result.ok) fail(fromId, result.error);
    else broadcast();
  }

  function sendHello(conn) {
    const msg = { kind: "hello", from: playerId, nickname };
    if (conn?.open) {
      try { conn.send(msg); } catch { /* closed */ }
    }
    channel.postMessage(msg);
  }

  function ingest(msg) {
    if (!msg || destroyed) return;
    if (msg.kind === "discover" && isHost) {
      channel.postMessage({ kind: "host-here", hostId: playerId });
      return;
    }
    if (msg.kind === "host-here" && !isHost && msg.hostId !== playerId) {
      foundHost = true;
      if (mode === "claiming") {
        sessionStorage.setItem("bang-role", "guest");
        join();
        return;
      }
      if (!guestConn?.open) sendHello(null);
      return;
    }
    if (msg.kind === "hello" && isHost) {
      apply(msg.from, { type: "join", nickname: msg.nickname });
      return;
    }
    if (msg.kind === "action" && isHost) apply(msg.from, msg.action || {});
    if (msg.kind === "state" && msg.to === playerId && !isHost) {
      const seq = msg.view?.seq || 0;
      if (seq < seqSeen) return;
      seqSeen = seq;
      foundHost = true;
      roomMisses = 0;
      const reclaiming = sessionStorage.getItem("bang-role") === "host";
      sessionStorage.setItem("bang-role", "guest");
      if (mode !== "guest" || reclaiming) {
        mode = "guest";
        report("guest", "살롱에 연결되었습니다.");
      }
      onView(msg.view);
    }
    if (msg.kind === "toast" && msg.to === playerId) toast(msg.text);
  }

  channel.onmessage = (event) => ingest(event.data);

  function destroyPeer() {
    const old = peer;
    peer = null;
    guestConn = null;
    try { old?.destroy(); } catch { /* already gone */ }
  }

  function releaseLock() {
    try {
      const cur = JSON.parse(localStorage.getItem(LOCK) || "null");
      if (cur?.id === playerId) localStorage.removeItem(LOCK);
    } catch { /* ignore */ }
  }

  function otherHoldsLock() {
    try {
      const cur = JSON.parse(localStorage.getItem(LOCK) || "null");
      return Boolean(cur && cur.id !== playerId && Date.now() - cur.ts < 4000);
    } catch { return false; }
  }

  function claimLock() {
    try {
      const now = Date.now();
      const cur = JSON.parse(localStorage.getItem(LOCK) || "null");
      if (cur && cur.id !== playerId && now - cur.ts < 4000) return false;
      localStorage.setItem(LOCK, JSON.stringify({ id: playerId, ts: now }));
      const again = JSON.parse(localStorage.getItem(LOCK) || "null");
      return again?.id === playerId;
    } catch { return true; }
  }

  function armRetry(fn, ms) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (!destroyed && !isHost) fn();
    }, ms);
  }

  function bindGuest(conn) {
    guestConn = conn;
    conn.on("data", (msg) => ingest(msg));
    conn.on("close", () => {
      if (guestConn !== conn || destroyed || isHost) return;
      guestConn = null;
      foundHost = true;
      mode = "joining";
      report("error", "방장과 연결이 끊겼습니다. 다시 찾는 중…");
      armRetry(join, RETRY_MS);
    });
  }

  function becomeGuest(conn) {
    roomMisses = 0;
    isHost = false;
    foundHost = true;
    mode = "guest";
    const reclaiming = sessionStorage.getItem("bang-role") === "host";
    if (!reclaiming) sessionStorage.setItem("bang-role", "guest");
    sessionStorage.removeItem("bang-restoring");
    releaseLock();
    bindGuest(conn);
    sendHello(conn);
    guestSince = Date.now();
    report("guest", reclaiming ? "방장 자리를 되찾는 중…" : "살롱에 연결되었습니다.");
  }

  function activateHost(restore) {
    isHost = true;
    foundHost = true;
    mode = "host";
    roomMisses = 0;
    sessionStorage.setItem("bang-role", "host");
    let restored = null;
    if (restore) {
      try {
        const snap = JSON.parse(localStorage.getItem(SNAP) || "null");
        if (snap?.hostId === playerId && Array.isArray(snap.players)) restored = snap;
      } catch { /* ignore bad snapshot */ }
    }
    if (restored) sessionStorage.setItem("bang-restoring", "1");
    else sessionStorage.removeItem("bang-restoring");
    if (restored) {
      state = restored;
      for (const p of state.players) p.connected = p.id === playerId;
      const me = state.players.find((p) => p.id === playerId);
      if (me) me.nickname = nickname;
      else addPlayer(state, playerId, nickname);
    } else {
      const seed = Number(localStorage.getItem("bang-seed")) || ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
      state = createLobby({ id: playerId, nickname }, seed || 1);
    }
    localStorage.setItem(LOCK, JSON.stringify({ id: playerId, ts: Date.now() }));
    channel.postMessage({ kind: "host-here", hostId: playerId });
    report("host", "당신이 방장입니다.");
    broadcast();
  }

  function onRoomMissing() {
    const role = sessionStorage.getItem("bang-role");
    if (role === "host") {
      report("search", "방장 자리를 되찾는 중…");
      armRetry(() => claim(true), 400);
      return;
    }
    // A tab that already joined, or can see the host in this browser, must not open another room.
    if (role === "guest" || foundHost) {
      roomMisses += 1;
      if (roomMisses >= 3) report("lost", "방장을 찾지 못했습니다. 다시 시도합니다.");
      else report("error", "방장과 연결이 끊겼습니다. 다시 찾는 중…");
      armRetry(join, RETRY_MS);
      return;
    }
    report("search", "살롱을 여는 중…");
    claim(false);
  }

  function failJoin() {
    const role = sessionStorage.getItem("bang-role");
    if (role === "host") {
      report("search", "방장 자리를 되찾는 중…");
      armRetry(() => claim(true), RETRY_MS);
      return;
    }
    report("error", "살롱에 연결하지 못했습니다. 다시 시도합니다.");
    armRetry(join, RETRY_MS);
  }

  function join() {
    if (destroyed || isHost) return;
    clearTimeout(retryTimer);
    const token = ++attempt;
    mode = "joining";
    const role = sessionStorage.getItem("bang-role");
    report("search", role === "host" ? "방장 자리를 되찾는 중…" : "살롱을 찾는 중…");
    channel.postMessage({ kind: "discover", from: playerId });
    destroyPeer();
    if (!window.Peer) {
      report("error", "연결 기능을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      return;
    }
    let local;
    try {
      local = new window.Peer(peerOptions());
    } catch {
      failJoin();
      return;
    }
    peer = local;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled || token !== attempt || destroyed || isHost) return;
      settled = true;
      failJoin();
    }, JOIN_TIMEOUT_MS);

    const finish = (fn) => {
      if (settled || token !== attempt || destroyed || isHost) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    local.on("open", () => {
      if (settled || token !== attempt || destroyed || isHost) return;
      let conn;
      try {
        conn = local.connect(ROOM_ID, { reliable: true, serialization: "json" });
      } catch {
        finish(failJoin);
        return;
      }
      conn.on("open", () => finish(() => becomeGuest(conn)));
      conn.on("error", (err) => {
        if (err?.type === "peer-unavailable") finish(onRoomMissing);
      });
    });

    local.on("error", (err) => {
      if (token !== attempt || destroyed) return;
      if (err?.type === "peer-unavailable") {
        finish(onRoomMissing);
        return;
      }
      if (err?.type === "unavailable-id" || settled || isHost) return;
      finish(failJoin);
    });
  }

  function claim(restore) {
    if (destroyed || isHost) return;
    clearTimeout(retryTimer);
    const token = ++attempt;
    mode = "claiming";
    if (otherHoldsLock() || !claimLock()) {
      report("search", "이미 열린 살롱에 들어가는 중…");
      armRetry(join, 300);
      return;
    }
    report("search", restore ? "방장 자리를 되찾는 중…" : "살롱을 여는 중…");
    destroyPeer();
    if (!window.Peer) {
      releaseLock();
      report("error", "연결 기능을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      return;
    }
    let local;
    try {
      local = new window.Peer(ROOM_ID, peerOptions());
    } catch {
      releaseLock();
      failJoin();
      return;
    }
    peer = local;
    let settled = false;

    local.on("open", () => {
      if (settled || token !== attempt || destroyed) return;
      settled = true;
      activateHost(restore);
    });

    local.on("connection", (conn) => {
      conn.on("data", (msg) => {
        if (!msg || token !== attempt) return;
        if (msg.kind === "hello") {
          conn.__pid = msg.from;
          conns.set(msg.from, conn);
          apply(msg.from, { type: "join", nickname: msg.nickname });
        } else if (msg.kind === "action" && conn.__pid) {
          apply(conn.__pid, msg.action || {});
        }
      });
      conn.on("close", () => {
        if (conn.__pid) apply(conn.__pid, { type: "disconnect" });
      });
    });

    local.on("disconnected", () => {
      if (destroyed || token !== attempt || !isHost) return;
      try { local.reconnect(); } catch { /* the error handler reports it */ }
    });

    local.on("error", (err) => {
      if (token !== attempt || destroyed) return;
      // The id is already owned. Attach as a client. Do not keep a private lobby.
      if (err?.type === "unavailable-id") {
        if (isHost || settled) return;
        settled = true;
        releaseLock();
        report("search", restore ? "방장 자리를 되찾는 중…" : "이미 열린 살롱에 들어가는 중…");
        armRetry(join, 350);
        return;
      }
      if (settled || isHost) return;
      settled = true;
      releaseLock();
      report("error", "살롱을 열지 못했습니다. 다시 시도합니다.");
      armRetry(() => (restore ? claim(true) : join()), RETRY_MS);
    });
  }

  function send(action) {
    const full = { ...action, actionId: action.actionId || newId() };
    if (isHost) {
      apply(playerId, full);
      return;
    }
    const msg = { kind: "action", from: playerId, action: full };
    channel.postMessage(msg);
    if (guestConn?.open) {
      try { guestConn.send(msg); } catch { /* closed */ }
    }
  }

  const heartbeat = setInterval(() => {
    if (destroyed) return;
    if (!isHost) {
      if (guestConn?.open && seqSeen === 0) {
        sendHello(guestConn);
        // A refreshed host can attach to its own dying socket. If that socket
        // never sends the room, take the id back instead of sitting in an empty room.
        if (sessionStorage.getItem("bang-role") === "host" && guestSince && Date.now() - guestSince > 4000) {
          claim(true);
        }
      }
      return;
    }
    localStorage.setItem(LOCK, JSON.stringify({ id: playerId, ts: Date.now() }));
    channel.postMessage({ kind: "host-here", hostId: playerId });
    if (!state) return;
    const actor = state.prompt?.playerId || (state.phase === "play" && state.turnPhase === "play" ? state.currentId : null);
    if (!actor) return;
    const who = state.players.find((p) => p.id === actor);
    if (!who || who.connected !== false || who.id === playerId) {
      quietSince.delete(actor);
      return;
    }
    if (!quietSince.has(actor)) quietSince.set(actor, Date.now());
    if (Date.now() - quietSince.get(actor) > 18000) {
      const choice = autoChoice(state, actor);
      if (choice) apply(actor, { ...choice, actionId: newId() });
      quietSince.set(actor, Date.now());
    }
  }, 1000);

  window.addEventListener("pagehide", () => {
    destroyed = true;
    clearInterval(heartbeat);
    clearTimeout(retryTimer);
    try { peer?.destroy(); } catch { /* ignore */ }
    try { channel.close(); } catch { /* ignore */ }
  }, { once: true });

  if (sessionStorage.getItem("bang-role") === "host") claim(true);
  else join();

  return {
    send,
    takeOver() {
      if (destroyed || isHost) return;
      foundHost = false;
      roomMisses = 0;
      sessionStorage.setItem("bang-role", "host");
      claim(false);
    },
  };
}
