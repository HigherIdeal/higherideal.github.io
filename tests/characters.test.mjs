import assert from "node:assert/strict";
import test from "node:test";
import { addPlayer, autoChoice, createLobby, dispatch } from "../lab/js/engine.js";

function card(id, type, suit, rank) {
  return { id, type, suit, rank };
}

function playable(chars) {
  const state = createLobby({ id: "p0", nickname: "가" }, 11);
  for (let i = 1; i < chars.length; i += 1) addPlayer(state, `p${i}`, "나나다라마바사"[i] || `p${i}`);
  assert.equal(dispatch(state, "p0", { type: "start" }).ok, true);
  state.players.forEach((p, i) => { p.choices = [chars[i], chars[i]]; });
  for (const p of state.players) {
    assert.equal(dispatch(state, p.id, { type: "choose", characterId: p.choices[0] }).ok, true);
  }
  while (state.turnPhase === "draw" && !state.prompt) {
    assert.equal(dispatch(state, state.currentId, { type: "draw" }).ok, true);
  }
  return state;
}

test("Paul Regret is one farther away", () => {
  const state = playable(["paul", "rose", "bart", "suzy"]);
  const paul = state.players.find((p) => p.character === "paul");
  const other = state.players.find((p) => p.character === "bart");
  state.currentId = other.id;
  state.turnPhase = "play";
  other.hand = [card("b1", "bang", "spades", "A")];
  const blocked = dispatch(state, other.id, { type: "play", cardId: "b1", targetId: paul.id });
  assert.equal(blocked.ok, false);
  assert.match(state.cues.map((c) => c.text).join(" "), /폴 리그레트|사정거리/);
});

test("Rose Doolan reaches one step farther", () => {
  const state = playable(["rose", "bart", "suzy", "willy"]);
  const rose = state.players.find((p) => p.character === "rose");
  const far = state.players[(state.players.findIndex((p) => p.id === rose.id) + 2) % 4];
  state.currentId = rose.id;
  state.turnPhase = "play";
  state.bangsPlayed = 0;
  rose.hand = [card("b1", "bang", "spades", "A")];
  const shot = dispatch(state, rose.id, { type: "play", cardId: "b1", targetId: far.id });
  assert.equal(shot.ok, true, shot.error);
  assert.match(state.cues.at(-1).text, /로즈 둘란/);
});

test("Willy the Kid can play a second Bang", () => {
  const state = playable(["willy", "bart", "suzy", "rose"]);
  const willy = state.players.find((p) => p.character === "willy");
  const target = state.players.find((p) => p.id !== willy.id);
  state.currentId = willy.id;
  state.turnPhase = "play";
  state.bangsPlayed = 1;
  willy.hand = [card("b2", "bang", "clubs", "K")];
  const shot = dispatch(state, willy.id, { type: "play", cardId: "b2", targetId: target.id });
  assert.equal(shot.ok, true, shot.error);
  assert.match(state.cues.at(-1).text, /윌리 더 키드/);
});

test("Slab the Killer demands two misses", () => {
  const state = playable(["slab", "bart", "suzy", "rose"]);
  const slab = state.players.find((p) => p.character === "slab");
  const target = state.players.find((p) => p.id !== slab.id);
  state.currentId = slab.id;
  state.turnPhase = "play";
  state.bangsPlayed = 0;
  slab.hand = [card("b1", "bang", "spades", "9")];
  assert.equal(dispatch(state, slab.id, { type: "play", cardId: "b1", targetId: target.id }).ok, true);
  assert.equal(state.combat.missedNeed, 2);
  assert.match(state.cues.at(-1).text, /슬랩 더 킬러/);
});

test("Calamity Janet plays a Bang as a Miss", () => {
  const state = playable(["willy", "calamity", "suzy", "rose"]);
  const willy = state.players.find((p) => p.character === "willy");
  const janet = state.players.find((p) => p.character === "calamity");
  state.currentId = willy.id;
  state.turnPhase = "play";
  willy.hand = [card("b1", "bang", "spades", "A")];
  assert.equal(dispatch(state, willy.id, { type: "play", cardId: "b1", targetId: janet.id }).ok, true);
  janet.hand = [card("asbang", "bang", "hearts", "Q")];
  const miss = dispatch(state, janet.id, { type: "respond", choice: "card", cardId: "asbang" });
  assert.equal(miss.ok, true, miss.error);
  assert.match(state.cues.map((c) => c.text).join(" "), /캘러미티 자넷/);
});

