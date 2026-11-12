const text = new TextEncoder();
const decode = new TextDecoder();

function bytesToB64(bytes) {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64ToBytes(value) {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const bin = atob(value.replaceAll("-", "+").replaceAll("_", "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function relayNamespace(roomHint, entryCode) {
  const fallback = `hibanghigherideal${entryCode}`;
  if (roomHint && roomHint !== fallback) {
    const clean = String(roomHint).toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 40);
    if (clean) return clean;
  }
  const digest = await crypto.subtle.digest("SHA-256", text.encode(`bang-ns-v1:${entryCode}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `r${hex}`.slice(0, 32);
}

export async function roomKey(entryCode) {
  const ikm = await crypto.subtle.importKey(
    "raw",
    text.encode(`bang-room-ikm-v1:${entryCode}`),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: text.encode("bang-room-salt-v1"),
      info: text.encode(`bang-room-aes:${entryCode}`),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function identityKeys() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
}

export async function publicJwk(pair) {
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
}

export async function sharedKey(pair, jwk) {
  const pub = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: pub },
    pair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, text.encode(JSON.stringify(value)));
  return `${bytesToB64(iv)}.${bytesToB64(new Uint8Array(cipher))}`;
}

export async function openSeal(key, box) {
  try {
    const [ivPart, dataPart] = String(box || "").split(".");
    if (!ivPart || !dataPart) return null;
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(ivPart) },
      key,
      b64ToBytes(dataPart),
    );
    return JSON.parse(decode.decode(clear));
  } catch {
    return null;
  }
}

function newSlug() {
  return `p${Math.random().toString(36).slice(2, 10)}`;
}

export function openRelay({ namespace, onBox, onLeave, onJoin, onStatus }) {
  const relays = [
    { name: "open-rooms", url: `wss://relay.open-rooms.dev/rooms/${namespace}` },
    { name: "itty", url: `wss://itty.ws/c/${namespace}` },
  ];
  let index = 0;
  let attempt = 0;
  let socket = null;
  let slug = newSlug();
  let stopped = false;
  let opened = false;
  let active = relays[0].name;
  let backoff = 400;
  let keep = 0;

  function status(phase) {
    onStatus?.({ phase, relay: active });
  }

  function failOver() {
    opened = false;
    clearInterval(keep);
    index += 1;
    active = relays[index % relays.length].name;
    status("fail");
    const wait = backoff;
    backoff = Math.min(4000, backoff * 2);
    setTimeout(start, wait);
  }

  function start() {
    if (stopped || opened) return;
    const spec = relays[index % relays.length];
    active = spec.name;
    const token = ++attempt;
    status("connecting");
    let sock;
    try {
      sock = new WebSocket(spec.url);
    } catch {
      failOver();
      return;
    }
    socket = sock;
    const timer = setTimeout(() => {
      if (token !== attempt || sock.readyState === WebSocket.OPEN) return;
      try { sock.close(); } catch { /* ignore */ }
      failOver();
    }, 8000);
    sock.onopen = () => {
      if (token !== attempt) return;
      clearTimeout(timer);
      opened = true;
      backoff = 400;
      if (spec.name === "open-rooms") sock.send(JSON.stringify({ type: "hello", slug }));
      globalThis.__BANG_RELAY = spec.name;
      status("open");
      keep = setInterval(() => {
        if (token !== attempt || sock.readyState !== WebSocket.OPEN) return;
        try { sock.send(spec.name === "open-rooms" ? "ping" : JSON.stringify({ type: "keepalive" })); } catch { /* retry on close */ }
      }, 8000);
    };
    sock.onmessage = (event) => {
      if (token !== attempt) return;
      handle(spec.name, event.data);
    };
    sock.onerror = () => {};
    sock.onclose = (event) => {
      if (token !== attempt || stopped) return;
      clearTimeout(timer);
      if (event?.code === 4004) slug = newSlug();
      clearInterval(keep);
      if (!opened) failOver();
      else {
        opened = false;
        status("retry");
        const wait = backoff;
        backoff = Math.min(4000, backoff * 2);
        setTimeout(start, wait);
      }
    };
  }

  function handle(kind, raw) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    if (kind === "open-rooms") {
      if (data.type === "peer:join" || data.type === "peer:update") {
        const peer = data.peer || data;
        if (peer.slug) onJoin?.(peer.slug);
        return;
      }
      if (data.type === "peer:leave") {
        const peer = data.peer || data;
        if (peer.slug) onLeave?.(peer.slug);
        return;
      }
      if (data.type === "error" && data.code === "PEER_SLUG_TAKEN") {
        slug = newSlug();
        try { socket?.close(); } catch { /* ignore */ }
        return;
      }
      if (data.kind === "message" && data.payload != null) onBox?.(data.payload);
      return;
    }
    if (data.type === "join") {
      if (data.self && data.uid) slug = String(data.uid);
      return;
    }
    if (typeof data.message === "string") onBox?.(data.message);
  }

  function send(payload, toSlug) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    if (active === "open-rooms") {
      socket.send(JSON.stringify({
        v: 1,
        id: crypto.randomUUID(),
        kind: "message",
        to: toSlug ? [toSlug] : "*",
        encrypted: false,
        payload,
      }));
      return true;
    }
    socket.send(payload);
    return true;
  }

  return {
    start,
    send,
    slug: () => slug,
    relay: () => active,
    isOpen: () => opened && socket?.readyState === WebSocket.OPEN,
    ensure() {
      if (stopped || opened) return;
      start();
    },
    stop() {
      stopped = true;
      attempt += 1;
      try { socket?.close(); } catch { /* ignore */ }
    },
  };
}
