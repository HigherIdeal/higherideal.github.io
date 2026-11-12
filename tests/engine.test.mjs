import assert from "node:assert/strict";
import test from "node:test";
import { baseDeckTemplates } from "../lab/js/cards.js";
import {
  addPlayer,
  autoChoice,
  claimSeat,
  createLobby,
  dispatch,
  expireDisconnects,
  markDisconnect,
  projectView,
} from "../lab/js/engine.js";

function card(id, type, suit, rank) {
  return { id, type, suit, rank };
}

function table(n = 4, seed = 7) {
  const names = ["가", "나", "다", "라", "마", "바", "사"];
  const state = createLobby({ id: "p0", nickname: names[0] }, seed);
  for (let i = 1; i < n; i += 1) addPlayer(state, `p${i}`, names[i]);
  const started = dispatch(state, "p0", { type: "start" });
  assert.equal(started.ok, true);
  for (const p of state.players) {
    const res = dispatch(state, p.id, { type: "choose", characterId: p.choices[0] });
    assert.equal(res.ok, true, res.error);
  }
  return state;
}

function drain(state, limit = 30) {
  let n = 0;
  while (n < limit && state.turnPhase === "draw" && !state.prompt && state.currentId) {
    const res = dispatch(state, state.currentId, { type: "draw" });
    assert.equal(res.ok, true, res.error);
    n += 1;
  }
  while (state.prompt && n < limit) {
    const kind = state.prompt.kind;
    const who = state.prompt.playerId;
    const action = autoChoice(state, who);
    const res = dispatch(state, who, action);
    assert.equal(res.ok, true, `${kind}: ${res.error}`);
    n += 1;
  }
}

function ready(state) {
  drain(state);
  const cur = state.players.find((p) => p.id === state.currentId);
  cur.hand = cur.hand.slice(0, cur.hp);
  return cur;
}

test("base deck has the official 80-card counts", () => {
  const deck = baseDeckTemplates();
  assert.equal(deck.length, 80);
  const count = (type) => deck.filter((c) => c.type === type).length;
  assert.equal(count("bang"), 25);
  assert.equal(count("missed"), 12);
  assert.equal(count("beer"), 6);
  assert.equal(count("catbalou"), 4);
  assert.equal(count("panic"), 4);
  assert.equal(count("duel"), 3);
  assert.equal(count("stagecoach"), 2);
  assert.equal(count("wells"), 1);
  assert.equal(count("store"), 2);
  assert.equal(count("indians"), 2);
  assert.equal(count("gatling"), 1);
  assert.equal(count("saloon"), 1);
  assert.equal(count("jail"), 3);
  assert.equal(count("dynamite"), 1);
  assert.equal(count("barrel"), 2);
  assert.equal(count("scope"), 1);
  assert.equal(count("mustang"), 2);
  assert.equal(count("schofield"), 3);
  assert.equal(count("remington"), 1);
  assert.equal(count("carbine"), 1);
  assert.equal(count("winchester"), 1);
  assert.equal(count("volcanic"), 2);
  const ids = new Set(deck.map((c) => `${c.type}:${c.suit}:${c.rank}`));
  assert.ok(ids.has("dynamite:hearts:2"));
  assert.ok(ids.has("gatling:hearts:10"));
  assert.ok(ids.has("wells:hearts:3"));
});