test("Jourdonnais checks a heart before the Bang lands", () => {
  const state = playable(["willy", "jourdonnais", "suzy", "rose"]);
  const willy = state.players.find((p) => p.character === "willy");
  const j = state.players.find((p) => p.character === "jourdonnais");
  state.currentId = willy.id;
  state.turnPhase = "play";
  willy.hand = [card("b1", "bang", "spades", "A")];
  state.deck.push(card("heart", "missed", "hearts", "2"));
  assert.equal(dispatch(state, willy.id, { type: "play", cardId: "b1", targetId: j.id }).ok, true);
  assert.match(state.cues.map((c) => c.text).join(" "), /주르도네/);
  assert.ok(j.hp === j.maxHp);
});

test("Bart Cassidy draws when he loses life", () => {
  const state = playable(["willy", "bart", "suzy", "rose"]);
  const willy = state.players.find((p) => p.character === "willy");
  const bart = state.players.find((p) => p.character === "bart");
  const before = bart.hand.length;
  state.currentId = willy.id;
  state.turnPhase = "play";
  willy.hand = [card("b1", "bang", "spades", "A")];
  assert.equal(dispatch(state, willy.id, { type: "play", cardId: "b1", targetId: bart.id }).ok, true);
  assert.equal(dispatch(state, bart.id, { type: "respond", choice: "take" }).ok, true);
  assert.equal(bart.hp, bart.maxHp - 1);
  assert.ok(bart.hand.length > before);
  assert.match(state.cues.map((c) => c.text).join(" "), /바트 캐시디/);
});

test("El Gringo steals a card from the shooter", () => {
  const state = playable(["willy", "elgringo", "suzy", "rose"]);
  const willy = state.players.find((p) => p.character === "willy");
  const gringo = state.players.find((p) => p.character === "elgringo");
  state.currentId = willy.id;
  state.turnPhase = "play";
  willy.hand = [card("b1", "bang", "spades", "A"), card("keep", "beer", "hearts", "8")];
  const before = gringo.hand.length;
  assert.equal(dispatch(state, willy.id, { type: "play", cardId: "b1", targetId: gringo.id }).ok, true);
  assert.equal(dispatch(state, gringo.id, { type: "respond", choice: "take" }).ok, true);
  assert.ok(gringo.hand.length > before);
  assert.match(state.cues.map((c) => c.text).join(" "), /엘 그/);
});

test("Suzy Lafayette draws when her hand is empty", () => {
  const state = playable(["suzy", "bart", "willy", "rose"]);
  const suzy = state.players.find((p) => p.character === "suzy");
  state.currentId = suzy.id;
  state.turnPhase = "play";
  suzy.hand = [card("b1", "bang", "spades", "A")];
  const target = state.players.find((p) => p.id !== suzy.id);
  assert.equal(dispatch(state, suzy.id, { type: "play", cardId: "b1", targetId: target.id }).ok, true);
  assert.ok(suzy.hand.length >= 1);
  assert.match(state.cues.map((c) => c.text).join(" "), /수잔 라파예트|수지/);
});

test("Vulture Sam collects a eliminated player's cards", () => {
  const state = playable(["willy", "bart", "vulture", "rose"]);
  const willy = state.players.find((p) => p.character === "willy");
  const bart = state.players.find((p) => p.character === "bart");
  const sam = state.players.find((p) => p.character === "vulture");
  bart.hp = 1;
  bart.hand = [card("loot", "bang", "hearts", "4")];
  state.currentId = willy.id;
  state.turnPhase = "play";
  willy.hand = [card("b1", "bang", "spades", "A")];
  const before = sam.hand.length;
  assert.equal(dispatch(state, willy.id, { type: "play", cardId: "b1", targetId: bart.id }).ok, true);
  assert.equal(dispatch(state, bart.id, { type: "respond", choice: "take" }).ok, true);
  assert.equal(bart.alive, false);
  assert.ok(sam.hand.length > before);
  assert.match(state.cues.map((c) => c.text).join(" "), /벌쳐 샘/);
});

