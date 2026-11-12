import { ENTRY_CODE, ROOM_ID } from "./config.js?v=27";
import { addPlayer, autoChoice, claimSeat, createLobby, dispatch, expireDisconnects, markDisconnect, projectView, rebindPlayer } from "./engine.js?v=27";
import { identityKeys, openRelay, openSeal, publicJwk, relayNamespace, roomKey, seal, sharedKey } from "./relay.js?v=27";

const HOST_LOST_MS = 20000;
const STALE_MS = 45000;
const LISTEN_MS = 4000;

function newId() {
  return crypto.randomUUID();
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function passRecord(password) {
  const salt = crypto.randomUUID();
  return { salt, hash: await sha256(`${salt}:${password}`) };
}

async function passOk(record, password) {
  if (!record?.salt || !record?.hash || !password) return false;
  return (await sha256(`${record.salt}:${password}`)) === record.hash;
}

function plainName(nickname) {
  const text = String(nickname || "").replace(/\s+/g, " ").trim().slice(0, 12);
  return text || "무명";
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
  let pendingCrown = null;
  let soloSince = 0;
  const connToken = newId();
  const helloAt = Date.now();
  const wasHost = sessionStorage.getItem("bang-role") === "host";

  const report = (mode, text) => onStatus?.({ mode, text, isHost });
  const toast = (text) => { if (text) onToast?.(text); };

  function readSnap() {
    try {
      const raw = JSON.parse(localStorage.getItem(snapKey) || "null");
      const saved = raw?.roomId === namespace ? raw.state : null;
      if (!saved?.players) return null;
      if (saved.players.some((p) => p.id === playerId)) return saved;
      const seat = saved.players.find((p) => p.nickname === plainName(nickname));
      if (!seat) return null;
      rebindPlayer(saved, seat.id, playerId);
      seat.connected = true;
      delete seat.disconnectedAt;
      return saved;
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
      const result = claimSeat(state, fromId, action.nickname);
      if (!result.ok) fail(fromId, result.error);
      else broadcast();
      return;
    }
    if (action.type === "disconnect") {
      markDisconnect(state, fromId);
      const info = directory.get(fromId);
      if (info) info.seen = 0;
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
    const crownedMe = !reclaim && pendingCrown && crownedWinner() === playerId;
    if (!crownedMe) {
      if (!reclaim && electionWinner() !== playerId) return;
    }
    isHost = true;
    hostPeer = playerId;
    lastBeat = Date.now();
    sessionStorage.setItem("bang-role", "host");
    const crowned = pendingCrown;
    pendingCrown = null;
    const snap = crowned?.players ? crowned : readSnap();
    if (snap) {
      const previousHost = snap.hostId;
      state = snap;
      state.hostId = playerId;
      const now = Date.now();
      for (const p of state.players) {
        const here = p.id === playerId;
        const info = directory.get(p.id);
        const live = info && now - info.seen < STALE_MS;
        const goneHost = p.id === previousHost && p.id !== playerId;
        if (here || (live && !goneHost)) {
          p.connected = true;
          delete p.disconnectedAt;
        } else {
          p.connected = false;
          p.disconnectedAt = now;
        }
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
    if (msg.kind === "crown" && msg.state?.players && (!msg.to || msg.to === playerId)) {
      pendingCrown = msg.state;
      if (!isHost) {
        lastBeat = 0;
        scheduleElect(600);
      }
      return;
    }
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
          const info = directory.get(msg.from);
          if (info?.pub && state) direct(msg.from, { kind: "crown", state }, info.pub, info.slug);
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
    let changed = false;
    for (const [id, info] of directory) {
      if (info.slug !== slug) continue;
      info.relayLeft = Date.now();
      if (isHost && state && id !== playerId) {
        markDisconnect(state, id);
        info.seen = 0;
        changed = true;
      }
    }
    if (changed) broadcast();
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
    if (state.arc?.phase === "flash" && now - state.arc.at > 1600) {
      state.arc = null;
      changed = true;
    }
    const othersLive = state.players.some((p) => p.id !== playerId && p.connected !== false);
    if (state.phase !== "lobby" && !othersLive) {
      if (!soloSince) soloSince = now;
      else if (now - soloSince > 3 * 60 * 1000) {
        dispatch(state, playerId, { type: "fresh" });
        soloSince = 0;
        changed = true;
      }
    } else soloSince = 0;
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
    const actor = state.prompt?.playerId || (state.phase === "play" && (state.turnPhase === "play" || state.turnPhase === "draw") ? state.currentId : null);
    if (!actor) return;
    const who = state.players.find((p) => p.id === actor);
    if (!who || who.connected !== false || who.id === playerId) {
      quietSince.delete(actor);
      return;
    }
    if (!quietSince.has(actor)) quietSince.set(actor, Date.now());
    if (Date.now() - quietSince.get(actor) > 1000) {
      const choice = autoChoice(state, actor);
      if (choice) apply(actor, { ...choice, actionId: newId() });
      quietSince.set(actor, Date.now());
    }
  }, 2000);

  function crownedWinner() {
    if (!pendingCrown?.players) return null;
    const ids = pendingCrown.players.filter((p) => p.connected !== false).map((p) => p.id);
    if (!ids.length) return null;
    return ids.slice().sort()[0];
  }

  function leaveSeat() {
    if (steppedAside || destroyed) return;
    if (isHost && state) {
      markDisconnect(state, playerId);
      for (const [id, info] of directory) {
        if (id === playerId || !info?.pub) continue;
        direct(id, { kind: "crown", state, to: id }, info.pub, info.slug);
      }
      broadcast();
      return;
    }
    const info = directory.get(hostPeer);
    if (info?.pub) {
      direct(hostPeer, {
        kind: "action",
        from: playerId,
        token: connToken,
        at: helloAt,
        action: { type: "disconnect", actionId: newId() },
      }, info.pub, info.slug);
    }
  }

  window.addEventListener("pagehide", () => {
    leaveSeat();
    destroyed = true;
    clearInterval(heartbeat);
    clearTimeout(electTimer);
    setTimeout(() => relay?.stop(), 150);
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
      const guarded = full.type === "start" || full.type === "pause" || full.type === "resume" || full.type === "fresh";
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
      const go = async () => {
        if (guarded) {
          if (!isHost) {
            toast("방장만 할 수 있습니다.");
            return;
          }
          if (full.type === "start") {
            if (!full.pass) {
              toast("방장 암호를 정하세요.");
              return;
            }
            full.passHash = await passRecord(full.pass);
            delete full.pass;
          } else if (!(await passOk(state?.hostPass, full.pass || ""))) {
            delete full.pass;
            toast("암호가 올바르지 않습니다.");
            return;
          } else delete full.pass;
        }
        if (attemptSend()) return;
        const timer = setInterval(() => {
          if (destroyed || steppedAside || attemptSend()) clearInterval(timer);
        }, 400);
        setTimeout(() => clearInterval(timer), 8000);
      };
      go();
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
