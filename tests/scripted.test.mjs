import assert from "node:assert/strict";
import test from "node:test";
import { addPlayer, createLobby, dispatch } from "../lab/js/engine.js";

function table() {
  const state = createLobby({ id: "p0", nickname: "가람" }, 3);
  for (const [id, name] of [["p1", "나래"], ["p2", "다온"], ["p3", "라온"], ["p4", "마루"]]) {
    addPlayer(state, id, name);
  }
  return state;
}

const setup = {
  roles: ["sheriff", "deputy", "outlaw", "outlaw", "renegade"],
  characters: ["bart", "jesse", "pedro", "lucky", "sid"],
  hands: [
    [{ type: "bang", suit: "diamonds", rank: "4" }],
    [{ type: "beer", suit: "hearts", rank: "6" }],
    [],
    [],
    [],
  ],
  deck: [
    { type: "missed", suit: "clubs", rank: "2" },
    { type: "missed", suit: "clubs", rank: "3" },
    { type: "wells", suit: "hearts", rank: "3" },
  ],
  discard: [{ type: "beer", suit: "hearts", rank: "7" }],
  hp: [5, 4, 4, 4, 3],
};

test("a setup payload does not change a normal deal", () => {
  globalThis.__BANG_TEST = false;
  const state = table();
  const result = dispatch(state, "p0", { type: "start", setup });
  assert.equal(result.ok, true, result.error);
  assert.equal(state.phase, "select");
  assert.ok(state.players[0].choices?.length);
  assert.equal(state.players[0].hand.length, 0);
});

test("the harness deals roles, hands, and the deck top first", () => {
  globalThis.__BANG_TEST = true;
  try {
    const state = table();
    const result = dispatch(state, "p0", { type: "start", setup });
    assert.equal(result.ok, true, result.error);
    assert.equal(state.phase, "play");
    const seats = state.players.slice().sort((a, b) => a.seat - b.seat);
    assert.deepEqual(seats.map((p) => p.role), setup.roles);
    assert.equal(seats[0].hand.some((c) => c.rank === "4" && c.suit === "diamonds" && c.type === "bang"), true);
    assert.equal(state.discard.at(-1).rank, "7");
    assert.equal(state.turnPhase, "draw");
    assert.equal(dispatch(state, "p0", { type: "draw" }).ok, true);
    const hand = seats[0].hand;
    assert.equal(hand.some((c) => c.rank === "2" && c.suit === "clubs"), true);
    assert.equal(hand.some((c) => c.rank === "3" && c.suit === "clubs"), true);
    assert.equal(state.deck.at(-1).type, "wells");
    assert.equal(seats[4].hp, 3);
  } finally {
    globalThis.__BANG_TEST = false;
  }
});