test("roles, sheriff bonus, private view, and first turn", () => {
  for (const n of [4, 5, 6, 7]) {
    const state = table(n, 3 + n);
    const roles = state.players.map((p) => p.role).sort();
    const expected = {
      4: ["outlaw", "outlaw", "renegade", "sheriff"],
      5: ["deputy", "outlaw", "outlaw", "renegade", "sheriff"],
      6: ["deputy", "outlaw", "outlaw", "outlaw", "renegade", "sheriff"],
      7: ["deputy", "deputy", "outlaw", "outlaw", "outlaw", "renegade", "sheriff"],
    }[n];
    assert.deepEqual(roles, expected);
    const sheriff = state.players.find((p) => p.role === "sheriff");
    assert.equal(state.currentId, sheriff.id);
    assert.equal(sheriff.hp, sheriff.maxHp);
    if (state.turnPhase === "draw") assert.equal(dispatch(state, sheriff.id, { type: "draw" }).ok, true);
    assert.ok(sheriff.hand.length >= sheriff.maxHp + 2);
    const base = sheriff.character === "paul" || sheriff.character === "elgringo" ? 3 : 4;
    assert.equal(sheriff.maxHp, base + 1);
    const other = state.players.find((p) => p.role !== "sheriff");
    const view = projectView(state, other.id);
    assert.equal(view.players.find((p) => p.id === sheriff.id).role, "sheriff");
    assert.equal(view.players.find((p) => p.id === other.id).role, other.role);
    const hidden = view.players.find((p) => p.id !== other.id && p.role !== "sheriff");
    assert.equal(hidden.role, null);
    assert.equal(view.players.find((p) => p.id !== other.id).hand, undefined);
    assert.ok(view.players.find((p) => p.id === other.id).hand.length >= 1);
    assert.equal(view.deckCount, state.deck.length);
    assert.equal("deck" in view, false);
  }
});

test("one player cannot start and a guest cannot start", () => {
  const state = createLobby({ id: "p0", nickname: "가" }, 1);
  assert.equal(dispatch(state, "p0", { type: "start" }).ok, false);
  addPlayer(state, "p1", "나");
  assert.equal(dispatch(state, "p1", { type: "start" }).ok, false);
});

test("two players are sheriff and outlaw, and either kill wins", () => {
  function shortTable(seed) {
    const state = createLobby({ id: "a", nickname: "가" }, seed);
    addPlayer(state, "b", "나");
    assert.equal(dispatch(state, "a", { type: "start" }).ok, true);
    assert.deepEqual(state.players.map((p) => p.role).sort(), ["outlaw", "sheriff"]);
    for (const p of state.players) {
      assert.equal(dispatch(state, p.id, { type: "choose", characterId: p.choices[0] }).ok, true);
    }
    drain(state);
    return state;
  }
  const emptyEquip = () => ({ weapon: null, mustang: null, scope: null, barrel: null, jail: null, dynamite: null });
  function strike(state, fromId, toId) {
    const from = state.players.find((p) => p.id === fromId);
    const to = state.players.find((p) => p.id === toId);
    to.hp = 1;
    to.hand = [];
    to.equipment = emptyEquip();
    from.character = "sid";
    to.character = "sid";
    from.hand.push(card(`bang-${fromId}`, "bang", "clubs", "5"));
    state.currentId = fromId;
    state.turnPhase = "play";
    state.prompt = null;
    state.bangsPlayed = 0;
    const played = dispatch(state, fromId, { type: "play", cardId: `bang-${fromId}`, targetId: toId });
    assert.equal(played.ok, true, played.error);
    if (state.prompt?.kind === "miss") {
      const taken = dispatch(state, toId, { type: "respond", choice: "take" });
      assert.equal(taken.ok, true, taken.error);
    }
  }
  const sheriffWins = shortTable(21);
  const sheriff = sheriffWins.players.find((p) => p.role === "sheriff");
  const outlaw = sheriffWins.players.find((p) => p.role === "outlaw");
  strike(sheriffWins, sheriff.id, outlaw.id);
  assert.equal(sheriffWins.phase, "end");
  assert.equal(sheriffWins.winner.team, "sheriff");

  const outlawWins = shortTable(22);
  const sheriff2 = outlawWins.players.find((p) => p.role === "sheriff");
  const outlaw2 = outlawWins.players.find((p) => p.role === "outlaw");
  strike(outlawWins, outlaw2.id, sheriff2.id);
  assert.equal(outlawWins.phase, "end");
  assert.equal(outlawWins.winner.team, "outlaw");

  const three = createLobby({ id: "a", nickname: "가" }, 4);
  addPlayer(three, "b", "나");
  addPlayer(three, "c", "다");
  assert.equal(dispatch(three, "a", { type: "start" }).ok, true);
  assert.deepEqual(three.players.map((p) => p.role).sort(), ["outlaw", "renegade", "sheriff"]);
});

