import {
  CARD_INFO,
  CHARACTERS,
  RANK_VALUE,
  ROLES,
  SELF_BLUE,
  WEAPON_TYPES,
  baseDeckTemplates,
  cardLabel,
  characterById,
  rolesForCount,
} from "./cards.js?v=32";
import { MAX_PLAYERS, MIN_PLAYERS } from "./config.js?v=32";

const WEAPONS = new Set(WEAPON_TYPES);

export function createLobby(host, seed) {
  const state = {
    seq: 0,
    phase: "lobby",
    hostId: host.id,
    seed: seed >>> 0 || 1,
    nextCard: 1,
    players: [],
    deck: [],
    discard: [],
    chat: [],
    log: [],
    events: [],
    currentId: null,
    turnPhase: null,
    bangsPlayed: 0,
    prompt: null,
    combat: null,
    store: null,
    dmg: null,
    winner: null,
  };
  addPlayer(state, host.id, host.nickname);
  return state;
}

export const DISCONNECT_GRACE_MS = 60000;

function uniqueNickname(state, nickname, exceptId) {
  const base = cleanName(nickname);
  const used = new Set(state.players.filter((p) => p.id !== exceptId).map((p) => p.nickname));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}(${n})`)) n += 1;
  return `${base}(${n})`;
}

function replaceId(value, oldId, newId) {
  return value === oldId ? newId : value;
}

export function rebindPlayer(state, oldId, newId) {
  if (!state || !oldId || !newId || oldId === newId) return state;
  const seat = state.players.find((p) => p.id === oldId);
  if (seat) seat.id = newId;
  state.hostId = replaceId(state.hostId, oldId, newId);
  state.currentId = replaceId(state.currentId, oldId, newId);
  if (state.prompt) {
    state.prompt.playerId = replaceId(state.prompt.playerId, oldId, newId);
    state.prompt.sourceId = replaceId(state.prompt.sourceId, oldId, newId);
  }
  if (state.combat) {
    state.combat.sourceId = replaceId(state.combat.sourceId, oldId, newId);
    state.combat.defenderId = replaceId(state.combat.defenderId, oldId, newId);
    state.combat.duelTurn = replaceId(state.combat.duelTurn, oldId, newId);
    if (Array.isArray(state.combat.queue)) state.combat.queue = state.combat.queue.map((id) => replaceId(id, oldId, newId));
  }
  if (state.store) {
    state.store.pickerId = replaceId(state.store.pickerId, oldId, newId);
    if (Array.isArray(state.store.order)) state.store.order = state.store.order.map((id) => replaceId(id, oldId, newId));
  }
  if (state.dmg) {
    state.dmg.targetId = replaceId(state.dmg.targetId, oldId, newId);
    state.dmg.sourceId = replaceId(state.dmg.sourceId, oldId, newId);
  }
  if (state.arc) {
    state.arc.fromId = replaceId(state.arc.fromId, oldId, newId);
    state.arc.toId = replaceId(state.arc.toId, oldId, newId);
  }
  return state;
}

export function claimSeat(state, id, nickname) {
  const name = cleanName(nickname);
  const byId = state.players.find((p) => p.id === id);
  if (byId) {
    byId.connected = true;
    delete byId.disconnectedAt;
    return { ok: true, state };
  }
  const byName = state.players.find((p) => p.nickname === name);
  if (byName) {
    if (byName.connected !== false) {
      return { ok: false, error: `${name} 님은 이미 접속 중입니다. 다른 닉네임을 사용하세요.` };
    }
    rebindPlayer(state, byName.id, id);
    byName.connected = true;
    delete byName.disconnectedAt;
    return { ok: true, state };
  }
  return addPlayer(state, id, name);
}

export function addPlayer(state, id, nickname) {
  const existing = state.players.find((p) => p.id === id);
  if (existing) {
    existing.connected = true;
    delete existing.disconnectedAt;
    if (state.phase === "lobby") existing.nickname = uniqueNickname(state, nickname, id);
    return { ok: true, state };
  }
  if (state.phase !== "lobby") {
    return { ok: false, error: "진행 중인 판입니다. 같은 닉네임으로 다시 들어오거나, 방장이 종료한 뒤 새 판을 시작하세요." };
  }
  if (state.players.length >= MAX_PLAYERS) {
    return { ok: false, error: "방이 가득 찼습니다. (최대 7명)" };
  }
  const name = uniqueNickname(state, nickname, id);
  state.players.push({
    id,
    nickname: name,
    seat: state.players.length,
    connected: true,
    alive: true,
    role: null,
    character: null,
    choices: null,
    hp: 0,
    maxHp: 0,
    hand: [],
    equipment: emptyEquip(),
  });
  return { ok: true, state };
}

export function markDisconnect(state, id, now = Date.now()) {
  const p = player(state, id);
  if (!p) return state;
  p.connected = false;
  p.disconnectedAt = now;
  return state;
}

export function expireDisconnects(state, now = Date.now(), grace = DISCONNECT_GRACE_MS) {
  if (!state || state.phase !== "lobby") return false;
  const before = state.players.length;
  state.players = state.players.filter((p) => {
    if (p.id === state.hostId || p.connected !== false) return true;
    return now - (p.disconnectedAt || now) < grace;
  });
  if (state.players.length === before) return false;
  state.players.forEach((p, i) => { p.seat = i; });
  return true;
}

export function dispatch(state, playerId, action) {
  const error = handle(state, playerId, action || {});
  if (error) return { ok: false, error };
  return { ok: true, state };
}

function handle(state, playerId, action) {
  if (state.paused && !["resume", "fresh", "chat"].includes(action.type)) return "일시정지 중입니다.";
  switch (action.type) {
    case "chat": return chat(state, playerId, action.text);
    case "start": return startGame(state, playerId, action);
    case "choose": return chooseCharacter(state, playerId, action.characterId);
    case "play": return playCard(state, playerId, action);
    case "end": return endTurn(state, playerId);
    case "discard": return confirmDiscard(state, playerId, action.cardIds || []);
    case "respond": return respond(state, playerId, action);
    case "sid": return sidHeal(state, playerId, action.cardIds || []);
    case "aim": return setAim(state, playerId, action.targetId);
    case "again": return playAgain(state, playerId);
    case "pause": return setPaused(state, playerId, true);
    case "resume": return setPaused(state, playerId, false);
    case "fresh": return freshGame(state, playerId);
    case "draw": return drawNow(state, playerId);
    default: return "알 수 없는 행동입니다.";
  }
}

function setPaused(state, playerId, paused) {
  if (playerId !== state.hostId) return "방장만 할 수 있습니다.";
  if (state.phase === "lobby") return "아직 시작하지 않은 판입니다.";
  state.paused = paused;
  state.arc = null;
  log(state, paused ? "방장이 판을 일시정지했습니다." : "방장이 판을 재개했습니다.");
  return null;
}

function freshGame(state, playerId) {
  if (playerId !== state.hostId) return "방장만 판을 종료할 수 있습니다.";
  const players = state.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    seat: p.seat,
    connected: p.connected !== false,
    alive: true,
    role: null,
    character: null,
    choices: null,
    hp: 0,
    maxHp: 0,
    hand: [],
    equipment: emptyEquip(),
  }));
  state.players = players;
  state.phase = "lobby";
  state.paused = false;
  state.winner = null;
  state.deck = [];
  state.discard = [];
  state.prompt = null;
  state.combat = null;
  state.store = null;
  state.dmg = null;
  state.currentId = null;
  state.turnPhase = null;
  state.bangsPlayed = 0;
  state.arc = null;
  state.events = [];
  log(state, "방장이 판을 종료하고 대기실로 돌아왔습니다.");
  return null;
}

function chat(state, playerId, text) {
  const p = player(state, playerId);
  if (!p) return "방에 없습니다.";
  const msg = String(text || "").trim().slice(0, 200);
  if (!msg) return "내용이 없습니다.";
  state.chat.push({ id: `m${state.seq}-${state.chat.length}`, name: p.nickname, text: msg, t: Date.now() });
  if (state.chat.length > 60) state.chat.shift();
  return null;
}

function startGame(state, playerId, action = {}) {
  if (playerId !== state.hostId) return "방장만 시작할 수 있습니다.";
  if (state.phase !== "lobby") return "이미 시작된 판입니다.";
  const n = state.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return `시작은 ${MIN_PLAYERS}명부터 ${MAX_PLAYERS}명까지입니다.`;
  if (action.passHash?.salt && action.passHash?.hash) state.hostPass = { salt: action.passHash.salt, hash: action.passHash.hash };
  // Harness-only. A normal start never sets __BANG_TEST, so a setup payload is ignored.
  if (action.setup && globalThis.__BANG_TEST === true) return startScripted(state, action.setup);
  const roles = shuffle(state, rolesForCount(n));
  const chars = shuffle(state, CHARACTERS.map((c) => c.id));
  state.players.forEach((p, i) => {
    p.role = roles[i];
    p.choices = [chars[i * 2], chars[i * 2 + 1]];
    p.character = null;
    p.hp = 0;
    p.maxHp = 0;
    p.hand = [];
    p.equipment = emptyEquip();
    p.alive = true;
    p.connected = p.connected !== false;
  });
  state.deck = shuffle(state, baseDeckTemplates().map((c) => mint(state, c.type, c.suit, c.rank)));
  state.discard = [];
  state.winner = null;
  state.prompt = null;
  state.combat = null;
  state.store = null;
  state.dmg = null;
  state.phase = "select";
  state.turnPhase = null;
  state.currentId = null;
  const sheriff = state.players.find((p) => p.role === "sheriff");
  log(state, `역할이 나누어졌습니다. 보안관은 ${sheriff.nickname} 님입니다.`);
  log(state, "각자 인물 카드 두 장 중 하나를 고르세요.");
  return null;
}

const SUIT_NAMES = new Set(["hearts", "diamonds", "clubs", "spades"]);

function scriptCard(state, spec) {
  if (!spec || !CARD_INFO[spec.type] || !SUIT_NAMES.has(spec.suit)) return null;
  const rank = String(spec.rank);
  if (!RANK_VALUE[rank]) return null;
  return mint(state, spec.type, spec.suit, rank);
}

function scriptList(state, list) {
  const cards = [];
  for (const spec of list || []) {
    const card = scriptCard(state, spec);
    if (!card) return null;
    cards.push(card);
  }
  return cards;
}

/** Seat order. deck is top-first. discard is bottom-to-top (last card is face up). */
function startScripted(state, setup) {
  const seats = state.players.slice().sort((a, b) => a.seat - b.seat);
  const n = seats.length;
  const roles = setup.roles;
  const characters = setup.characters;
  if (!Array.isArray(roles) || roles.length !== n) return "역할 수가 맞지 않습니다.";
  if (!Array.isArray(characters) || characters.length !== n) return "인물 수가 맞지 않습니다.";
  const expected = rolesForCount(n).slice().sort().join(",");
  if (roles.slice().sort().join(",") !== expected) return "이 인원수의 역할 구성이 아닙니다.";
  if (new Set(characters).size !== characters.length) return "인물이 겹칩니다.";
  if (characters.some((id) => !characterById(id))) return "없는 인물입니다.";
  if (Number.isFinite(setup.seed)) state.seed = setup.seed >>> 0 || 1;
  const hands = [];
  const equips = [];
  for (let i = 0; i < n; i += 1) {
    const hand = scriptList(state, setup.hands?.[i] || []);
    if (!hand) return "손패 카드가 올바르지 않습니다.";
    hands.push(hand);
    const eq = emptyEquip();
    const spec = setup.equipment?.[i] || {};
    for (const slot of ["weapon", "mustang", "scope", "barrel", "jail", "dynamite"]) {
      if (!spec[slot]) continue;
      const card = scriptCard(state, spec[slot]);
      if (!card) return "장착 카드가 올바르지 않습니다.";
      eq[slot] = card;
    }
    if (roles[i] === "sheriff" && eq.jail) return "보안관은 감옥에 넣을 수 없습니다.";
    equips.push(eq);
  }
  const discard = scriptList(state, setup.discard || []);
  const deck = scriptList(state, setup.deck || []);
  if (!discard || !deck) return "덱 카드가 올바르지 않습니다.";
  seats.forEach((p, i) => {
    p.role = roles[i];
    p.character = characters[i];
    p.choices = null;
    const base = characterById(p.character).hp;
    p.maxHp = base + (p.role === "sheriff" ? 1 : 0);
    p.hp = Array.isArray(setup.hp) && setup.hp[i] != null ? setup.hp[i] : p.maxHp;
    p.hand = hands[i];
    p.equipment = equips[i];
    p.alive = true;
    p.connected = p.connected !== false;
  });
  state.discard = discard;
  state.deck = deck.reverse();
  state.winner = null;
  state.prompt = null;
  state.combat = null;
  state.store = null;
  state.dmg = null;
  state.phase = "play";
  state.turnPhase = null;
  state.currentId = null;
  state.bangsPlayed = 0;
  state.arc = null;
  const sheriff = seats.find((p) => p.role === "sheriff");
  log(state, `역할이 나누어졌습니다. 보안관은 ${sheriff.nickname} 님입니다.`);
  log(state, "카드를 나누고 게임을 시작합니다. 보안관부터입니다.");
  startTurn(state, sheriff.id);
  return null;
}

function chooseCharacter(state, playerId, characterId) {
  if (state.phase !== "select") return "지금 인물을 고르는 시간이 아닙니다.";
  const p = player(state, playerId);
  if (!p) return "방에 없습니다.";
  if (p.character) return "이미 인물을 골랐습니다.";
  if (!p.choices || !p.choices.includes(characterId)) return "그 인물은 선택할 수 없습니다.";
  p.character = characterId;
  const ch = characterById(characterId);
  log(state, `${p.nickname} 님이 ${ch.name}을(를) 골랐습니다.`);
  p.choices = null;
  if (state.players.every((x) => x.character)) beginPlay(state);
  return null;
}

function beginPlay(state) {
  for (const p of state.players) {
    const base = characterById(p.character).hp;
    p.maxHp = base + (p.role === "sheriff" ? 1 : 0);
    p.hp = p.maxHp;
    p.hand = [];
    for (let i = 0; i < p.maxHp; i += 1) {
      const c = drawOne(state);
      if (c) p.hand.push(c);
    }
  }
  state.phase = "play";
  log(state, "카드를 나누고 게임을 시작합니다. 보안관부터입니다.");
  const sheriff = state.players.find((p) => p.role === "sheriff");
  startTurn(state, sheriff.id);
}

function playAgain(state, playerId) {
  if (playerId !== state.hostId) return "방장만 한 판 더 할 수 있습니다.";
  if (state.phase !== "end") return "아직 판이 끝나지 않았습니다.";
  const players = state.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    seat: p.seat,
    connected: p.connected,
    alive: true,
    role: null,
    character: null,
    choices: null,
    hp: 0,
    maxHp: 0,
    hand: [],
    equipment: emptyEquip(),
  }));
  state.players = players;
  state.phase = "lobby";
  state.winner = null;
  state.deck = [];
  state.discard = [];
  state.prompt = null;
  state.combat = null;
  state.store = null;
  state.dmg = null;
  state.currentId = null;
  state.log = [];
  state.events = [];
  log(state, "같은 멤버로 새 판을 시작합니다.");
  return startGame(state, state.hostId);
}

function startTurn(state, id) {
  if (state.phase === "end") return;
  const p = player(state, id);
  if (!p || !p.alive) {
    nextTurn(state);
    return;
  }
  state.currentId = id;
  state.bangsPlayed = 0;
  state.turnPhase = "start";
  state.prompt = null;
  state.combat = null;
  state.arc = null;
  log(state, `${p.nickname} 님의 턴입니다.`);
  if (p.equipment.dynamite) beginDynamite(state);
  else beginJail(state);
}

function beginDynamite(state) {
  const p = current(state);
  if (p.character === "lucky") {
    const cards = drawUpTo(state, 2);
    if (cards.length === 0) {
      resolveDynamite(state, null);
      return;
    }
    if (cards.length === 1) {
      resolveDynamite(state, cards[0]);
      return;
    }
    state.prompt = { kind: "lucky", playerId: p.id, cards, mode: "dynamite" };
    state.turnPhase = "react";
    log(state, `${p.nickname} 님이 다이너마이트 드로우! 로 두 장을 뒤집었습니다.`);
    showFlip(state, { cards, caption: `${p.nickname} · 럭키 듀크 다이너마이트 — 한 장을 고릅니다`, to: "hold" });
    return;
  }
  resolveDynamite(state, drawOne(state));
}

function resolveDynamite(state, card) {
  const p = current(state);
  if (card) state.discard.push(card);
  const boom = card && card.suit === "spades" && RANK_VALUE[card.rank] >= 2 && RANK_VALUE[card.rank] <= 9;
  log(state, card
    ? `다이너마이트 드로우! — ${cardLabel(card)}. ${boom ? "폭발입니다!" : "넘어갑니다."}`
    : "다이너마이트를 확인할 카드가 없어 넘어갑니다.");
  showFlip(state, {
    cards: card ? [card] : [],
    caption: `${p.nickname} · 다이너마이트 ${card ? cardLabel(card) : ""} — ${boom ? "폭발!" : "넘어감"}`,
    to: "discard",
  });
  if (boom) {
    const dyn = p.equipment.dynamite;
    p.equipment.dynamite = null;
    if (dyn) state.discard.push(dyn);
    inflict(state, p.id, 3, { sourceId: null, elGringo: false, resume: { type: "afterDynamite" } });
    return;
  }
  passDynamite(state, p);
  beginJail(state);
}

function passDynamite(state, from) {
  const dyn = from.equipment.dynamite;
  if (!dyn) return;
  from.equipment.dynamite = null;
  const next = clockwise(state, from.id);
  if (!next || next.id === from.id) {
    from.equipment.dynamite = dyn;
    return;
  }
  next.equipment.dynamite = dyn;
  log(state, `다이너마이트가 ${next.nickname} 님에게 넘어갔습니다.`);
}

function afterDynamite(state) {
  if (state.phase === "end") return;
  const p = current(state);
  if (!p || !p.alive) {
    nextTurn(state);
    return;
  }
  beginJail(state);
}

function beginJail(state) {
  const p = current(state);
  if (!p.equipment.jail) {
    beginDraw(state);
    return;
  }
  if (p.character === "lucky") {
    const cards = drawUpTo(state, 2);
    if (cards.length <= 1) {
      resolveJail(state, cards[0] || null);
      return;
    }
    state.prompt = { kind: "lucky", playerId: p.id, cards, mode: "jail" };
    state.turnPhase = "react";
    log(state, `${p.nickname} 님이 감옥 드로우! 로 두 장을 뒤집었습니다.`);
    showFlip(state, { cards, caption: `${p.nickname} · 럭키 듀크 감옥 — 한 장을 고릅니다`, to: "hold" });
    return;
  }
  resolveJail(state, drawOne(state));
}

function resolveJail(state, card) {
  const p = current(state);
  if (card) state.discard.push(card);
  const jail = p.equipment.jail;
  p.equipment.jail = null;
  if (jail) state.discard.push(jail);
  const free = card && card.suit === "hearts";
  log(state, card
    ? `감옥 드로우! — ${cardLabel(card)}. ${free ? "탈출입니다." : "이번 턴은 쉽니다."}`
    : "감옥을 확인할 카드가 없어 턴을 쉽니다.");
  showFlip(state, {
    cards: card ? [card] : [],
    caption: `${p.nickname} · 감옥 ${card ? cardLabel(card) : ""} — ${free ? "탈출!" : "턴을 쉼"}`,
    to: "discard",
  });
  if (free) beginDraw(state);
  else nextTurn(state);
}

function beginDraw(state) {
  const p = current(state);
  state.turnPhase = "draw";
  if (p.character === "jesse") {
    const options = alive(state).filter((o) => o.id !== p.id && o.hand.length > 0).map((o) => o.id);
    if (options.length) {
      state.prompt = { kind: "jesse", playerId: p.id, options };
      return;
    }
  }
  if (p.character === "pedro" && state.discard.length > 0) {
    state.prompt = { kind: "pedro", playerId: p.id, top: state.discard[state.discard.length - 1] };
    return;
  }
  if (p.character === "kit") {
    const cards = drawUpTo(state, 3);
    if (cards.length < 3) {
      p.hand.push(...cards.filter(Boolean));
      log(state, `${p.nickname} 님이 카드를 ${cards.length}장 뽑았습니다.`);
      enterPlay(state);
      return;
    }
    state.prompt = { kind: "kit", playerId: p.id, cards };
    log(state, `${p.nickname} 님이 세 장을 살펴보고 있습니다.`);
    showFlip(state, { cards, caption: `${p.nickname} · 키트 칼슨 — 세 장 중 두 장을 고릅니다`, to: "hold" });
    return;
  }
}

function drawNow(state, playerId) {
  if (state.currentId !== playerId || state.turnPhase !== "draw" || state.prompt) return "지금은 카드를 뽑을 수 없습니다.";
  drawTwo(state, null);
  return null;
}

function drawTwo(state, first) {
  const p = current(state);
  const drawn = [];
  if (first) drawn.push(first);
  else {
    const c = drawOne(state);
    if (c) drawn.push(c);
  }
  const second = drawOne(state);
  if (second) drawn.push(second);
  for (const c of drawn) if (c) p.hand.push(c);
  if (p.character === "blackjack" && drawn[1]) {
    state.prompt = { kind: "reveal", playerId: p.id, cardId: drawn[1].id };
    state.turnPhase = "react";
    log(state, `${p.nickname} 님이 블랙 잭의 두 번째 카드를 공개할 차례입니다.`);
    return;
  }
  log(state, `${p.nickname} 님이 카드를 ${drawn.length}장 뽑았습니다.`);
  enterPlay(state);
}

function enterPlay(state) {
  if (state.phase === "end") return;
  state.turnPhase = "play";
  state.prompt = null;
  suzy(state, current(state));
}

function playCard(state, playerId, action) {
  if (state.phase !== "play" || state.turnPhase !== "play") return "지금은 카드를 낼 수 없습니다.";
  if (state.currentId !== playerId) return "당신의 턴이 아닙니다.";
  if (state.prompt) return "먼저 진행 중인 선택을 마치세요.";
  const p = player(state, playerId);
  const idx = p.hand.findIndex((c) => c.id === action.cardId);
  if (idx < 0) return "그 카드는 손에 없습니다.";
  const card = p.hand[idx];
  const type = effectiveType(p, card, "play");
  if (type === "missed") return "빗나감!은 공격을 막을 때만 낼 수 있습니다.";
  if (type === "bang") {
    const why = bangBlockReason(state, p, action.targetId);
    if (why) return why;
  }
  if (CARD_INFO[type].target || type === "jail") {
    const target = player(state, action.targetId);
    const why = targetBlockReason(state, p, type, target, action.take);
    if (why) return why;
    if ((type === "panic" || type === "catbalou") && action.take === "hand") {
      if (!target.hand.length) return "손패가 없습니다.";
      if (!Number.isInteger(action.index)) {
        state.prompt = { kind: "hand", playerId: p.id, targetId: target.id, count: target.hand.length, reason: type, cardId: card.id };
        state.turnPhase = "react";
        log(state, `${p.nickname} 님이 ${target.nickname} 님의 손패를 고르고 있습니다.`);
        return null;
      }
      if (action.index < 0 || action.index >= target.hand.length) return "그 카드는 고를 수 없습니다.";
    }
  }
  p.hand.splice(idx, 1);
  if (type === "bang") {
    state.bangsPlayed += 1;
    state.discard.push(card);
    const target = player(state, action.targetId);
    log(state, `${p.nickname} 님이 ${target.nickname} 님에게 ${CARD_INFO.bang.ko}을(를) 쐈습니다. (${cardLabel(card)})`);
    if (p.character === "willy" && state.bangsPlayed > 1) cue(state, `${p.nickname} · 윌리 더 키드 — 뱅!을 또 씁니다`);
    if (p.character === "calamity" && card.type === "missed") cue(state, `${p.nickname} · 캘러미티 자넷 — 빗나감을 뱅!으로`);
    if (p.character === "rose") cue(state, `${p.nickname} · 로즈 둘란 — 거리가 1 가깝습니다`);
    if (target.character === "paul") cue(state, `${target.nickname} · 폴 리그레트 — 거리가 1 멉니다`);
    if (p.character === "slab") cue(state, `${p.nickname} · 슬랩 더 킬러 — 빗나감이 두 장 필요합니다`);
    markArc(state, p.id, target.id);
    const need = p.character === "slab" ? 2 : 1;
    startDefense(state, target.id, p.id, need, { type: "play" });
    suzy(state, p);
    return null;
  }
  return resolveBrownOrBlue(state, p, card, type, action);
}

function effectiveType(p, card, context) {
  if (p.character !== "calamity") return card.type;
  if (context === "play" && card.type === "missed") return "bang";
  if (context === "miss" && card.type === "bang") return "missed";
  if (context === "asbang" && card.type === "missed") return "bang";
  return card.type;
}

function bangBlockReason(state, p, targetId) {
  if (!unlimitedBang(p) && state.bangsPlayed >= 1) return "이번 턴에는 뱅!을 이미 사용했습니다.";
  const target = player(state, targetId);
  if (!target || !target.alive || target.id === p.id) return "쏠 대상을 고르세요.";
  const dist = distance(state, p, target);
  const range = weaponRange(p);
  if (dist > range) {
    if (target.character === "paul") cue(state, `${target.nickname} · 폴 리그레트 — 거리가 1 멉니다`);
    return `사정거리 밖입니다. (거리 ${dist}, 사거리 ${range})`;
  }
  return null;
}

function unlimitedBang(p) {
  return p.character === "willy" || p.equipment.weapon?.type === "volcanic";
}

function targetBlockReason(state, p, type, target, take) {
  if (type === "jail") {
    if (!target || !target.alive) return "가둘 대상을 고르세요.";
    if (target.role === "sheriff") return "보안관은 감옥에 넣을 수 없습니다.";
    if (target.equipment.jail) return "이미 감옥에 있는 플레이어입니다.";
    return null;
  }
  if (type === "duel" || type === "catbalou") {
    if (!target || !target.alive || target.id === p.id && type === "duel") return "대상을 고르세요.";
    if (!target || !target.alive) return "대상을 고르세요.";
    if (type === "catbalou") return takeReason(p, target, take, true);
    return null;
  }
  if (type === "panic") {
    if (!target || !target.alive) return "빼앗을 대상을 고르세요.";
    if (target.id !== p.id && distance(state, p, target) > 1) return "강탈!은 거리 1만 가능합니다.";
    return takeReason(p, target, take, false);
  }
  return null;
}

function takeReason(p, target, take, discardOnly) {
  const self = target.id === p.id;
  const equips = equipList(target);
  if (self && discardOnly) {
    if (!take) {
      if (!target.hand.length && !equips.length) return null;
      if (equips.length || target.hand.length) return "버릴 카드를 고르세요.";
    }
    return null;
  }
  if (self && !discardOnly) {
    if (!equips.length) return "가져올 장착 카드가 없습니다.";
    if (!take || take === "hand") return "가져올 장착 카드를 고르세요.";
    return null;
  }
  if (!target.hand.length && !equips.length) {
    return discardOnly ? null : "가져올 카드가 없습니다.";
  }
  if (!take) return discardOnly ? "버릴 카드를 고르세요." : "가져올 카드를 고르세요.";
  if (take === "hand" && !target.hand.length) return "손패가 없습니다.";
  return null;
}

function resolveBrownOrBlue(state, p, card, type, action) {
  if (WEAPONS.has(type)) {
    if (p.equipment.weapon) state.discard.push(p.equipment.weapon);
    p.equipment.weapon = card;
    log(state, `${p.nickname} 님이 ${CARD_INFO[type].ko}을(를) 장착했습니다. 사거리 ${CARD_INFO[type].range}.`);
    suzy(state, p);
    return null;
  }
  if (SELF_BLUE.includes(type)) {
    if (type !== "dynamite" && p.equipment[type]) {
      p.hand.push(card);
      return "이미 같은 카드가 앞에 있습니다.";
    }
    if (type === "dynamite" && p.equipment.dynamite) {
      p.hand.push(card);
      return "이미 다이너마이트가 눈앞에 있습니다.";
    }
    p.equipment[type] = card;
    log(state, `${p.nickname} 님이 ${CARD_INFO[type].ko}을(를) 앞에 내려놓았습니다.`);
    suzy(state, p);
    return null;
  }
  if (type === "jail") {
    const target = player(state, action.targetId);
    target.equipment.jail = card;
    log(state, `${p.nickname} 님이 ${target.nickname} 님을 감옥에 넣었습니다.`);
    markArc(state, p.id, target.id);
    suzy(state, p);
    return null;
  }
  state.discard.push(card);
  if (type === "beer") {
    if (alive(state).length <= 2) log(state, `${p.nickname} 님이 맥주를 마셨지만, 둘이 남아 효과가 없습니다.`);
    else if (p.hp >= p.maxHp) log(state, `${p.nickname} 님이 맥주를 마셨지만 생명력이 이미 가득합니다.`);
    else {
      p.hp += 1;
      log(state, `${p.nickname} 님이 맥주로 생명력 1을 회복했습니다. (${p.hp}/${p.maxHp})`);
    }
    suzy(state, p);
    return null;
  }
  if (type === "saloon") {
    for (const t of alive(state)) {
      if (t.hp < t.maxHp) {
        t.hp += 1;
        log(state, `${t.nickname} 님이 주점에서 생명력 1을 회복했습니다. (${t.hp}/${t.maxHp})`);
      }
    }
    suzy(state, p);
    return null;
  }
  if (type === "stagecoach" || type === "wells") {
    const n = type === "wells" ? 3 : 2;
    const got = drawUpTo(state, n);
    p.hand.push(...got);
    log(state, `${p.nickname} 님이 ${CARD_INFO[type].ko}로 카드를 ${got.length}장 뽑았습니다.`);
    suzy(state, p);
    return null;
  }
  if (type === "store") {
    const people = alive(state);
    const cards = drawUpTo(state, people.length);
    if (!cards.length) {
      log(state, "잡화점에 깔 카드가 없습니다.");
      suzy(state, p);
      return null;
    }
    state.store = { cards, pickerId: p.id, order: people.map((x) => x.id) };
    state.prompt = { kind: "store", playerId: p.id };
    state.turnPhase = "react";
    log(state, `${p.nickname} 님이 잡화점을 열었습니다. 카드 ${cards.length}장이 깔렸습니다.`);
    suzy(state, p);
    return null;
  }
  if (type === "panic" || type === "catbalou") {
    const target = player(state, action.targetId);
    markArc(state, p.id, target?.id);
    const moved = takeCard(state, target, action.take, action.index);
    if (moved && action.take === "hand") {
      showFlip(state, {
        cards: [moved],
        caption: `${p.nickname} 님이 ${target.nickname} 님의 손패를 가져감`,
        to: type === "panic" ? "hand" : "discard",
        ownerId: type === "panic" ? p.id : "",
        secret: true,
        know: [p.id, target.id],
      });
    }
    if (!moved) {
      log(state, `${p.nickname} 님의 ${CARD_INFO[type].ko}은(는) 가져갈 카드가 없어 효과만 사라졌습니다.`);
    } else if (type === "panic") {
      p.hand.push(moved);
      log(state, `${p.nickname} 님이 ${target.nickname} 님에게서 ${publicTakeName(action.take, moved)} 가져왔습니다.`);
    } else {
      state.discard.push(moved);
      log(state, `${p.nickname} 님이 ${target.nickname} 님의 ${publicTakeName(action.take, moved)} 버리게 했습니다.`);
    }
    suzy(state, target);
    suzy(state, p);
    return null;
  }
  if (type === "duel") {
    const target = player(state, action.targetId);
    log(state, `${p.nickname} 님이 ${target.nickname} 님에게 결투를 신청했습니다.`);
    markArc(state, p.id, target.id);
    state.combat = { kind: "duel", sourceId: p.id, defenderId: target.id, duelTurn: target.id };
    state.prompt = { kind: "discard-bang", playerId: target.id, reason: "duel", sourceId: p.id };
    state.turnPhase = "react";
    suzy(state, p);
    return null;
  }
  if (type === "indians") {
    const queue = othersClockwise(state, p.id);
    log(state, `${p.nickname} 님이 인디언!을 불렀습니다.`);
    state.combat = { kind: "indians", sourceId: p.id, queue };
    suzy(state, p);
    nextIndians(state);
    return null;
  }
  if (type === "gatling") {
    const queue = othersClockwise(state, p.id);
    log(state, `${p.nickname} 님이 기관총을 난사했습니다.`);
    state.combat = { kind: "gatling", sourceId: p.id, queue };
    suzy(state, p);
    nextGatling(state);
    return null;
  }
  p.hand.push(card);
  state.discard.pop();
  return "그 카드는 아직 처리할 수 없습니다.";
}

function publicTakeName(take, card) {
  if (take === "hand") return "손패를";
  return `${cardLabel(card)}을(를)`;
}

function takeCard(state, target, take, index) {
  if (take === "hand") {
    if (!Number.isInteger(index) || index < 0 || index >= target.hand.length) return null;
    return target.hand.splice(index, 1)[0];
  }
  return pullEquip(target, take);
}

function endTurn(state, playerId) {
  if (state.phase !== "play" || state.currentId !== playerId) return "당신의 턴이 아닙니다.";
  if (state.turnPhase !== "play" || state.prompt) return "아직 턴을 끝낼 수 없습니다.";
  const p = player(state, playerId);
  const extra = p.hand.length - p.hp;
  if (extra > 0) {
    state.prompt = { kind: "discard", playerId: p.id, count: extra };
    state.turnPhase = "discard";
    log(state, `${p.nickname} 님은 카드를 ${extra}장 버려야 합니다.`);
    return null;
  }
  nextTurn(state);
  return null;
}

function confirmDiscard(state, playerId, cardIds) {
  const prompt = state.prompt;
  if (!prompt || prompt.kind !== "discard" || prompt.playerId !== playerId) return "버릴 차례가 아닙니다.";
  const p = player(state, playerId);
  const unique = [...new Set(cardIds)];
  if (unique.length !== prompt.count) return `${prompt.count}장을 골라 버리세요.`;
  const cards = [];
  for (const id of unique) {
    const idx = p.hand.findIndex((c) => c.id === id);
    if (idx < 0) return "손에 없는 카드입니다.";
    cards.push(p.hand.splice(idx, 1)[0]);
  }
  state.discard.push(...cards);
  log(state, `${p.nickname} 님이 카드 ${cards.length}장을 버렸습니다.`);
  suzy(state, p);
  state.prompt = null;
  nextTurn(state);
  return null;
}

function respond(state, playerId, action) {
  const prompt = state.prompt;
  if (!prompt || prompt.playerId !== playerId) return "응답할 차례가 아닙니다.";
  if (prompt.kind === "lucky") return chooseLucky(state, playerId, action.cardId);
  if (prompt.kind === "jesse") return chooseJesse(state, playerId, action);
  if (prompt.kind === "hand") return chooseHand(state, playerId, action);
  if (prompt.kind === "pedro") return choosePedro(state, playerId, action);
  if (prompt.kind === "kit") return chooseKit(state, playerId, action.cardId);
  if (prompt.kind === "miss") return chooseMiss(state, playerId, action);
  if (prompt.kind === "discard-bang") return chooseDiscardBang(state, playerId, action);
  if (prompt.kind === "save") return chooseSave(state, playerId, action);
  if (prompt.kind === "store") return chooseStore(state, playerId, action.cardId);
  if (prompt.kind === "reveal") return chooseReveal(state, playerId);
  return "응답할 수 없습니다.";
}

function chooseReveal(state, playerId) {
  const p = player(state, playerId);
  const card = p?.hand.find((c) => c.id === state.prompt.cardId);
  if (!card) return "공개할 카드가 없습니다.";
  const red = card.suit === "hearts" || card.suit === "diamonds";
  log(state, `블랙 잭의 두 번째 카드는 ${cardLabel(card)}입니다.${red ? " 빨간색이라 한 장 더 뽑습니다." : ""}`);
  cue(state, `${p.nickname} · 블랙 잭 — 두 번째 카드 ${cardLabel(card)}${red ? ", 한 장 더" : ""}`);
  showFlip(state, {
    cards: [card],
    caption: `${p.nickname} · 블랙 잭 ${cardLabel(card)} — ${red ? "한 장 더!" : "그대로"}`,
    to: "hand",
    ownerId: p.id,
  });
  state.prompt = null;
  if (red) {
    const third = drawOne(state);
    if (third) p.hand.push(third);
  }
  enterPlay(state);
  return null;
}

function chooseLucky(state, playerId, cardId) {
  const prompt = state.prompt;
  const chosen = prompt.cards.find((c) => c.id === cardId) || prompt.cards[0];
  const mode = prompt.mode;
  const label = prompt.label;
  state.discard.push(...prompt.cards);
  log(state, `${player(state, playerId).nickname} 님이 드로우! 결과로 ${cardLabel(chosen)}을(를) 골랐습니다.`);
  state.prompt = null;
  if (mode === "dynamite") return applyLuckyDynamite(state, chosen);
  if (mode === "jail") return applyLuckyJail(state, chosen);
  if (mode === "combat") return applyLuckyCombat(state, chosen, label);
  return "드로우를 마칠 수 없습니다.";
}

function applyLuckyDynamite(state, card) {
  // chooseLucky already discarded the flipped cards. Evaluate `card` only.
  const p = current(state);
  const boom = card && card.suit === "spades" && RANK_VALUE[card.rank] >= 2 && RANK_VALUE[card.rank] <= 9;
  log(state, boom ? "다이너마이트가 폭발했습니다!" : "다이너마이트는 넘어갔습니다.");
  showFlip(state, {
    cards: card ? [card] : [],
    caption: `${current(state).nickname} · 다이너마이트 ${card ? cardLabel(card) : ""} — ${boom ? "폭발!" : "넘어감"}`,
    to: "discard",
  });
  if (boom) {
    const dyn = p.equipment.dynamite;
    p.equipment.dynamite = null;
    if (dyn) state.discard.push(dyn);
    inflict(state, p.id, 3, { sourceId: null, elGringo: false, resume: { type: "afterDynamite" } });
  } else {
    passDynamite(state, p);
    beginJail(state);
  }
  return null;
}

function applyLuckyJail(state, card) {
  const p = current(state);
  const jail = p.equipment.jail;
  p.equipment.jail = null;
  if (jail) state.discard.push(jail);
  const free = card && card.suit === "hearts";
  log(state, free ? "감옥에서 탈출했습니다." : "감옥에서 나오지 못해 턴을 넘깁니다.");
  showFlip(state, {
    cards: card ? [card] : [],
    caption: `${p.nickname} · 감옥 ${card ? cardLabel(card) : ""} — ${free ? "탈출!" : "턴을 쉼"}`,
    to: "discard",
  });
  if (free) beginDraw(state);
  else nextTurn(state);
  return null;
}

function applyLuckyCombat(state, card, label) {
  const hearts = card && card.suit === "hearts";
  const who = player(state, state.combat.defenderId);
  const ability = label === "jourdonnais" ? "주르도네" : "술통";
  log(state, `${who.nickname} 님의 ${ability}: ${card ? cardLabel(card) : "카드 없음"} — ${hearts ? "막았습니다." : "실패."}`);
  showFlip(state, {
    cards: card ? [card] : [],
    caption: `${who.nickname} · ${ability} ${card ? cardLabel(card) : ""} — ${hearts ? "피했다!" : "실패"}`,
    to: "discard",
  });
  if (hearts) state.combat.missedGot += 1;
  runChecks(state);
  return null;
}

function chooseJesse(state, playerId, action) {
  if (action.mode === "player") {
    const target = player(state, action.targetId);
    const p = player(state, playerId);
    if (!target || target.id === p.id || !target.alive || !target.hand.length) return "그 손패는 가져올 수 없습니다.";
    if (!Number.isInteger(action.index)) {
      state.prompt = { kind: "hand", playerId: p.id, targetId: target.id, count: target.hand.length, reason: "jesse" };
      return null;
    }
    return takeHiddenHand(state, p, target, action.index, "jesse");
  }
  state.prompt = null;
  drawTwo(state, null);
  return null;
}

function chooseHand(state, playerId, action) {
  const prompt = state.prompt;
  const target = player(state, prompt.targetId);
  const p = player(state, playerId);
  if (!target || !p) return "그 손패는 가져올 수 없습니다.";
  if (prompt.reason === "elgringo") return takeGringo(state, action.index);
  return takeHiddenHand(state, p, target, action.index, prompt.reason, prompt.cardId);
}

function openGringo(state) {
  const g = state.gringo;
  const src = g && player(state, g.sourceId);
  if (!g || !src?.hand.length || g.left <= 0) {
    finishGringo(state);
    return;
  }
  state.prompt = { kind: "hand", playerId: g.playerId, targetId: g.sourceId, count: src.hand.length, reason: "elgringo" };
  state.turnPhase = "react";
  log(state, `${player(state, g.playerId).nickname} 님이 가져온 손패를 고르고 있습니다.`);
}

function takeGringo(state, index) {
  const g = state.gringo;
  const src = g && player(state, g.sourceId);
  const thief = g && player(state, g.playerId);
  if (!g || !src || !thief || !Number.isInteger(index) || index < 0 || index >= src.hand.length) return "그 카드는 고를 수 없습니다.";
  const card = src.hand.splice(index, 1)[0];
  thief.hand.push(card);
  log(state, `${thief.nickname} 님이 ${src.nickname} 님의 손패를 한 장 가져왔습니다.`);
  cue(state, `${thief.nickname} · 엘 그린고 — 손패를 가져옵니다`);
  showFlip(state, {
    cards: [card],
    caption: `${thief.nickname} · 엘 그린고 — 손패 한 장을 가져감`,
    to: "hand",
    ownerId: thief.id,
    secret: true,
    know: [thief.id, src.id],
  });
  suzy(state, src);
  g.left -= 1;
  if (g.left > 0 && src.hand.length) {
    openGringo(state);
    return null;
  }
  finishGringo(state);
  return null;
}

function finishGringo(state) {
  const g = state.gringo;
  state.gringo = null;
  state.prompt = null;
  if (!g) return;
  const t = player(state, g.playerId);
  if (g.dying && t?.alive && t.hp <= 0) eliminate(state, t, g.killerId);
  if (state.phase === "end") return;
  continueResume(state, g.resume);
}

function takeHiddenHand(state, thief, target, index, reason, cardId) {
  if (!Number.isInteger(index) || index < 0 || index >= target.hand.length) return "그 카드는 고를 수 없습니다.";
  if (reason === "panic" || reason === "catbalou") {
    const idx = thief.hand.findIndex((c) => c.id === cardId);
    if (idx < 0) return "그 카드는 손에 없습니다.";
    const played = thief.hand.splice(idx, 1)[0];
    state.discard.push(played);
  }
  const card = target.hand.splice(index, 1)[0];
  state.prompt = null;
  if (reason === "jesse" || reason === "panic") {
    if (reason === "panic") thief.hand.push(card);
    log(state, `${thief.nickname} 님이 ${target.nickname} 님의 손패에서 한 장을 가져왔습니다.`);
    showFlip(state, {
      cards: [card],
      caption: `${thief.nickname} 님이 ${target.nickname} 님의 손패를 가져감`,
      to: "hand",
      ownerId: thief.id,
      secret: true,
      know: [thief.id, target.id],
    });
    suzy(state, target);
    if (reason === "jesse") drawTwo(state, card);
    else {
      state.turnPhase = "play";
      suzy(state, thief);
    }
    return null;
  }
  state.discard.push(card);
  log(state, `${thief.nickname} 님이 ${target.nickname} 님의 손패 한 장을 버리게 했습니다.`);
  showFlip(state, {
    cards: [card],
    caption: `${thief.nickname} 님이 ${target.nickname} 님의 손패를 버림`,
    to: "discard",
    secret: true,
    know: [thief.id, target.id],
  });
  suzy(state, target);
  state.turnPhase = "play";
  suzy(state, thief);
  return null;
}

function choosePedro(state, playerId, action) {
  state.prompt = null;
  if (action.mode === "discard" && state.discard.length) {
    const card = state.discard.pop();
    log(state, `${player(state, playerId).nickname} 님이 버린 카드 ${cardLabel(card)}을(를) 가져왔습니다.`);
    showFlip(state, { cards: [card], caption: `${player(state, playerId).nickname} · 페드로 라미레즈 — 버린 카드를 가져감`, to: "hand", ownerId: playerId });
    drawTwo(state, card);
    return null;
  }
  drawTwo(state, null);
  return null;
}

function chooseKit(state, playerId, cardId) {
  const prompt = state.prompt;
  const putBack = prompt.cards.find((c) => c.id === cardId) || prompt.cards[0];
  const keep = prompt.cards.filter((c) => c.id !== putBack.id);
  state.deck.push(putBack);
  const p = player(state, playerId);
  p.hand.push(...keep);
  state.prompt = null;
  log(state, `${p.nickname} 님이 두 장을 가져가고 한 장을 덱 위에 올렸습니다.`);
  showFlip(state, { cards: [putBack], caption: `${p.nickname} · 키트 칼슨 — 이 장을 덱에 올렸습니다`, to: "deck" });
  showFlip(state, { cards: keep, caption: `${p.nickname} · 키트 칼슨 — 두 장을 가져갑니다`, to: "hand", ownerId: p.id });
  enterPlay(state);
  return null;
}

function chooseMiss(state, playerId, action) {
  const combat = state.combat;
  const p = player(state, playerId);
  if (action.choice === "barrel" || action.choice === "jourdonnais") return useCheck(state, playerId, action.choice);
  if (action.choice === "take") {
    log(state, `${p.nickname} 님이 공격을 맞았습니다.`);
    const resume = combat.resume;
    const sourceId = combat.sourceId;
    state.prompt = null;
    inflict(state, p.id, 1, { sourceId, elGringo: true, resume });
    return null;
  }
  const idx = p.hand.findIndex((c) => c.id === action.cardId);
  if (idx < 0) return "그 카드는 손에 없습니다.";
  const card = p.hand[idx];
  const asMiss = card.type === "missed" || (p.character === "calamity" && card.type === "bang");
  if (!asMiss) return "빗나감!으로 막을 수 있는 카드가 아닙니다.";
  p.hand.splice(idx, 1);
  state.discard.push(card);
  combat.missedGot += 1;
  log(state, `${p.nickname} 님이 ${cardLabel(card)}으로 막았습니다. (${combat.missedGot}/${combat.missedNeed})`);
  if (p.character === "calamity" && card.type === "bang") cue(state, `${p.nickname} · 캘러미티 자넷 — 뱅!을 빗나감으로`);
  suzy(state, p);
  if (combat.missedGot >= combat.missedNeed) {
    defenseSuccess(state);
    return null;
  }
  state.prompt = { ...state.prompt, got: combat.missedGot };
  return null;
}

function chooseDiscardBang(state, playerId, action) {
  const p = player(state, playerId);
  const combat = state.combat;
  if (action.choice === "take") {
    const reason = combat.kind === "duel" ? "결투" : "인디언";
    log(state, `${p.nickname} 님이 ${reason}에서 뱅!을 내지 못했습니다.`);
    failBangDiscard(state, p.id);
    return null;
  }
  const idx = p.hand.findIndex((c) => c.id === action.cardId);
  if (idx < 0) return "그 카드는 손에 없습니다.";
  const card = p.hand[idx];
  const asBang = card.type === "bang" || (p.character === "calamity" && card.type === "missed");
  if (!asBang) return "뱅! 카드만 낼 수 있습니다.";
  p.hand.splice(idx, 1);
  state.discard.push(card);
  log(state, `${p.nickname} 님이 ${cardLabel(card)}을(를) 냈습니다.`);
  if (p.character === "calamity" && card.type === "missed") cue(state, `${p.nickname} · 캘러미티 자넷 — 빗나감을 뱅!으로`);
  suzy(state, p);
  if (combat.kind === "duel") {
    combat.duelTurn = combat.duelTurn === combat.sourceId ? combat.defenderId : combat.sourceId;
    state.prompt = { kind: "discard-bang", playerId: combat.duelTurn, reason: "duel", sourceId: combat.sourceId };
    return null;
  }
  nextIndians(state);
  return null;
}

function failBangDiscard(state, loserId) {
  const combat = state.combat;
  if (combat.kind === "duel") {
    const selfInflicted = loserId === combat.sourceId;
    state.prompt = null;
    inflict(state, loserId, 1, {
      sourceId: selfInflicted ? null : combat.sourceId,
      elGringo: !selfInflicted,
      resume: { type: "play" },
    });
    return;
  }
  state.prompt = null;
  inflict(state, loserId, 1, { sourceId: combat.sourceId, elGringo: true, resume: { type: "nextIndians" } });
}

function chooseSave(state, playerId, action) {
  const p = player(state, playerId);
  if (action.choice === "beer") {
    if (alive(state).length <= 2) return "둘이 남으면 맥주는 효과가 없습니다.";
    const idx = p.hand.findIndex((c) => c.id === action.cardId && c.type === "beer");
    if (idx < 0) return "맥주가 없습니다.";
    const card = p.hand.splice(idx, 1)[0];
    state.discard.push(card);
    if (p.hp < p.maxHp) p.hp += 1;
    log(state, `${p.nickname} 님이 맥주로 버텼습니다. (생명 ${p.hp})`);
    suzy(state, p);
    pumpDamage(state);
    return null;
  }
  if (action.choice === "sid") {
    return applySid(state, p, action.cardIds || [], true);
  }
  if (action.choice === "accept") {
    const d = state.dmg;
    d.lost += p.hp;
    for (let i = 0; i < p.hp; i += 1) onLifeLost(state, p, d);
    p.hp = 0;
    d.amount = 0;
    log(state, `${p.nickname} 님이 쓰러졌습니다.`);
    finishDamage(state);
    return null;
  }
  return "그렇게 버틸 수는 없습니다.";
}

function chooseStore(state, playerId, cardId) {
  const store = state.store;
  if (!store || store.pickerId !== playerId) return "지금은 고를 수 없습니다.";
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) return "그 카드는 깔려 있지 않습니다.";
  const card = store.cards.splice(idx, 1)[0];
  const p = player(state, playerId);
  p.hand.push(card);
  log(state, `${p.nickname} 님이 잡화점에서 ${cardLabel(card)}을(를) 가져갔습니다.`);
  suzy(state, p);
  if (!store.cards.length) {
    state.store = null;
    state.prompt = null;
    enterPlay(state);
    return null;
  }
  const order = store.order;
  let start = order.indexOf(playerId);
  for (let step = 1; step <= order.length; step += 1) {
    const id = order[(start + step) % order.length];
    if (player(state, id)?.alive) {
      store.pickerId = id;
      state.prompt = { kind: "store", playerId: id };
      return null;
    }
  }
  state.store = null;
  state.prompt = null;
  enterPlay(state);
  return null;
}

function sidHeal(state, playerId, cardIds) {
  const p = player(state, playerId);
  if (!p || p.character !== "sid") return "시드 케첨만 쓸 수 있습니다.";
  if (state.prompt && state.prompt.playerId !== playerId) return "다른 사람의 선택 중입니다.";
  if (state.prompt && state.prompt.kind !== "save") return "지금은 그 능력을 쓸 수 없습니다.";
  if (!state.prompt && (state.currentId !== playerId || state.turnPhase !== "play")) return "자신의 턴에만 회복할 수 있습니다.";
  return applySid(state, p, cardIds, Boolean(state.prompt && state.prompt.kind === "save"));
}

function applySid(state, p, cardIds, fromSave) {
  if (p.hp >= p.maxHp) return "이미 최대 생명력입니다.";
  const unique = [...new Set(cardIds)];
  if (unique.length !== 2) return "카드 두 장을 고르세요.";
  const cards = [];
  for (const id of unique) {
    const idx = p.hand.findIndex((c) => c.id === id);
    if (idx < 0) return "손에 없는 카드입니다.";
    cards.push(p.hand.splice(idx, 1)[0]);
  }
  state.discard.push(...cards);
  p.hp += 1;
  log(state, `${p.nickname} 님이 카드 두 장을 버리고 생명력 1을 회복했습니다. (${p.hp}/${p.maxHp})`);
  showFlip(state, { cards, caption: `${p.nickname} · 시드 케첨 — 생명 1 회복`, to: "discard" });
  suzy(state, p);
  if (fromSave) pumpDamage(state);
  return null;
}

function useCheck(state, playerId, label) {
  const combat = state.combat;
  const defender = player(state, playerId);
  if (!combat || combat.defenderId !== playerId) return "지금은 막을 수 없습니다.";
  if (label === "barrel") {
    if (!defender?.equipment.barrel || combat.usedBarrel) return "술통을 쓸 수 없습니다.";
    combat.usedBarrel = true;
  } else {
    if (defender?.character !== "jourdonnais" || combat.usedJourdonnais) return "주르도네를 쓸 수 없습니다.";
    combat.usedJourdonnais = true;
  }
  if (defender.character === "lucky") {
    const cards = drawUpTo(state, 2);
    if (cards.length <= 1) {
      resolveCheck(state, cards[0] || null, label);
      return null;
    }
    state.prompt = { kind: "lucky", playerId: defender.id, cards, mode: "combat", label };
    log(state, `${defender.nickname} 님이 ${label === "jourdonnais" ? "주르도네" : "술통"} 드로우! 로 두 장을 뒤집었습니다.`);
    showFlip(state, { cards, caption: `${defender.nickname} · 럭키 듀크 ${label === "jourdonnais" ? "주르도네" : "술통"} — 한 장을 고릅니다`, to: "hold" });
    return null;
  }
  resolveCheck(state, drawOne(state), label);
  return null;
}

function startDefense(state, defenderId, sourceId, need, resume) {
  state.combat = {
    kind: state.combat?.kind || "bang",
    sourceId,
    defenderId,
    missedNeed: need,
    missedGot: 0,
    usedBarrel: false,
    usedJourdonnais: false,
    resume,
    queue: state.combat?.queue || null,
  };
  state.turnPhase = "react";
  askMiss(state);
}

function runChecks(state) {
  if (state.phase === "end") return;
  const combat = state.combat;
  if (!combat) return;
  if (combat.missedGot >= combat.missedNeed) {
    defenseSuccess(state);
    return;
  }
  askMiss(state);
}

function resolveCheck(state, card, label) {
  if (card) state.discard.push(card);
  const hearts = card && card.suit === "hearts";
  const who = player(state, state.combat.defenderId);
  const ability = label === "jourdonnais" ? "주르도네" : "술통";
  log(state, `${who.nickname} 님의 ${ability}: ${card ? cardLabel(card) : "카드 없음"} — ${hearts ? "막았습니다." : "실패."}`);
  if (label === "jourdonnais") cue(state, `${who.nickname} · 주르도네 — ${hearts ? "하트라 피했습니다" : "막지 못했습니다"}`);
  showFlip(state, {
    cards: card ? [card] : [],
    caption: `${who.nickname} · ${ability} ${card ? cardLabel(card) : ""} — ${hearts ? "피했다!" : "실패"}`,
    to: "discard",
  });
  if (hearts) state.combat.missedGot += 1;
  runChecks(state);
}

function askMiss(state) {
  const combat = state.combat;
  const defender = player(state, combat.defenderId);
  const checks = [];
  if (defender?.character === "jourdonnais" && !combat.usedJourdonnais) checks.push("jourdonnais");
  if (defender?.equipment?.barrel && !combat.usedBarrel) checks.push("barrel");
  state.prompt = {
    kind: "miss",
    playerId: combat.defenderId,
    need: combat.missedNeed,
    got: combat.missedGot,
    sourceId: combat.sourceId,
    checks,
  };
}

function defenseSuccess(state) {
  const combat = state.combat;
  const resume = combat?.resume || { type: "play" };
  log(state, `${player(state, combat.defenderId).nickname} 님이 공격을 흘렸습니다.`);
  state.combat = combat.queue ? { ...combat, defenderId: null, checks: [], missedGot: 0 } : null;
  state.prompt = null;
  continueResume(state, resume);
}

function nextIndians(state) {
  if (state.phase === "end") return;
  const combat = state.combat;
  if (!combat || combat.kind !== "indians") {
    backToPlay(state);
    return;
  }
  while (combat.queue.length) {
    const id = combat.queue.shift();
    const p = player(state, id);
    if (p?.alive) {
      state.prompt = { kind: "discard-bang", playerId: id, reason: "indians", sourceId: combat.sourceId };
      state.turnPhase = "react";
      return;
    }
  }
  state.combat = null;
  state.prompt = null;
  backToPlay(state);
}

function nextGatling(state) {
  if (state.phase === "end") return;
  const combat = state.combat;
  if (!combat || combat.kind !== "gatling") {
    backToPlay(state);
    return;
  }
  while (combat.queue?.length) {
    const id = combat.queue.shift();
    const p = player(state, id);
    if (p?.alive) {
      startDefense(state, id, combat.sourceId, 1, { type: "nextGatling" });
      return;
    }
  }
  state.combat = null;
  state.prompt = null;
  backToPlay(state);
}

function continueResume(state, resume) {
  if (state.phase === "end") return;
  if (!resume || resume.type === "play") {
    backToPlay(state);
    return;
  }
  if (resume.type === "afterDynamite") {
    afterDynamite(state);
    return;
  }
  if (resume.type === "nextIndians") {
    nextIndians(state);
    return;
  }
  if (resume.type === "nextGatling") {
    nextGatling(state);
    return;
  }
  backToPlay(state);
}

function backToPlay(state) {
  if (state.phase === "end") return;
  const p = current(state);
  if (!p || !p.alive) {
    state.combat = null;
    nextTurn(state);
    return;
  }
  if (!state.combat || state.combat.kind !== "gatling" || !state.combat.queue?.length) state.combat = null;
  state.turnPhase = "play";
  state.prompt = null;
  suzy(state, p);
}

function nextTurn(state) {
  if (state.phase === "end") return;
  state.prompt = null;
  state.combat = null;
  const start = state.currentId;
  let id = start;
  for (let i = 0; i < state.players.length; i += 1) {
    id = clockwise(state, id)?.id;
    if (!id) break;
    const p = player(state, id);
    if (p?.alive) {
      startTurn(state, id);
      return;
    }
  }
}

function inflict(state, targetId, amount, ctx) {
  state.dmg = {
    targetId,
    amount,
    lost: 0,
    sourceId: ctx.sourceId || null,
    elGringo: Boolean(ctx.elGringo),
    resume: ctx.resume || { type: "play" },
  };
  pumpDamage(state);
}

function pumpDamage(state) {
  const d = state.dmg;
  if (!d) return;
  const t = player(state, d.targetId);
  if (!t || !t.alive) {
    finishDamage(state);
    return;
  }
  while (d.amount > 0 && t.hp > 1) {
    t.hp -= 1;
    d.amount -= 1;
    d.lost += 1;
    onLifeLost(state, t, d);
  }
  if (d.amount > 0 && t.hp <= 1) {
    if (canSave(state, t)) {
      state.prompt = { kind: "save", playerId: t.id, amount: d.amount, sourceId: d.sourceId };
      state.turnPhase = "react";
      log(state, `${t.nickname} 님이 치명상입니다. 맥주나 능력으로 버티거나 쓰러질 수 있습니다.`);
      return;
    }
    d.lost += t.hp;
    for (let i = 0; i < t.hp; i += 1) onLifeLost(state, t, d);
    t.hp = 0;
    d.amount = 0;
  }
  finishDamage(state);
}

function canSave(state, p) {
  if (p.hp >= p.maxHp) return false;
  if (p.character === "sid" && p.hand.length >= 2) return true;
  if (alive(state).length > 2 && p.hand.some((c) => c.type === "beer")) return true;
  return false;
}

function onLifeLost(state, target, d) {
  if (target.character === "elgringo" && d.elGringo && d.sourceId && d.sourceId !== target.id) {
    const src = player(state, d.sourceId);
    if (src?.hand.length) d.gringo = (d.gringo || 0) + 1;
  }
}

function finishDamage(state) {
  const d = state.dmg;
  if (!d) return;
  const t = player(state, d.targetId);
  state.dmg = null;
  state.prompt = null;
  if (t && d.lost > 0 && t.character === "bart") {
    const got = drawUpTo(state, d.lost);
    t.hand.push(...got);
    if (got.length) {
      log(state, `${t.nickname} 님이 잃은 생명만큼 카드를 ${got.length}장 뽑았습니다.`);
      cue(state, `${t.nickname} · 바트 캐시디 — 잃은 생명만큼 뽑습니다`);
      showFlip(state, { cards: got, caption: `${t.nickname} · 버트 캐시디 — 잃은 생명만큼 뽑음`, to: "hand", ownerId: t.id });
    }
  }
  if (t && t.hp > 0 && d.lost > 0) log(state, `${t.nickname} 님의 생명력 ${t.hp}/${t.maxHp}.`);
  const src = d.sourceId ? player(state, d.sourceId) : null;
  if ((d.gringo || 0) > 0 && t && src?.hand.length) {
    state.gringo = {
      playerId: t.id,
      sourceId: d.sourceId,
      left: d.gringo,
      dying: Boolean(t.hp <= 0 && t.alive),
      resume: d.resume,
      killerId: d.sourceId,
    };
    openGringo(state);
    return;
  }
  if (t && t.hp <= 0 && t.alive) eliminate(state, t, d.sourceId);
  if (state.phase === "end") return;
  continueResume(state, d.resume);
}

function eliminate(state, target, killerId) {
  target.alive = false;
  target.hp = 0;
  const pile = [...target.hand, ...equipList(target).map((e) => e.card)];
  target.hand = [];
  target.equipment = emptyEquip();
  const vulture = alive(state).find((p) => p.character === "vulture");
  if (vulture && pile.length) {
    vulture.hand.push(...pile);
    log(state, `${target.nickname} 님이 탈락했습니다. 벌쳐 샘이 카드 ${pile.length}장을 가져갔습니다.`);
    cue(state, `${vulture.nickname} · 벌쳐 샘 — 탈락한 카드를 가져갑니다`);
    showFlip(state, { cards: pile.slice(0, 6), caption: `${vulture.nickname} · 벌쳐 샘 — 탈락한 카드를 가져감`, to: "hand", ownerId: vulture.id });
    suzy(state, vulture);
  } else {
    if (pile.length) state.discard.push(...pile);
    log(state, `${target.nickname} 님이 탈락했습니다.`);
  }
  const killer = killerId ? player(state, killerId) : null;
  if (target.role === "outlaw" && killer && killer.alive && killer.id !== target.id) {
    const got = drawUpTo(state, 3);
    killer.hand.push(...got);
    log(state, `무법자 처치 보상으로 ${killer.nickname} 님이 카드를 ${got.length}장 뽑았습니다.`);
    suzy(state, killer);
  }
  if (target.role === "deputy" && killer && killer.role === "sheriff" && killer.alive) {
    const dumped = [...killer.hand, ...equipList(killer).map((e) => e.card)];
    killer.hand = [];
    killer.equipment = emptyEquip();
    if (dumped.length) state.discard.push(...dumped);
    log(state, `보안관이 부관을 쓰러뜨려 가지고 있던 카드를 모두 버렸습니다.`);
    suzy(state, killer);
  }
  checkWin(state);
}

function checkWin(state) {
  const living = alive(state);
  const sheriff = state.players.find((p) => p.role === "sheriff");
  if (!sheriff?.alive) {
    if (living.length === 1 && living[0].role === "renegade") {
      state.winner = { team: "renegade", playerId: living[0].id };
      log(state, `배신자 ${living[0].nickname} 님의 승리입니다. 마지막까지 살아남았습니다.`);
    } else {
      state.winner = { team: "outlaw" };
      log(state, "무법자의 승리입니다. 보안관이 쓰러졌습니다.");
    }
    endMatch(state);
    return;
  }
  if (!living.some((p) => p.role === "outlaw" || p.role === "renegade")) {
    state.winner = { team: "sheriff", playerId: sheriff.id };
    log(state, "보안관 팀의 승리입니다. 무법자와 배신자를 모두 쓰러뜨렸습니다.");
    endMatch(state);
  }
}

function endMatch(state) {
  state.phase = "end";
  state.prompt = null;
  state.combat = null;
  state.store = null;
  state.dmg = null;
  state.turnPhase = null;
}

function suzy(state, p) {
  if (!p || !p.alive || p.character !== "suzy") return;
  if (p.hand.length > 0) return;
  const card = drawOne(state);
  if (!card) return;
  p.hand.push(card);
  log(state, `${p.nickname} 님의 손패가 비어 카드를 1장 뽑았습니다.`);
  cue(state, `${p.nickname} · 수지 라파예트 — 빈손으로 한 장 뽑습니다`);
  showFlip(state, { cards: [card], caption: `${p.nickname} · 수지 라파예트 — 빈손으로 한 장 뽑음`, to: "hand", ownerId: p.id });
}

function drawOne(state) {
  if (!state.deck.length) reshuffle(state);
  if (!state.deck.length) return null;
  return state.deck.pop();
}

function drawUpTo(state, n) {
  const cards = [];
  for (let i = 0; i < n; i += 1) {
    const c = drawOne(state);
    if (!c) break;
    cards.push(c);
  }
  return cards;
}

function reshuffle(state) {
  if (!state.discard.length) return;
  state.deck = shuffle(state, state.discard);
  state.discard = [];
  log(state, "버린 카드를 다시 섞어 덱을 만들었습니다.");
}

function alive(state) {
  return state.players.filter((p) => p.alive).sort((a, b) => a.seat - b.seat);
}

function clockwise(state, id) {
  const list = state.players.slice().sort((a, b) => a.seat - b.seat);
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return null;
  for (let step = 1; step <= list.length; step += 1) {
    const p = list[(i + step) % list.length];
    if (p.alive) return p;
  }
  return null;
}

function othersClockwise(state, id) {
  const list = [];
  let cursor = id;
  for (let i = 0; i < state.players.length; i += 1) {
    const next = clockwise(state, cursor);
    if (!next || next.id === id) break;
    list.push(next.id);
    cursor = next.id;
  }
  return list;
}

function distance(state, from, to) {
  if (!from || !to || from.id === to.id) return 0;
  const list = alive(state);
  const i = list.findIndex((p) => p.id === from.id);
  const j = list.findIndex((p) => p.id === to.id);
  if (i < 0 || j < 0) return 99;
  const n = list.length;
  let d = Math.min((j - i + n) % n, (i - j + n) % n);
  if (to.equipment.mustang) d += 1;
  if (to.character === "paul") d += 1;
  if (from.equipment.scope) d -= 1;
  if (from.character === "rose") d -= 1;
  return Math.max(1, d);
}

function weaponRange(p) {
  return p.equipment.weapon ? (CARD_INFO[p.equipment.weapon.type].range || 1) : 1;
}

function player(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

function current(state) {
  return player(state, state.currentId);
}

function emptyEquip() {
  return { weapon: null, mustang: null, scope: null, barrel: null, jail: null, dynamite: null };
}

function equipList(p) {
  const eq = p.equipment || emptyEquip();
  const out = [];
  if (eq.weapon) out.push({ slot: "weapon", card: eq.weapon });
  for (const slot of ["barrel", "mustang", "scope", "jail", "dynamite"]) {
    if (eq[slot]) out.push({ slot, card: eq[slot] });
  }
  return out;
}

function pullEquip(p, cardId) {
  const eq = p.equipment;
  for (const slot of ["weapon", "mustang", "scope", "barrel", "jail", "dynamite"]) {
    if (eq[slot] && eq[slot].id === cardId) {
      const card = eq[slot];
      eq[slot] = null;
      return card;
    }
  }
  return null;
}

function mint(state, type, suit, rank) {
  const id = `c${state.nextCard}`;
  state.nextCard += 1;
  return { id, type, suit, rank };
}

function rand(state) {
  state.seed |= 0;
  state.seed = (state.seed + 0x6D2B79F5) | 0;
  let t = Math.imul(state.seed ^ (state.seed >>> 15), 1 | state.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle(state, list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand(state) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Final-consonant-aware Korean particles, including the ㄹ exception for 으로/로.
function particle(word, choices) {
  const token = String(word).trim();
  const hangul = token.match(/[가-힣](?=[^가-힣]*$)/)?.[0];
  let jong = 0;
  if (hangul) {
    jong = (hangul.charCodeAt(0) - 0xac00) % 28;
  } else {
    const digit = token.match(/[0-9](?=[^0-9]*$)/)?.[0];
    const digitJong = { 0: 21, 1: 8, 2: 0, 3: 16, 4: 0, 5: 0, 6: 1, 7: 8, 8: 8, 9: 0 };
    jong = digit == null ? 0 : digitJong[digit];
  }
  const forms = {
    "을(를)": ["을", "를"], "이(가)": ["이", "가"],
    "은(는)": ["은", "는"], "과(와)": ["과", "와"],
    "으로(로)": ["으로", "로"],
  };
  const pair = forms[choices];
  if (!pair) return choices;
  const hasFinal = Boolean(jong) && !(choices === "으로(로)" && jong === 8);
  return hasFinal ? pair[0] : pair[1];
}

function naturalKorean(text) {
  return String(text)
    .replace(/([^\s]+?)\(으\)로/g, (_, word) => word + particle(word, "으로(로)"))
    .replace(/([^\s]+?)(을\(를\)|이\(가\)|은\(는\)|과\(와\)|으로\(로\))/g,
      (_, word, pair) => word + particle(word, pair));
}

export { naturalKorean };

function markArc(state, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  state.arc = { fromId, toId, phase: "flash", at: Date.now() };
}

function setAim(state, playerId, targetId) {
  if (state.phase !== "play" || state.currentId !== playerId || state.turnPhase !== "play") return null;
  if (!targetId) {
    if (state.arc?.phase === "preview") state.arc = null;
    return null;
  }
  const target = player(state, targetId);
  if (!target?.alive || target.id === playerId) return null;
  if (state.arc?.phase === "preview" && state.arc.toId === targetId && state.arc.fromId === playerId) return null;
  state.arc = { fromId: playerId, toId: targetId, phase: "preview", at: Date.now() };
  return null;
}

function showFlip(state, { cards, caption, to, ownerId, secret, know }) {
  if (!state.events) state.events = [];
  state.events.push({
    id: `e${state.events.length}-${state.seed}-${state.log.length}`,
    cards: (cards || []).filter(Boolean).map(publicCard),
    caption: naturalKorean(caption),
    to: to || "discard",
    ownerId: ownerId || "",
    secret: Boolean(secret),
    know: know || [],
  });
  if (state.events.length > 40) state.events.shift();
}

function projectEvent(ev, viewerId) {
  if (!ev?.secret || (ev.know || []).includes(viewerId)) return ev;
  return {
    ...ev,
    cards: (ev.cards || []).map((card) => ({ id: card.id, type: "back", back: true, suit: "", rank: "" })),
  };
}

function cue(state, text) {
  if (!state.cues) state.cues = [];
  state.cues.push({ id: `c${state.cues.length}-${state.log.length}`, text: naturalKorean(text) });
  if (state.cues.length > 8) state.cues.shift();
}

function log(state, text) {
  state.log.push({ id: `l${state.log.length}-${state.seq}`, text: naturalKorean(text), t: Date.now() });
  if (state.log.length > 80) state.log.shift();
}

function cleanName(name) {
  const t = String(name || "").replace(/\s+/g, " ").trim().slice(0, 12);
  return t || "무명";
}

export function projectView(state, viewerId) {
  const reveal = state.phase === "end";
  const you = player(state, viewerId);
  const prompt = projectPrompt(state, viewerId);
  return {
    seq: state.seq || 0,
    phase: state.phase,
    hostId: state.hostId,
    yourId: viewerId,
    yourName: you?.nickname || "",
    currentId: state.currentId,
    turnPhase: state.turnPhase,
    winner: state.winner,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    discardTop: state.discard.length ? state.discard[state.discard.length - 1] : null,
    log: state.log.slice(-50),
    cues: (state.cues || []).slice(-4),
    paused: Boolean(state.paused),
    events: (state.events || []).slice(-16).map((ev) => projectEvent(ev, viewerId)),
    arc: state.arc && (state.arc.phase === "preview" || Date.now() - state.arc.at < 1600)
      ? { fromId: state.arc.fromId, toId: state.arc.toId, phase: state.arc.phase, at: state.arc.at }
      : null,
    chat: state.chat.slice(-40),
    prompt,
    store: state.store ? { cards: state.store.cards.map(publicCard), pickerId: state.store.pickerId } : null,
    bangsPlayed: state.bangsPlayed,
    players: state.players.map((p) => projectPlayer(state, p, viewerId, reveal)),
    roster: state.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      seat: p.seat,
      connected: p.connected !== false,
      isHost: p.id === state.hostId,
    })),
    handInfo: you && state.phase === "play" && state.currentId === viewerId && state.turnPhase === "play" && !state.prompt
      ? handInfo(state, you)
      : [],
  };
}

function projectPlayer(state, p, viewerId, reveal) {
  const self = p.id === viewerId;
  return {
    id: p.id,
    nickname: p.nickname,
    seat: p.seat,
    connected: p.connected !== false,
    alive: p.alive !== false,
    character: p.character,
    hp: p.hp,
    maxHp: p.maxHp,
    handCount: p.hand?.length || 0,
    hand: self ? (p.hand || []).map(publicCard) : undefined,
    equipment: {
      weapon: p.equipment?.weapon ? publicCard(p.equipment.weapon) : null,
      mustang: p.equipment?.mustang ? publicCard(p.equipment.mustang) : null,
      scope: p.equipment?.scope ? publicCard(p.equipment.scope) : null,
      barrel: p.equipment?.barrel ? publicCard(p.equipment.barrel) : null,
      jail: p.equipment?.jail ? publicCard(p.equipment.jail) : null,
      dynamite: p.equipment?.dynamite ? publicCard(p.equipment.dynamite) : null,
    },
    role: reveal || !p.alive || p.role === "sheriff" || self ? p.role : null,
    choices: state.phase === "select" && self ? p.choices : null,
    isHost: p.id === state.hostId,
    distance: self || !p.alive || state.phase !== "play" ? null : distanceFromYou(state, viewerId, p.id),
  };
}

function distanceFromYou(state, viewerId, otherId) {
  const you = player(state, viewerId);
  const other = player(state, otherId);
  if (!you?.alive || !other?.alive) return null;
  return distance(state, you, other);
}

function publicCard(card) {
  return { id: card.id, type: card.type, suit: card.suit, rank: card.rank };
}

function projectPrompt(state, viewerId) {
  const prompt = state.prompt;
  if (!prompt) return null;
  const mine = prompt.playerId === viewerId;
  const base = { kind: prompt.kind, playerId: prompt.playerId, mine };
  if (!mine && prompt.kind === "kit") return base;
  if (prompt.kind === "lucky") return { ...base, cards: prompt.cards.map(publicCard), mode: prompt.mode };
  if (prompt.kind === "kit") return { ...base, cards: prompt.cards.map(publicCard) };
  if (prompt.kind === "pedro") return { ...base, top: prompt.top ? publicCard(prompt.top) : null };
  if (prompt.kind === "jesse") return { ...base, options: prompt.options };
  if (prompt.kind === "hand") return { ...base, count: prompt.count, targetId: prompt.targetId, reason: prompt.reason };
  if (prompt.kind === "miss") return { ...base, need: prompt.need, got: prompt.got, sourceId: prompt.sourceId, checks: prompt.checks || [] };
  if (prompt.kind === "reveal") return mine ? { ...base, cardId: prompt.cardId } : base;
  if (prompt.kind === "discard-bang") return { ...base, reason: prompt.reason, sourceId: prompt.sourceId };
  if (prompt.kind === "discard") return { ...base, count: prompt.count };
  if (prompt.kind === "save") return { ...base, amount: prompt.amount };
  if (prompt.kind === "store") return base;
  return base;
}

function handInfo(state, p) {
  return p.hand.map((card) => describePlay(state, p, card));
}

function describePlay(state, p, card) {
  const type = effectiveType(p, card, "play");
  if (type === "missed") return { cardId: card.id, ok: false, reason: "빗나감!은 막을 때만 냅니다.", targets: [] };
  if (type === "bang") {
    if (!unlimitedBang(p) && state.bangsPlayed >= 1) {
      return { cardId: card.id, ok: false, reason: "이번 턴의 뱅!을 이미 썼습니다.", targets: [] };
    }
    const range = weaponRange(p);
    const targets = [];
    const blocked = [];
    for (const t of alive(state)) {
      if (t.id === p.id) continue;
      const dist = distance(state, p, t);
      if (dist <= range) targets.push({ id: t.id });
      else blocked.push({ id: t.id, reason: `사정거리 밖입니다. (거리 ${dist}, 사거리 ${range})` });
    }
    if (!targets.length) return { cardId: card.id, ok: false, reason: "사정거리 안에 아무도 없습니다.", targets, blocked };
    return { cardId: card.id, ok: true, reason: "", targets, blocked, needsTarget: true };
  }
  if (WEAPONS.has(type) || (SELF_BLUE.includes(type) && type !== "dynamite")) {
    if (SELF_BLUE.includes(type) && p.equipment[type]) {
      return { cardId: card.id, ok: false, reason: "이미 같은 카드가 앞에 있습니다.", targets: [] };
    }
    return { cardId: card.id, ok: true, reason: "", targets: [], needsTarget: false };
  }
  if (type === "dynamite") {
    if (p.equipment.dynamite) return { cardId: card.id, ok: false, reason: "이미 다이너마이트가 있습니다.", targets: [] };
    return { cardId: card.id, ok: true, reason: "", targets: [], needsTarget: false };
  }
  if (type === "jail") {
    const targets = [];
    const blocked = [];
    for (const t of alive(state)) {
      if (t.role === "sheriff") blocked.push({ id: t.id, reason: "보안관은 감옥에 넣을 수 없습니다." });
      else if (t.equipment.jail) blocked.push({ id: t.id, reason: "이미 감옥에 있는 플레이어입니다." });
      else targets.push({ id: t.id });
    }
    if (!targets.length) return { cardId: card.id, ok: false, reason: "감옥에 넣을 수 있는 사람이 없습니다.", targets, blocked };
    return { cardId: card.id, ok: true, reason: "", targets, blocked, needsTarget: true };
  }
  if (type === "duel") {
    const targets = alive(state).filter((t) => t.id !== p.id).map((t) => ({ id: t.id }));
    return { cardId: card.id, ok: targets.length > 0, reason: "", targets, needsTarget: true };
  }
  if (type === "panic") {
    const targets = [];
    for (const t of alive(state)) {
      const equips = equipList(t).map((e) => e.card.id);
      if (t.id === p.id) {
        if (equips.length) targets.push({ id: t.id, takes: equips });
        continue;
      }
      if (distance(state, p, t) > 1) continue;
      const takes = [];
      if (t.hand.length) takes.push("hand");
      takes.push(...equips);
      if (takes.length) targets.push({ id: t.id, takes });
    }
    const blocked = alive(state)
      .filter((t) => t.id !== p.id && distance(state, p, t) > 1)
      .map((t) => ({ id: t.id, reason: "강탈!은 거리 1만 가능합니다." }));
    if (!targets.length) return { cardId: card.id, ok: false, reason: "거리 1 안에 빼앗을 카드가 없습니다.", targets, blocked };
    return { cardId: card.id, ok: true, reason: "", targets, blocked, needsTarget: true, needsTake: true };
  }
  if (type === "catbalou") {
    const targets = alive(state).map((t) => {
      const takes = [];
      if (t.hand.length) takes.push("hand");
      takes.push(...equipList(t).map((e) => e.card.id));
      return { id: t.id, takes };
    });
    return { cardId: card.id, ok: true, reason: "", targets, needsTarget: true, needsTake: true };
  }
  return { cardId: card.id, ok: true, reason: "", targets: [], needsTarget: false };
}

export function autoChoice(state, playerId) {
  const p = player(state, playerId);
  if (!p) return null;
  if (state.phase === "select" && p.choices?.length) return { type: "choose", characterId: p.choices[0] };
  const prompt = state.prompt;
  if (!prompt || prompt.playerId !== playerId) {
    if (state.phase === "play" && state.currentId === playerId && state.turnPhase === "draw") return { type: "draw" };
    if (state.phase === "play" && state.currentId === playerId && state.turnPhase === "play") return { type: "end" };
    return null;
  }
  if (prompt.kind === "discard") {
    return { type: "discard", cardIds: p.hand.slice(0, prompt.count).map((c) => c.id) };
  }
  if (prompt.kind === "save") return { type: "respond", choice: "accept" };
  if (prompt.kind === "miss" || prompt.kind === "discard-bang") {
    return { type: "respond", choice: "take" };
  }
  if (prompt.kind === "jesse" || prompt.kind === "pedro") return { type: "respond", mode: "deck" };
  if (prompt.kind === "reveal") return { type: "respond", choice: "reveal" };
  if (prompt.kind === "hand") return { type: "respond", index: 0 };
  if (prompt.kind === "kit" || prompt.kind === "lucky") return { type: "respond", cardId: prompt.cards[0].id };
  if (prompt.kind === "store") return { type: "respond", cardId: state.store.cards[0].id };
  return { type: "end" };
}

export { cardLabel, distance, ROLES, characterById, CARD_INFO };
