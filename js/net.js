import { ROOM_ID } from "./config.js";
import { addPlayer, autoChoice, createLobby, dispatch, markDisconnect, projectView } from "./engine.js";

const SNAP = "bang-snapshot";
const LOCK = "bang-host-lock";

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
  let searchTimer = 0;

  const report = (mode, text) => onStatus?.({ mode, text, isHost });
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
      if (!foundHost) {
        foundHost = true;
        clearTimeout(searchTimer);
        sessionStorage.setItem("bang-role", "guest");
        sendHello(guestConn);
        report("guest", "살롱에 연결되었습니다.");
      }
      return;
    }
    if (msg.kind === "hello" && isHost) {
      if (msg.connId && conns.get(msg.from) == null && msg._conn) conns.set(msg.from, msg._conn);
      apply(msg.from, { type: "join", nickname: msg.nickname });
      return;
    }
    if (msg.kind === "action" && isHost) apply(msg.from, msg.action || {});
    if (msg.kind === "state" && msg.to === playerId && !isHost) {
      const seq = msg.view?.seq || 0;
      if (seq < seqSeen) return;
      seqSeen = seq;
      foundHost = true;
      onView(msg.view);
    }
    if (msg.kind === "toast" && msg.to === playerId) toast(msg.text);
  }

  channel.onmessage = (event) => ingest(event.data);

  function bindGuest(conn) {
    guestConn = conn;
    conn.on("data", (msg) => ingest(msg));
    conn.on("close", () => {
      if (guestConn === conn) guestConn = null;
      if (!destroyed && !isHost) {
        foundHost = false;
        report("lost", "방장과 연결이 끊겼습니다. 다시 찾는 중…");
        setTimeout(() => { if (!destroyed && !isHost) tryJoin(); }, 1200);
      }
    });
  }

  function openHostPeer() {
    try { peer?.destroy(); } catch { /* already gone */ }
    peer = new window.Peer(ROOM_ID, peerOptions());
    peer.on("open", () => {
      report("host", "당신이 방장입니다.");
      broadcast();
    });
    peer.on("connection", (conn) => {
      conn.on("data", (msg) => {
        if (!msg) return;
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
    peer.on("disconnected", () => {
      if (destroyed || !isHost) return;
      try { peer.reconnect(); } catch { openHostPeer(); }
    });
    peer.on("error", (err) => {
      if (err?.type === "unavailable-id") {
        if (sessionStorage.getItem("bang-restoring") === "1") {
          report("host", "방장 자리를 되찾는 중…");
          setTimeout(() => { if (!destroyed && isHost) openHostPeer(); }, 1500);
          return;
        }
        isHost = false;
        foundHost = false;
        state = null;
        sessionStorage.setItem("bang-role", "guest");
        report("search", "이미 열린 살롱에 들어가는 중…");
        setTimeout(() => { if (!destroyed && !isHost) tryJoin(); }, 400);
      } else if (!destroyed) toast("실시간 연결이 불안정합니다. 같은 브라우저 탭끼리는 이어서 진행됩니다.");
    });
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

  function becomeHost(fresh) {
    if (destroyed || isHost) return;
    if (!claimLock()) {
      sessionStorage.setItem("bang-role", "guest");
      tryJoin();
      return;
    }
    isHost = true;
    foundHost = true;
    sessionStorage.setItem("bang-role", "host");
    let restored = null;
    if (!fresh) {
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
    if (window.Peer) openHostPeer();
    else report("host", "당신이 방장입니다. (이 브라우저 안에서)");
    broadcast();
  }

  function tryJoin() {
    if (destroyed || isHost) return;
    report("search", "살롱을 찾는 중…");
    channel.postMessage({ kind: "discover", from: playerId });
    clearTimeout(searchTimer);
    if (window.Peer) {
      try { peer?.destroy(); } catch { /* ignore */ }
      peer = new window.Peer(undefined, peerOptions());
      peer.on("open", () => {
        const conn = peer.connect(ROOM_ID, { reliable: true, serialization: "json" });
        let opened = false;
        const giveUp = setTimeout(() => {
          if (opened || isHost || destroyed) return;
          try { conn.close(); } catch { /* ignore */ }
          if (!foundHost && !otherHoldsLock() && sessionStorage.getItem("bang-role") !== "guest") becomeHost(false);
          else if (!foundHost) report("lost", "방장을 아직 찾지 못했습니다.");
        }, 2800);
        conn.on("open", () => {
          opened = true;
          foundHost = true;
          clearTimeout(giveUp);
          clearTimeout(searchTimer);
          sessionStorage.setItem("bang-role", "guest");
          bindGuest(conn);
          sendHello(conn);
          report("guest", "살롱에 연결되었습니다.");
        });
        conn.on("error", () => { /* giveUp handles it */ });
      });
      peer.on("error", () => { /* giveUp or search timer handles it */ });
    }
    searchTimer = setTimeout(() => {
      if (destroyed || isHost || foundHost) return;
      if (otherHoldsLock() || sessionStorage.getItem("bang-role") === "guest") {
        report("lost", "방장을 아직 찾지 못했습니다.");
        return;
      }
      becomeHost(false);
    }, 3200);
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
    if (!isHost) return;
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
    clearTimeout(searchTimer);
    try { peer?.destroy(); } catch { /* ignore */ }
    try { channel.close(); } catch { /* ignore */ }
  }, { once: true });

  if (sessionStorage.getItem("bang-role") === "host") becomeHost(false);
  else tryJoin();

  return {
    send,
    takeOver() {
      try { peer?.destroy(); } catch { /* ignore */ }
      peer = null;
      guestConn = null;
      isHost = false;
      foundHost = false;
      sessionStorage.setItem("bang-role", "host");
      localStorage.removeItem(SNAP);
      becomeHost(true);
    },
  };
}