test("distance, weapons, and one Bang per turn", () => {
  const state = table(4, 11);
  const cur = ready(state);
  cur.character = "sid";
  const seats = state.players.slice().sort((a, b) => a.seat - b.seat);
  const i = seats.findIndex((p) => p.id === cur.id);
  const near = seats[(i + 1) % 4];
  const far = seats[(i + 2) % 4];
  near.character = "sid";
  far.character = "sid";
  near.equipment.mustang = card("horse", "mustang", "hearts", "8");
  cur.hand = [card("b1", "bang", "clubs", "2"), card("b2", "bang", "clubs", "3"), card("gun", "schofield", "clubs", "J"), card("volc", "volcanic", "clubs", "10")];
  let res = dispatch(state, cur.id, { type: "play", cardId: "b1", targetId: near.id });
  assert.equal(res.ok, false);
  near.equipment.mustang = null;
  res = dispatch(state, cur.id, { type: "play", cardId: "gun" });
  assert.equal(res.ok, true, res.error);
  res = dispatch(state, cur.id, { type: "play", cardId: "b1", targetId: far.id });
  assert.equal(res.ok, true, res.error);
  dispatch(state, far.id, { type: "respond", choice: "take" });
  res = dispatch(state, cur.id, { type: "play", cardId: "b2", targetId: near.id });
  assert.equal(res.ok, false);
  res = dispatch(state, cur.id, { type: "play", cardId: "volc" });
  assert.equal(res.ok, true, res.error);
  res = dispatch(state, cur.id, { type: "play", cardId: "b2", targetId: near.id });
  assert.equal(res.ok, true, res.error);
});

test("barrel hearts cancel a Bang and Slab still needs a second Missed", () => {
  const state = table(4, 12);
  const cur = ready(state);
  cur.character = "slab";
  const seats = state.players.slice().sort((a, b) => a.seat - b.seat);
  const i = seats.findIndex((p) => p.id === cur.id);
  const target = seats[(i + 1) % seats.length];
  target.character = "rose";
  target.equipment.barrel = card("bar", "barrel", "spades", "Q");
  state.deck.push(card("h", "beer", "hearts", "6"));
  cur.hand.push(card("b", "bang", "diamonds", "5"));
  const before = target.hp;
  const res = dispatch(state, cur.id, { type: "play", cardId: "b", targetId: target.id });
  assert.equal(res.ok, true, res.error);
  assert.equal(state.prompt?.kind, "miss");
  assert.equal(state.prompt.got, 0);
  assert.equal(state.prompt.need, 2);
  assert.ok(state.prompt.checks.includes("barrel"));
  assert.equal(dispatch(state, target.id, { type: "respond", choice: "barrel" }).ok, true);
  assert.equal(state.prompt?.kind, "miss");
  assert.equal(state.prompt.got, 1);
  assert.equal(state.prompt.need, 2);
  assert.equal(target.hp, before);
  target.hand.push(card("m", "missed", "spades", "2"));
  dispatch(state, target.id, { type: "respond", choice: "card", cardId: "m" });
  assert.equal(state.prompt, null);
  assert.equal(target.hp, before);
});

test("dynamite explodes on a spade 2-9 and beer can save the last life", () => {
  const state = table(4, 13);
  const cur = ready(state);
  const seats = state.players.slice().sort((a, b) => a.seat - b.seat);
  const i = seats.findIndex((p) => p.id === cur.id);
  const nxt = seats[(i + 1) % seats.length];
  nxt.character = "rose";
  nxt.hp = 3;
  nxt.maxHp = 4;
  nxt.hand = [card("beer", "beer", "hearts", "8")];
  nxt.equipment.dynamite = card("dyn", "dynamite", "hearts", "2");
  state.deck.push(card("sp", "missed", "spades", "8"));
  cur.hand = cur.hand.slice(0, cur.hp);
  dispatch(state, cur.id, { type: "end" });
  assert.equal(state.currentId, nxt.id);
  assert.equal(state.prompt.kind, "save");
  assert.equal(nxt.equipment.dynamite, null);
  dispatch(state, nxt.id, { type: "respond", choice: "beer", cardId: "beer" });
  assert.equal(nxt.alive, true);
  assert.ok(nxt.hp >= 1);
});

