import assert from "node:assert/strict";
import test from "node:test";
import { layoutOverlaps, solveTableLayout } from "../lab/js/layout.js";

for (const count of [2, 3, 4, 5, 6, 7]) {
  test(`table zones do not overlap for ${count} players`, () => {
    const layout = solveTableLayout(count);
    assert.equal(layoutOverlaps(layout.zones), false);
    assert.ok(layout.scale > 0.2);
    assert.ok(layout.zones.some((zone) => zone.kind === "deck"));
    assert.ok(layout.zones.some((zone) => zone.kind === "discard"));
    assert.equal(layout.zones.filter((zone) => zone.kind === "seat").length, count);
  });
}
