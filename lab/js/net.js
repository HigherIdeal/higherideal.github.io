import { ENTRY_CODE, ROOM_ID } from "./config.js?v=19";
import { addPlayer, autoChoice, createLobby, dispatch, expireDisconnects, markDisconnect, projectView } from "./engine.js?v=19";
import { identityKeys, openRelay, openSeal, publicJwk, relayNamespace, roomKey, seal, sharedKey } from "./relay.js?v=19";

const HOST_LOST_MS = 20000;
const STALE_MS = 45000;
const LISTEN_MS = 4000;

function newId() {
  return crypto.randomUUID();
}

export function connect({ playerId, nickname, onView, onStatus, onToast }) {
  const directory = new Map();
  const seen = new Set();
  const quietSince = new Map();
  const keyCache = new Map();
  let namespace = "";
  let snapKey = "";
  let cipher = null;
  let keys = null;
  let pub = null;
  let relay = null;
  let state = null;
  let isHost = false;
  let destroyed = false;
  let steppedAside = false;
  let seqSeen = 0;
  let hostPeer = "";
  let lastBeat = 0;
  let electTimer = 0;
  let ready = false;
  let openedAt = 0;
  let socketOpen = false;
  const connToken = newId();
  const helloAt = Date.now();
  const wasHost = sessionStorage.getItem("bang-role") === "host";

  const report = (mode, text) => onStatus?.({ mode, text, isHost });
  const toast = (text) => { if (text) onToast?.(text); };

  function readSnap() {
    try {
      const raw = JSON.parse(localStorage.getItem(snapKey) || "null");
      const saved = raw?.roomId === namespace ? raw.state : null;
      if (saved?.players?.some((p) => p.id === playerId)) return saved;
    } catch { /* ignore */ }
    return null;
  }

  function persist() {
    if (!state || !snapKey) return;
    try { localStorage.setItem(snapKey, JSON.stringify({ roomId: namespace, state })); } catch { /* quota */ }
  }

  function freshForeignBeat() {
    return Boolean(hostPeer && hostPeer !== playerId && Date.now() - lastBeat < HOST_LOST_MS);
  }

  function liveIds() {
    const ids = new Set([playerId]);
    for (const [id, info] of directory) {
      if (Date.now() - info.seen < HOST_LOST_MS) ids.add(id);
    }
    return [...ids];
  }

  function electionWinner() {
    const ids = liveIds();
    const rich = ids.filter((id) => (id === playerId ? Boolean(readSnap()) : directory.get(id)?.hasState));
    const pool = rich.length ? rich : ids;
    return pool.slice().sort()[0];
  }

  async function peerCipher(jwk) {
    const id = `${jwk?.x}.${jwk?.y}`;
    if (!jwk?.x || !jwk?.y) return null;
    if (keyCache.has(id)) return keyCache.get(id);
    const key = await sharedKey(keys, jwk);
    keyCache.set(id, key);
    return key;
  }

  function sendBox(box, slug) {
    relay?.send(box, slug || "");
  }

  async function publish(msg) {
    if (!cipher) return;
    sendBox(await seal(cipher, { to: "*", from: playerId, msg }));
  }

  async function direct(toId, msg, jwk, slug) {
    const key = await peerCipher(jwk);
    if (!key || !cipher) return;
    const blob = await seal(key, msg);
    sendBox(await seal(cipher, { to: toId, from: playerId, pub, blob }), slug || "");
  }

  function broadcast() {
    if (!isHost || !state) return;
    state.seq = (state.seq || 0) + 1;
    persist();
    onView(projectView(state, playerId));
    for (const p of state.players) {
      if (p.id === playerId) continue;
      const info = directory.get(p.id);
      if (!info?.pub) continue;
      direct(p.id, { kind: "state", to: p.id, view: projectView(state, p.id) }, info.pub, info.slug);
    }
  }

  function fail(to, text) {
    const info = directory.get(to);
    if (info?.pub) direct(to, { kind: "toast", to, text }, info.pub, info.slug);
    if (to === playerId) toast(text);
  }

  function apply(fromId, action) {
    if (!isHost || !state || !fromId) return;
    if (action.type !== "join" && action.type !== "disconnect" && action.actionId && seen.has(action.actionId)) return;
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
    else {
      if (action.actionId) seen.add(action.actionId);
      broadcast();
    }
  }

  function announce() {
    publish({
      kind: "hello",
      from: playerId,
      nickname,
      token: connToken,
      at: helloAt,
      pub,
      slug: relay?.slug() || "",
      hasState: Boolean(readSnap()),
    });
  }

  function beat() {
    publish({ kind: "beat", from: playerId, pub, at: Date.now() });
  }

  function stepDown() {
    isHost = false;
    sessionStorage.setItem("bang-role", "guest");
    report("search", "이미 열린 방에 들어가는 중…");
    announce();
  }

  function becomeHost(reclaim) {
    if (destroyed || steppedAside || isHost) return;
    if (!socketOpen) {
      report("error", "재연결 중…");
      return;
    }
    if (!openedAt || Date.now() - openedAt < LISTEN_MS) {
      report("search", "연결 중…");
      scheduleElect(Math.max(200, LISTEN_MS - (Date.now() - (openedAt || Date.now()))));
      return;
    }
    if (reclaim && freshForeignBeat()) return;
    if (!reclaim && electionWinner() !== playerId) return;
    isHost = true;
    hostPeer = playerId;
    lastBeat = Date.now();
    sessionStorage.setItem("bang-role", "host");
    const snap = readSnap();
    if (snap) {
      state = snap;
      state.hostId = playerId;
      const now = Date.now();
      for (const p of state.players) {
        const here = p.id === playerId;
        p.connected = here;
        if (here) delete p.disconnectedAt;
        else p.disconnectedAt = now;
      }
    } else {
      const seed = Number(localStorage.getItem("bang-seed")) || ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
      state = createLobby({ id: playerId, nickname }, seed || 1);
    }
    report("host", "당신이 방장입니다.");
    for (const [id, info] of directory) {
      if (id !== playerId && info.nickname) addPlayer(state, id, info.nickname);
    }
    beat();
    broadcast();
  }

  function pushViews() {
    if (!isHost || !state) return;
    for (const p of state.players) {
      if (p.id === playerId) continue;
      const info = directory.get(p.id);
      if (!info?.pub) continue;
      direct(p.id, { kind: "state", to: p.id, view: projectView(state, p.id) }, info.pub, info.slug);
    }
  }

  function scheduleElect(ms) {
    if (electTimer || isHost || steppedAside) return;
    electTimer = setTimeout(() => {
      electTimer = 0;
      if (isHost || steppedAside || freshForeignBeat()) return;
      if (wasHost && readSnap()?.hostId === playerId) {
        becomeHost(true);
        return;
      }
      becomeHost(false);
      if (!isHost) report("search", "방장을 기다리는 중…");
    }, ms);
  }

  function notePeer(msg) {
    if (!msg?.from || msg.from === playerId) return;
    const prev = directory.get(msg.from);
    directory.set(msg.from, {
      pub: msg.pub || prev?.pub || null,
      slug: msg.slug || prev?.slug || "",
      token: msg.token || prev?.token || "",
      at: msg.at || prev?.at || 0,
      seen: Date.now(),
      nickname: msg.nickname || prev?.nickname || "",
      hasState: Boolean(msg.hasState || prev?.hasState),
    });
  }

  function acceptHello(msg) {
    if (!isHost || !state || !msg?.from || msg.from === playerId) return;
    const prev = directory.get(msg.from);
    const arrived = msg.at || Date.now();
    if (prev?.token && msg.token && prev.token !== msg.token) {
      if (prev.at && arrived < prev.at) return;
      if (prev.pub) direct(msg.from, { kind: "replaced", token: prev.token }, prev.pub, prev.slug);
    } else if (prev?.token && prev.token === msg.token) {
      notePeer(msg);
      const info = directory.get(msg.from);
      if (info) info.seen = Date.now();
      const who = state.players.find((p) => p.id === msg.from);
      if (who && who.connected === false) {
        who.connected = true;
        delete who.disconnectedAt;
      }
      if (who && info?.pub) {
        direct(msg.from, { kind: "state", to: msg.from, view: projectView(state, msg.from) }, info.pub, info.slug);
      }
      return;
    }
    notePeer(msg);
    apply(msg.from, { type: "join", nickname: msg.nickname });
  }

  async function ingest(msg, via) {
    if (!msg || destroyed || steppedAside) return;
    if (msg.kind === "hello") {
      if (isHost) acceptHello(msg);
      else notePeer(msg);
      if (!isHost && !freshForeignBeat()) scheduleElect(700);
      return;
    }
    if (msg.kind === "ping") {
      notePeer(msg);
      if (!isHost) return;
      const info = directory.get(msg.from);
      if (!info || (msg.token && info.token && info.token !== msg.token)) return;
      info.seen = Date.now();
      const who = state?.players.find((p) => p.id === msg.from);
      if (who && who.connected === false) {
        who.connected = true;
        delete who.disconnectedAt;
        broadcast();
      }
      return;
    }
    if (msg.kind === "beat" && msg.from && msg.from !== playerId) {
      notePeer(msg);
      if (isHost) {
        if (msg.from < playerId) {
          hostPeer = msg.from;
          lastBeat = Date.now();
          stepDown();
        }
        return;
      }
      hostPeer = msg.from;
      lastBeat = Date.now();
      clearTimeout(electTimer);
      electTimer = 0;
      report("search", "방장에게 들어가는 중…");
      return;
    }
    if (msg.kind === "replaced" && msg.token === connToken) {
      steppedAside = true;
      clearTimeout(electTimer);
      relay?.stop();
      report("replaced", "다른 탭에서 이어서 입장했습니다. 이 창은 닫힙니다.");
      onView(null);
      return;
    }
    if (msg.kind === "action" && isHost) {
      const info = directory.get(msg.from);
      if (info?.token && msg.token && info.token !== msg.token) return;
      if (info) info.seen = Date.now();
      // An authenticated action is also proof the player is online.
      const who = state?.players.find((p) => p.id === msg.from);
      if (who && who.connected === false) {
        who.connected = true;
        delete who.disconnectedAt;
      }
      apply(msg.from, msg.action || {});
      return;
    }
    if (msg.kind === "state" && msg.to === playerId && !isHost) {
      const fromId = via || "";
      if (fromId && hostPeer && fromId !== hostPeer && fromId > hostPeer) return;
      if (fromId) hostPeer = fromId;
      const seq = msg.view?.seq || 0;
      if (seq < seqSeen) return;
      seqSeen = seq;
      sessionStorage.setItem("bang-role", "guest");
      report("guest", "방에 연결되었습니다.");
      onView(msg.view);
      return;
    }
    if (msg.kind === "toast" && msg.to === playerId) toast(msg.text);
  }

  async function onBox(payload) {
    if (!cipher || steppedAside) return;
    const outer = await openSeal(cipher, payload);
    if (!outer) return;
    if (outer.from && outer.pub) {
      const prev = directory.get(outer.from) || {};
      directory.set(outer.from, {
        pub: outer.pub,
        slug: prev.slug || "",
        token: prev.token || "",
        at: prev.at || 0,
        seen: Date.now(),
        nickname: prev.nickname || "",
        hasState: Boolean(prev.hasState),
      });
    }
    if (outer.to === "*") {
      ingest(outer.msg, outer.from);
      return;
    }
    if (outer.to !== playerId || !outer.blob || !outer.pub) return;
    const key = await peerCipher(outer.pub);
    if (!key) return;
    const inner = await openSeal(key, outer.blob);
    if (inner) ingest(inner, outer.from);
  }

  function onLeave(slug) {
    if (!slug) return;
    for (const info of directory.values()) {
      if (info.slug === slug) info.relayLeft = Date.now();
    }
  }

  const heartbeat = setInterval(() => {
    if (destroyed || steppedAside || !ready) return;
    if (!isHost) {
      announce();
      if (lastBeat && Date.now() - lastBeat > HOST_LOST_MS && !document.hidden) {
        lastBeat = 0;
        hostPeer = "";
        report("error", "방장 연결이 끊겼습니다. 다시 찾는 중…");
        scheduleElect(400);
      }
      return;
    }
    beat();
    pushViews();
    if (!state || document.hidden) return;
    const now = Date.now();
    let changed = expireDisconnects(state, now);
    for (const p of state.players) {
      if (p.id === playerId) continue;
      const info = directory.get(p.id);
      if (info && now - info.seen <= STALE_MS && p.connected === false) {
        p.connected = true;
        delete p.disconnectedAt;
        changed = true;
      }
      const quietFor = info ? now - info.seen : 0;
      const noTraffic = info && quietFor > STALE_MS;
      const relayGone = info?.relayLeft && quietFor > 10000;
      if (!document.hidden && p.connected !== false && (noTraffic || relayGone)) {
        markDisconnect(state, p.id, now);
        changed = true;
      }
    }
    if (changed) broadcast();
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
  }, 2000);

  window.addEventListener("pagehide", () => {
    destroyed = true;
    clearInterval(heartbeat);
    clearTimeout(electTimer);
    relay?.stop();
  }, { once: true });

  (async () => {
    try {
      namespace = await relayNamespace(ROOM_ID, ENTRY_CODE);
      snapKey = `bang-state-${namespace}`;
      cipher = await roomKey(ENTRY_CODE);
      keys = await identityKeys();
      pub = await publicJwk(keys);
    } catch {
      report("error", "연결 준비를 하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      return;
    }
    relay = openRelay({
      namespace,
      onBox,
      onLeave,
      onJoin(slug) {
        for (const info of directory.values()) {
          if (info.slug === slug) {
            info.seen = Date.now();
            info.relayLeft = 0;
          }
        }
      },
      onStatus({ phase, relay: name }) {
        if (steppedAside) return;
        if (phase === "open") {
          ready = true;
          socketOpen = true;
          openedAt = Date.now();
          announce();
          scheduleElect(LISTEN_MS);
          report("search", "연결 중…");
          return;
        }
        ready = false;
        socketOpen = false;
        if (isHost) isHost = false;
        if (phase === "fail") report("error", "재연결 중…");
        else if (phase === "retry") report("error", "재연결 중…");
        else if (name === "itty") report("error", "다른 중계로 다시 시도합니다.");
        else report("search", "연결 중…");
      },
    });
    relay.start();
    document.addEventListener("visibilitychange", () => {
      if (steppedAside || document.visibilityState !== "visible") return;
      if (relay.isOpen()) announce();
      else {
        report("error", "재연결 중…");
        relay.ensure();
      }
    });
  })();

  return {
    send(action) {
      const full = { ...action, actionId: action.actionId || newId() };
      const attemptSend = () => {
        if (isHost) {
          apply(playerId, full);
          return true;
        }
        const info = directory.get(hostPeer);
        if (!info?.pub) return false;
        direct(hostPeer, {
          kind: "action",
          from: playerId,
          token: connToken,
          at: helloAt,
          action: full,
        }, info.pub, info.slug);
        return true;
      };
      if (attemptSend()) return;
      const timer = setInterval(() => {
        if (destroyed || steppedAside || attemptSend()) clearInterval(timer);
      }, 400);
      setTimeout(() => clearInterval(timer), 8000);
    },
    takeOver() {
      if (destroyed || isHost || steppedAside) return;
      if (freshForeignBeat()) {
        report("search", "이미 열린 방에 들어가는 중…");
        return;
      }
      sessionStorage.setItem("bang-role", "host");
      becomeHost(true);
    },
  };
}