test("jail skips the turn unless the draw is hearts", () => {
  const state = table(4, 14);
  const cur = ready(state);
  const seats = state.players.slice().sort((a, b) => a.seat - b.seat);
  const i = seats.findIndex((p) => p.id === cur.id);
  const nxt = seats[(i + 1) % seats.length];
  nxt.character = "sid";
  nxt.equipment.jail = card("jail", "jail", "spades", "J");
  state.deck.push(card("club", "bang", "clubs", "4"));
  const hp = nxt.hp;
  cur.hand = cur.hand.slice(0, cur.hp);
  dispatch(state, cur.id, { type: "end" });
  assert.notEqual(state.currentId, nxt.id);
  assert.equal(nxt.hp, hp);
  assert.equal(nxt.equipment.jail, null);
});

test("outlaw reward, deputy penalty, and the three win conditions", () => {
  const state = table(4, 15);
  drain(state);
  const sheriff = state.players.find((p) => p.role === "sheriff");
  const outlaw = state.players.find((p) => p.role === "outlaw");
  const deputy = state.players.find((p) => p.role === "deputy");
  const renegade = state.players.find((p) => p.role === "renegade");
  assert.ok(sheriff && outlaw && renegade);
  outlaw.hp = 1;
  outlaw.hand = [];
  outlaw.equipment = { weapon: null, mustang: null, scope: null, barrel: null, jail: null, dynamite: null };
  sheriff.character = "rose";
  sheriff.hand.push(card("b", "bang", "clubs", "5"));
  if (state.currentId !== sheriff.id) {
    state.currentId = sheriff.id;
    state.turnPhase = "play";
    state.prompt = null;
    state.bangsPlayed = 0;
  }
  const before = sheriff.hand.length;
  dispatch(state, sheriff.id, { type: "play", cardId: "b", targetId: outlaw.id });
  if (state.prompt?.kind === "miss") dispatch(state, outlaw.id, { type: "respond", choice: "take" });
  assert.equal(outlaw.alive, false);
  assert.ok(sheriff.hand.length >= before - 1 + 3 - 5);
  assert.equal(state.phase, "play");

  if (deputy) {
    deputy.hp = 1;
    deputy.hand = [];
    sheriff.hand.push(card("b2", "bang", "clubs", "6"));
    state.bangsPlayed = 0;
    state.prompt = null;
    state.turnPhase = "play";
    sheriff.hand.push(card("keep", "beer", "hearts", "9"));
    dispatch(state, sheriff.id, { type: "play", cardId: "b2", targetId: deputy.id });
    if (state.prompt?.kind === "miss") dispatch(state, deputy.id, { type: "respond", choice: "take" });
    if (state.prompt?.kind === "save") dispatch(state, deputy.id, { type: "respond", choice: "accept" });
    assert.equal(deputy.alive, false);
    assert.equal(sheriff.hand.length, 0);
    assert.equal(sheriff.equipment.weapon, null);
  }

  renegade.hp = 5;
  renegade.alive = true;
  for (const p of state.players) {
    if (p.role === "outlaw") p.alive = false;
    if (p !== sheriff && p !== renegade && p.role !== "sheriff") p.alive = false;
  }
  sheriff.alive = true;
  sheriff.hp = 1;
  sheriff.hand = [];
  renegade.character = "rose";
  renegade.hand = [card("rb", "bang", "diamonds", "A")];
  state.phase = "play";
  state.currentId = renegade.id;
  state.turnPhase = "play";
  state.prompt = null;
  state.bangsPlayed = 0;
  state.winner = null;
  dispatch(state, renegade.id, { type: "play", cardId: "rb", targetId: sheriff.id });
  if (state.prompt?.kind === "miss") dispatch(state, sheriff.id, { type: "respond", choice: "take" });
  if (state.prompt?.kind === "save") dispatch(state, sheriff.id, { type: "respond", choice: "accept" });
  assert.equal(state.phase, "end");
  assert.equal(state.winner.team, "renegade");
});

