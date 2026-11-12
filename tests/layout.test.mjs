import assert from "node:assert/strict";
import test from "node:test";
import { cameraRig, layoutOverlaps, projectPoint, projectedCards, solveProjectedLayout } from "../lab/js/layout.js";

const views = [
  [412, 915],
  [1888, 1000],
];

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

for (const [width, height] of views) {
  for (const count of [2, 3, 4, 5, 6, 7]) {
    test(`projected zones stay apart for ${count} players at ${width}x${height}`, () => {
      const layout = solveProjectedLayout(width, height, count);
      assert.equal(layout.leaves.filter((zone) => zone.kind === "character").length, count);
      assert.equal(layoutOverlaps(layout.leaves), false);
      const { cards } = projectedCards(width, height, count);
      assert.ok(cards.every((card) => card.fit), `a card could not be placed at ${width}x${height}`);
      const boxes = cards.map((card) => card.fit.screen);
      for (let i = 0; i < boxes.length; i += 1) {
        const zone = cards[i].zone;
        assert.ok(boxes[i].x >= zone.x - 2 && boxes[i].y >= zone.y - 2);
        assert.ok(boxes[i].x + boxes[i].w <= zone.x + zone.w + 2);
        assert.ok(boxes[i].y + boxes[i].h <= zone.y + zone.h + 2);
        for (let j = i + 1; j < boxes.length; j += 1) {
          assert.equal(overlap(boxes[i], boxes[j]), false, `${cards[i].zone.kind} overlaps ${cards[j].zone.kind}`);
        }
      }
      const label = layout.leaves.find((zone) => zone.kind === "label");
      const character = layout.leaves.find((zone) => zone.kind === "character" && zone.seat === label.seat);
      assert.equal(overlap(label, character), false);
    });
  }
}

test("four seats sit on a centered ellipse and the near cards stay large", () => {
  const width = 1888;
  const height = 1000;
  const layout = solveProjectedLayout(width, height, 4);
  const centers = layout.seats.map((seat) => ({ x: seat.cx, y: seat.cy }));
  const mid = width / 2;
  assert.ok(Math.abs(centers[0].x - mid) < 30, "you sit at the bottom center");
  assert.ok(centers[0].y > centers[2].y, "your seat is nearer than the far seat");
  assert.ok(Math.abs((centers[1].x + centers[3].x) / 2 - mid) < 40, "left and right mirror each other");
  assert.ok(centers[3].x - centers[1].x > width * 0.55, "the ellipse uses the width");
  const near = layout.leaves.find((zone) => zone.kind === "character" && zone.seat === 0);
  const far = layout.leaves.find((zone) => zone.kind === "character" && zone.seat === 2);
  assert.ok(near.w > 70, `near card is ${near.w}`);
  assert.ok(far.h < near.h * 0.75, "far card is foreshortened");
  assert.ok(near.h / near.w < 1.35, "the near card is not face-on");
});

test("seven players share one ring, with you at the bottom", () => {
  for (const [width, height] of views) {
    const layout = solveProjectedLayout(width, height, 7);
    const seats = layout.seats;
    assert.equal(seats.length, 7);
    const me = seats[0];
    const left = seats[1];
    const right = seats[6];
    assert.ok(Math.abs(me.cx - width / 2) < 40, "you are at the bottom center");
    assert.ok(left.cx < me.cx - 20 && right.cx > me.cx + 20, "neighbours sit on either side");
    assert.ok(me.cy > left.cy && me.cy > right.cy, "neighbours continue up the ring");
    const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
    const nearest = Math.min(...seats.slice(1).map((seat) => dist(me, seat)));
    assert.ok(dist(me, left) <= nearest + 1 && dist(me, right) <= nearest + 1);
    const cards = layout.leaves.filter((zone) => zone.kind !== "label");
    for (const zone of cards) {
      assert.ok(zone.x >= -1 && zone.y >= -1, zone.id);
      assert.ok(zone.x + zone.w <= width + 1, zone.id);
      assert.ok(zone.y + zone.h <= height + 1, zone.id);
    }
  }
  const phone = solveProjectedLayout(412, 915, 7);
  const ys = phone.seats.map((seat) => seat.cy);
  const xs = phone.seats.map((seat) => seat.cx);
  assert.ok(Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs), "the phone ring is taller than it is wide");
  const near = phone.leaves.find((zone) => zone.kind === "character" && zone.seat === 0);
  assert.ok(near.w > 60, `phone cards stay large (${near.w})`);
});

test("the table origin projects to the middle of the view", () => {
  const width = 1888;
  const height = 1000;
  const cam = cameraRig(width, height);
  const point = projectPoint(cam, { x: 0, y: 0, z: 0 }, width, height);
  assert.ok(Math.abs(point.x - width / 2) < 2);
  assert.ok(Math.abs(point.y - height / 2) < 2);
});
