import { ROOM_ID } from "./config.js?v=8";
import { addPlayer, autoChoice, createLobby, dispatch, expireDisconnects, markDisconnect, projectView } from "./engine.js?v=8";

const SNAP = `bang-state-${ROOM_ID}`;
const LOCK = "bang-host-lock";
const JOIN_TIMEOUT_MS = 12000;
const RETRY_MS = 700;
const PING_MS = 3000;
const STALE_MS = 12000;

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
  let steppedAside = false;
  let lastPing = 0;
  const connToken = newId();
  const helloAt = Date.now();
  const sessions = new Map();

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
    if (!state) return;
    try { localStorage.setItem(SNAP, JSON.stringify({ roomId: ROOM_ID, state })); } catch { /* quota */ }
  }

  function readSnap() {
    try {
      const raw = JSON.parse(localStorage.getItem(SNAP) || "null");
      const saved = raw?.roomId === ROOM_ID ? raw.state : raw;
      if (saved?.hostId === playerId && Array.isArray(saved.players)) return saved;
    } catch { /* ignore bad snapshot */ }
    return null;
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
      broadcast();
      return;
    }
    const result = dispatch(state, fromId, action);
    if (!result.ok) fail(fromId, result.error);
    else broadcast();
  }

  function sendHello(conn) {
    const msg = { kind: "hello", from: playerId, nickname, token: connToken, at: helloAt };
    if (conn?.open) {
      try { conn.send(msg); } catch { /* closed */ }
    }
    channel.postMessage(msg);
  }

  function dismiss(conn, token) {
    if (!token) return;
    const msg = { kind: "replaced", token };
    if (conn?.open) {
      try { conn.send(msg); } catch { /* closed */ }
    }
    channel.postMessage(msg);
  }

  function acceptHello(from, nickname, token, at, conn) {
    if (!isHost || !state || !from) return;
    if (from === playerId) {
      dismiss(conn, token);
      return;
    }
    const prev = sessions.get(from);
    const arrived = at || Date.now();
    if (prev?.token && token && prev.token !== token) {
      if (prev.at && arrived < prev.at) return;
      const old = prev.conn;
      sessions.set(from, { token, conn: conn || null, seen: Date.now(), at: arrived });
      if (conn) {
        conn.__pid = from;
        conns.set(from, conn);
      }
      dismiss(old, prev.token);
      if (old && old !== conn) {
        try { old.close(); } catch { /* already closed */ }
      }
    } else {
      const next = conn || prev?.conn || null;
      if (next) {
        next.__pid = from;
        conns.set(from, next);
      }
      sessions.set(from, { token: token || prev?.token || "", conn: next, seen: Date.now(), at: arrived || prev?.at || Date.now() });
    }
    apply(from, { type: "join", nickname });
  }

  function stepAside() {
    if (steppedAside) return;
    steppedAside = true;
    clearTimeout(retryTimer);
    report("replaced", "다른 탭에서 이어서 입장했습니다. 이 창은 닫힙니다.");
    onView(null);
    try { guestConn?.close(); } catch { /* ignore */ }
    try { peer?.destroy(); } catch { /* ignore */ }
    peer = null;
    guestConn = null;
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
    if (msg.kind === "replaced" && msg.token === connToken) {
      stepAside();
      return;
    }
    if (msg.kind === "hello" && isHost) {
      acceptHello(msg.from, msg.nickname, msg.token, msg.at, msg._conn || null);
      return;
    }
    if (msg.kind === "ping" && isHost) {
      const sess = sessions.get(msg.from);
      if (!sess || (msg.token && sess.token && sess.token !== msg.token)) return;
      sess.seen = Date.now();
      const who = state?.players.find((p) => p.id === msg.from);
      if (who && who.connected === false) {
        who.connected = true;
        delete who.disconnectedAt;
        broadcast();
      }
      return;
    }
    if (msg.kind === "action" && isHost) {
      const sess = sessions.get(msg.from);
      if (sess?.token && msg.token && sess.token !== msg.token) return;
      if (sess) sess.seen = Date.now();
      apply(msg.from, msg.action || {});
    }
    if (msg.kind === "state" && msg.to === playerId && !isHost && !steppedAside) {
      const seq = msg.view?.seq || 0;
      if (seq < seqSeen) return;
      seqSeen = seq;
      foundHost = true;
      roomMisses = 0;
      const reclaiming = sessionStorage.getItem("bang-role") === "host";
      sessionStorage.setItem("bang-role", "guest");
      if (mode !== "guest" || reclaiming) {
        mode = "guest";
        report("guest", "방에 연결되었습니다.");
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
      if (!destroyed && !isHost && !steppedAside) fn();
    }, ms);
  }

  function bindGuest(conn) {
    guestConn = conn;
    conn.on("data", (msg) => ingest(msg));
    conn.on("close", () => {
      if (guestConn !== conn || destroyed || isHost || steppedAside) return;
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
    report("guest", reclaiming ? "방장 자리를 되찾는 중…" : "방에 연결되었습니다.");
  }

  function activateHost(restore) {
    isHost = true;
    foundHost = true;
    mode = "host";
    roomMisses = 0;
    sessionStorage.setItem("bang-role", "host");
    let restored = null;
    if (restore) restored = readSnap();
    if (restored) sessionStorage.setItem("bang-restoring", "1");
    else sessionStorage.removeItem("bang-restoring");
    if (restored) {
      state = restored;
      const now = Date.now();
      for (const p of state.players) {
        const here = p.id === playerId;
        p.connected = here;
        if (here) delete p.disconnectedAt;
        else p.disconnectedAt = now;
      }
      sessions.clear();
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
    report("search", "방을 여는 중…");
    claim(false);
  }

  function failJoin() {
    const role = sessionStorage.getItem("bang-role");
    if (role === "host") {
      report("search", "방장 자리를 되찾는 중…");
      armRetry(() => claim(true), RETRY_MS);
      return;
    }
    report("error", "방에 연결하지 못했습니다. 다시 시도합니다.");
    armRetry(join, RETRY_MS);
  }

  function join() {
    if (destroyed || isHost || steppedAside) return;
    clearTimeout(retryTimer);
    const token = ++attempt;
    mode = "joining";
    const role = sessionStorage.getItem("bang-role");
    report("search", role === "host" ? "방장 자리를 되찾는 중…" : "방을 찾는 중…");
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
    if (destroyed || isHost || steppedAside) return;
    clearTimeout(retryTimer);
    const token = ++attempt;
    mode = "claiming";
    if (otherHoldsLock() || !claimLock()) {
      report("search", "이미 열린 방에 들어가는 중…");
      armRetry(join, 300);
      return;
    }
    report("search", restore ? "방장 자리를 되찾는 중…" : "방을 여는 중…");
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
        ingest({ ...msg, _conn: conn });
      });
      conn.on("close", () => {
        const pid = conn.__pid;
        if (!pid || sessions.get(pid)?.conn !== conn) return;
        sessions.delete(pid);
        conns.delete(pid);
        apply(pid, { type: "disconnect" });
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
        report("search", restore ? "방장 자리를 되찾는 중…" : "이미 열린 방에 들어가는 중…");
        armRetry(join, 350);
        return;
      }
      if (settled || isHost) return;
      settled = true;
      releaseLock();
      report("error", "방을 열지 못했습니다. 다시 시도합니다.");
      armRetry(() => (restore ? claim(true) : join()), RETRY_MS);
    });
  }

  function send(action) {
    const full = { ...action, actionId: action.actionId || newId() };
    if (isHost) {
      apply(playerId, full);
      return;
    }
    const msg = { kind: "action", from: playerId, token: connToken, action: full };
    channel.postMessage(msg);
    if (guestConn?.open) {
      try { guestConn.send(msg); } catch { /* closed */ }
    }
  }

  const heartbeat = setInterval(() => {
    if (destroyed || steppedAside) return;
    if (!isHost) {
      if (guestConn?.open && seqSeen === 0) {
        sendHello(guestConn);
        // A refreshed host can attach to its own dying socket. If that socket
        // never sends the room, take the id back instead of sitting in an empty room.
        if (sessionStorage.getItem("bang-role") === "host" && guestSince && Date.now() - guestSince > 4000) {
          claim(true);
        }
      }
      if (Date.now() - lastPing >= PING_MS && (guestConn?.open || foundHost)) {
        lastPing = Date.now();
        const ping = { kind: "ping", from: playerId, token: connToken };
        if (guestConn?.open) {
          try { guestConn.send(ping); } catch { /* closed */ }
        }
        channel.postMessage(ping);
      }
      return;
    }
    localStorage.setItem(LOCK, JSON.stringify({ id: playerId, ts: Date.now() }));
    channel.postMessage({ kind: "host-here", hostId: playerId });
    if (!state) return;
    const now = Date.now();
    let presenceChanged = expireDisconnects(state, now);
    for (const p of state.players) {
      if (p.id === playerId) continue;
      const sess = sessions.get(p.id);
      if (p.connected !== false && sess && now - sess.seen > STALE_MS) {
        markDisconnect(state, p.id, now);
        presenceChanged = true;
      }
    }
    if (presenceChanged) broadcast();
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