test("if the sheriff dies while an outlaw remains, outlaws win", () => {
  const state = table(4, 16);
  drain(state);
  const sheriff = state.players.find((p) => p.role === "sheriff");
  const outlaw = state.players.find((p) => p.role === "outlaw");
  sheriff.hp = 1;
  sheriff.hand = [];
  sheriff.character = "rose";
  outlaw.character = "rose";
  outlaw.hand.push(card("b", "bang", "clubs", "2"));
  state.currentId = outlaw.id;
  state.turnPhase = "play";
  state.prompt = null;
  state.bangsPlayed = 0;
  dispatch(state, outlaw.id, { type: "play", cardId: "b", targetId: sheriff.id });
  if (state.prompt?.kind === "miss") dispatch(state, sheriff.id, { type: "respond", choice: "take" });
  if (state.prompt?.kind === "save") dispatch(state, sheriff.id, { type: "respond", choice: "accept" });
  assert.equal(state.winner.team, "outlaw");
  const view = projectView(state, outlaw.id);
  assert.ok(view.players.every((p) => p.role));
});

test("Suzy draws from an empty hand and Vulture Sam collects the dead", () => {
  const state = table(4, 17);
  drain(state);
  const suzy = state.players[0];
  suzy.character = "suzy";
  suzy.alive = true;
  suzy.hand = [card("only", "bang", "clubs", "2")];
  const other = state.players[1];
  other.alive = true;
  other.hand = [];
  other.equipment.mustang = card("m", "mustang", "hearts", "8");
  state.deck.push(card("drawn", "beer", "hearts", "6"));
  state.currentId = other.id;
  state.turnPhase = "play";
  state.prompt = null;
  other.hand = [card("panic", "panic", "hearts", "A"), card("filler", "beer", "hearts", "7")];
  other.character = "rose";
  const res = dispatch(state, other.id, { type: "play", cardId: "panic", targetId: suzy.id, take: "hand" });
  assert.equal(res.ok, true, res.error);
  assert.equal(state.prompt.kind, "hand");
  assert.equal(dispatch(state, other.id, { type: "respond", index: 0 }).ok, true);
  assert.equal(suzy.hand.length, 1);
  assert.equal(suzy.hand[0].id, "drawn");

  const victim = state.players[2];
  victim.alive = true;
  victim.hp = 1;
  victim.hand = [card("loot", "bang", "diamonds", "K")];
  victim.equipment = { weapon: card("gun", "volcanic", "clubs", "10"), mustang: null, scope: null, barrel: null, jail: null, dynamite: null };
  const sam = state.players[3];
  sam.character = "vulture";
  sam.alive = true;
  sam.hand = [];
  const killer = other;
  killer.hand.push(card("kb", "bang", "clubs", "9"));
  state.bangsPlayed = 0;
  dispatch(state, killer.id, { type: "play", cardId: "kb", targetId: victim.id });
  if (state.prompt?.kind === "miss") dispatch(state, victim.id, { type: "respond", choice: "take" });
  if (state.prompt?.kind === "save") dispatch(state, victim.id, { type: "respond", choice: "accept" });
  assert.equal(victim.alive, false);
  assert.ok(sam.hand.some((c) => c.id === "loot"));
  assert.ok(sam.hand.some((c) => c.id === "gun"));
});

test("full games reach a win without throwing", () => {
  let finished = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const state = table(4 + (seed % 4), seed * 17);
    for (let step = 0; step < 700 && state.phase !== "end"; step += 1) {
      if (state.prompt) {
        const kind = state.prompt.kind;
        const who = state.prompt.playerId;
        const action = autoChoice(state, who);
        const res = dispatch(state, who, action);
        assert.equal(res.ok, true, `${kind} ${res.error}`);
        continue;
      }
      if (state.phase !== "play") break;
      if (state.turnPhase === "draw") {
        const res = dispatch(state, state.currentId, { type: "draw" });
        assert.equal(res.ok, true, res.error);
        continue;
      }
      const id = state.currentId;
      const view = projectView(state, id);
      const me = state.players.find((p) => p.id === id);
      const sheriff = state.players.find((p) => p.role === "sheriff" && p.alive);
      let played = false;
      for (const info of view.handInfo) {
        if (!info.ok) continue;
        const cardInHand = me.hand.find((c) => c.id === info.cardId);
        const offensive = ["bang", "duel", "indians", "gatling"].includes(cardInHand.type)
          || (me.character === "calamity" && cardInHand.type === "missed");
        if (!offensive) continue;
        const action = { type: "play", cardId: cardInHand.id };
        if (info.needsTarget) {
          const sheriffHit = sheriff && info.targets.some((t) => t.id === sheriff.id) && sheriff.id !== id;
          const target = sheriffHit ? sheriff.id : info.targets[0].id;
          action.targetId = target;
          if (info.needsTake) action.take = info.targets.find((t) => t.id === target).takes[0];
        }
        const res = dispatch(state, id, action);
        assert.equal(res.ok, true, res.error);
        played = true;
        break;
      }
      if (!played) {
        const res = dispatch(state, id, { type: "end" });
        assert.equal(res.ok, true, `${res.error} phase ${state.turnPhase}`);
      }
    }
    if (state.phase === "end") finished += 1;
  }
  assert.ok(finished >= 8, `finished ${finished}`);
});