test("Kit Carlson keeps two of three cards", () => {
  const state = playable(["kit", "bart", "suzy", "rose"]);
  const kit = state.players.find((p) => p.character === "kit");
  state.deck.push(card("k3", "beer", "hearts", "6"), card("k2", "missed", "clubs", "5"), card("k1", "bang", "spades", "A"));
  let guard = 0;
  while (state.prompt?.kind !== "kit" && state.phase === "play" && guard < 16) {
    guard += 1;
    const actor = state.prompt?.playerId || state.currentId;
    const choice = autoChoice(state, actor);
    assert.equal(dispatch(state, actor, choice).ok, true);
  }
  assert.equal(state.prompt.kind, "kit");
  assert.equal(state.prompt.cards.length, 3);
  const back = state.prompt.cards[2];
  const keep = state.prompt.cards.slice(0, 2).map((c) => c.id);
  const before = kit.hand.length;
  assert.equal(dispatch(state, kit.id, { type: "respond", cardId: back.id }).ok, true);
  assert.equal(kit.hand.length, before + 2);
  assert.ok(keep.every((id) => kit.hand.some((c) => c.id === id)));
  assert.equal(state.deck.at(-1).id, back.id);
  assert.equal(kit.hand.some((c) => c.id === back.id), false);
});

test("Black Jack reveals the second card", () => {
  const state = playable(["blackjack", "bart", "suzy", "rose"]);
  const jack = state.players.find((p) => p.character === "blackjack");
  state.currentId = jack.id;
  state.turnPhase = "draw";
  state.prompt = null;
  state.deck.push(card("red", "bang", "hearts", "A"), card("first", "missed", "clubs", "4"));
  assert.equal(dispatch(state, jack.id, { type: "draw" }).ok, true);
  assert.match((state.cues || []).map((c) => c.text).join(" "), /블랙 잭/);
});

test("Jesse Jones can take the first card from a hand", () => {
  const state = playable(["jesse", "bart", "suzy", "rose"]);
  const jesse = state.players.find((p) => p.character === "jesse");
  const other = state.players.find((p) => p.id !== jesse.id);
  other.hand.push(card("stolen", "beer", "hearts", "9"));
  state.currentId = jesse.id;
  state.turnPhase = "draw";
  state.prompt = { kind: "jesse", playerId: jesse.id, options: [other.id] };
  const before = other.hand.length;
  assert.equal(dispatch(state, jesse.id, { type: "respond", mode: "player", targetId: other.id }).ok, true);
  assert.equal(state.prompt.kind, "hand");
  const index = other.hand.findIndex((c) => c.id === "stolen");
  assert.equal(dispatch(state, jesse.id, { type: "respond", index }).ok, true);
  assert.equal(other.hand.some((c) => c.id === "stolen"), false);
  assert.ok(other.hand.length < before);
});

test("Pedro Ramirez can take the discard", () => {
  const state = playable(["pedro", "bart", "suzy", "rose"]);
  const pedro = state.players.find((p) => p.character === "pedro");
  state.discard.push(card("top", "beer", "hearts", "8"));
  state.currentId = pedro.id;
  state.turnPhase = "draw";
  state.prompt = { kind: "pedro", playerId: pedro.id, top: state.discard.at(-1) };
  assert.equal(dispatch(state, pedro.id, { type: "respond", mode: "discard" }).ok, true);
  assert.ok(pedro.hand.some((c) => c.id === "top"));
});

test("Lucky Duke picks one of two check cards", () => {
  const state = playable(["lucky", "bart", "suzy", "rose"]);
  const lucky = state.players.find((p) => p.character === "lucky");
  const a = card("a", "missed", "hearts", "A");
  const b = card("b", "bang", "spades", "9");
  state.prompt = { kind: "lucky", playerId: lucky.id, cards: [a, b], mode: "jail" };
  lucky.equipment.jail = card("jail", "jail", "spades", "2");
  state.currentId = lucky.id;
  const res = dispatch(state, lucky.id, { type: "respond", cardId: "a" });
  assert.equal(res.ok, true, res.error);
});

test("Sid Ketchum discards two cards to heal", () => {
  const state = playable(["sid", "bart", "suzy", "rose"]);
  const sid = state.players.find((p) => p.character === "sid");
  sid.hp = sid.maxHp - 1;
  sid.hand = [card("s1", "bang", "spades", "A"), card("s2", "missed", "clubs", "K")];
  state.currentId = sid.id;
  state.turnPhase = "play";
  state.prompt = null;
  assert.equal(dispatch(state, sid.id, { type: "sid", cardIds: ["s1", "s2"] }).ok, true);
  assert.equal(sid.hp, sid.maxHp);
});
