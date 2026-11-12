/** Place table zones so they never overlap. Coordinates are in a 0..1 view, y grows downward. */

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function place(count, scale) {
  const zones = [];
  const cardW = 0.16 * scale;
  const cardH = cardW * 1.45;
  const deckW = 0.11 * scale;
  const deckH = deckW * 1.45;
  zones.push({ id: "deck", kind: "deck", x: 0.5 - deckW - 0.02 * scale, y: 0.40, w: deckW, h: deckH, scale });
  zones.push({ id: "discard", kind: "discard", x: 0.5 + 0.02 * scale, y: 0.40, w: deckW, h: deckH, scale });
  const cx = 0.5;
  const cy = 0.42;
  const rx = 0.40;
  const ry = 0.30;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.PI * 0.5 + (Math.PI * 2 * i) / count;
    const seatW = cardW * 1.35;
    const seatH = cardH * 1.15;
    const x = cx + Math.cos(angle) * rx - seatW / 2;
    const y = cy + Math.sin(angle) * ry * 0.85 - seatH / 2;
    zones.push({ id: `seat-${i}`, kind: "seat", index: i, x, y, w: seatW, h: seatH, scale });
    if (i === 0) {
      zones.push({
        id: "table-jail",
        kind: "table",
        x: x + seatW + 0.01 * scale,
        y: y + seatH * 0.15,
        w: cardW * 0.55,
        h: cardH * 0.55,
        scale,
      });
    }
  }
  return zones;
}

export function solveTableLayout(playerCount) {
  const count = Math.max(1, Math.min(7, playerCount));
  let scale = 1;
  let zones = place(count, scale);
  for (let step = 0; step < 28; step += 1) {
    let hit = false;
    for (let i = 0; i < zones.length && !hit; i += 1) {
      for (let j = i + 1; j < zones.length; j += 1) {
        if (overlap(zones[i], zones[j])) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) return { scale, zones };
    scale *= 0.9;
    zones = place(count, scale);
  }
  return { scale, zones };
}

export function layoutOverlaps(zones) {
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      if (overlap(zones[i], zones[j])) return true;
    }
  }
  return false;
}