test("same id keeps the seat, a new name is suffixed, and a full room still lets them back", () => {
  const state = createLobby({ id: "h", nickname: "방장" }, 3);
  for (let i = 1; i <= 6; i += 1) addPlayer(state, `p${i}`, "철수");
  assert.equal(state.players.length, 7);
  assert.equal(state.players.find((p) => p.id === "p1").nickname, "철수");
  assert.equal(state.players.find((p) => p.id === "p2").nickname, "철수(2)");
  assert.equal(state.players.find((p) => p.id === "p6").nickname, "철수(6)");
  const rejected = addPlayer(state, "extra", "새손님");
  assert.equal(rejected.ok, false);
  assert.equal(state.players.length, 7);
  const back = addPlayer(state, "p3", "철수");
  assert.equal(back.ok, true);
  assert.equal(state.players.length, 7);
  assert.equal(state.players.find((p) => p.id === "p3").connected, true);

  const game = table(4);
  const who = game.players[1];
  const hand = who.hand.map((c) => c.id);
  const hp = who.hp;
  const role = who.role;
  const character = who.character;
  who.equipment.barrel = { id: "blue-barrel", type: "barrel", suit: "spades", rank: "K" };
  who.equipment.mustang = { id: "blue-mustang", type: "mustang", suit: "hearts", rank: "9" };
  markDisconnect(game, who.id, 5000);
  assert.equal(who.connected, false);
  assert.equal(expireDisconnects(game, 9_999_999), false);
  assert.equal(game.players.length, 4);
  addPlayer(game, who.id, "다른이름");
  assert.deepEqual(who.hand.map((c) => c.id), hand);
  assert.equal(who.role, role);
  assert.equal(who.character, character);
  assert.ok(hp > 0);
  assert.equal(who.hp, hp);
  assert.equal(who.equipment.barrel.id, "blue-barrel");
  assert.equal(who.equipment.mustang.id, "blue-mustang");
  assert.equal(who.connected, true);
  assert.notEqual(who.nickname, "다른이름");
  const view = projectView(game, who.id);
  assert.equal(view.roster.find((p) => p.id === who.id).connected, true);
});

test("a dropped player keeps the seat through the grace period", () => {
  const lobby = createLobby({ id: "h", nickname: "방장" }, 1);
  addPlayer(lobby, "p1", "나래");
  markDisconnect(lobby, "p1", 10_000);
  assert.equal(lobby.players.length, 2);
  assert.equal(lobby.players[1].connected, false);
  assert.equal(expireDisconnects(lobby, 10_000 + 59_000), false);
  assert.equal(lobby.players.some((p) => p.id === "p1"), true);
  assert.equal(expireDisconnects(lobby, 10_000 + 60_000), true);
  assert.equal(lobby.players.some((p) => p.id === "p1"), false);
  markDisconnect(lobby, "h", 10_000);
  assert.equal(lobby.players[0].id, "h");
  assert.equal(lobby.players[0].connected, false);
  assert.equal(expireDisconnects(lobby, 10_000 + 120_000), false);
});

test("a disconnected nickname reclaims the same seat and its hand", () => {
  const state = table(2, 3);
  const seat = state.players[1];
  seat.hand = [{ id: "secret", type: "bang", suit: "hearts", rank: "A" }];
  markDisconnect(state, seat.id);
  const rejected = claimSeat(state, "other", seat.nickname);
  assert.equal(rejected.ok, true);
  assert.equal(state.players[1].id, "other");
  assert.equal(state.players[1].hand[0].id, "secret");
  state.players[1].connected = true;
  const duplicate = claimSeat(state, "third", seat.nickname);
  assert.equal(duplicate.ok, false);
});
