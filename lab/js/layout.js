/** Screen-space table zones, measured after the perspective camera. */

const GAP = 8;

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function mul(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function len(a) {
  return Math.hypot(a.x, a.y, a.z);
}
function norm(a) {
  const l = len(a) || 1;
  return mul(a, 1 / l);
}

export function cameraRig(width, height) {
  const aspect = width / Math.max(1, height);
  const fov = 46 * Math.PI / 180;
  const phone = aspect <= 1.2;
  const tilt = (phone ? 64 : 56) * Math.PI / 180;
  const dist = phone ? 4.7 : 5.8;
  return {
    fov,
    aspect,
    position: { x: 0, y: Math.sin(tilt) * dist, z: Math.cos(tilt) * dist },
    lookAt: { x: 0, y: 0, z: 0 },
  };
}

function basis(cam) {
  const forward = norm(sub(cam.lookAt, cam.position));
  let right = cross(forward, { x: 0, y: 1, z: 0 });
  if (len(right) < 1e-5) right = { x: 1, y: 0, z: 0 };
  right = norm(right);
  const up = norm(cross(right, forward));
  return { forward, right, up };
}

export function projectPoint(cam, world, width, height) {
  const { forward, right, up } = basis(cam);
  const rel = sub(world, cam.position);
  const x = dot(rel, right);
  const y = dot(rel, up);
  const z = dot(rel, forward);
  if (z <= 0.05) return null;
  const t = Math.tan(cam.fov / 2);
  const ndcX = x / (z * cam.aspect * t);
  const ndcY = y / (z * t);
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
  };
}

export function screenToTable(cam, px, py, width, height) {
  const { forward, right, up } = basis(cam);
  const t = Math.tan(cam.fov / 2);
  const ndcX = (px / width) * 2 - 1;
  const ndcY = 1 - (py / height) * 2;
  const dir = norm(add(add(mul(right, ndcX * cam.aspect * t), mul(up, ndcY * t)), forward));
  if (Math.abs(dir.y) < 1e-4) return null;
  const k = -cam.position.y / dir.y;
  if (k <= 0) return null;
  return add(cam.position, mul(dir, k));
}

function handReserve(width) {
  return width >= 800 ? 132 : 118;
}

function playField(width, height) {
  const wide = width >= 800;
  const top = wide ? 54 : 48;
  const side = wide ? 20 : 6;
  const bottom = handReserve(width);
  return {
    x: side,
    y: top,
    w: Math.max(80, width - side * 2),
    h: Math.max(80, height - top - bottom),
  };
}

/** Card top points at the table center, matching the mesh yaw. */
export function cardYaw(x, z) {
  return Math.atan2(-x, -z) + Math.PI;
}

function rectsOverlap(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

function orientedBox(cam, center, cardW, cardD, width, height) {
  const len = Math.hypot(center.x, center.z) || 1;
  const ux = -center.x / len;
  const uz = -center.z / len;
  const rx = uz;
  const rz = -ux;
  const corners = [];
  for (const sx of [-cardW / 2, cardW / 2]) {
    for (const sz of [-cardD / 2, cardD / 2]) {
      corners.push(projectPoint(cam, {
        x: center.x + rx * sx + ux * sz,
        y: 0.02,
        z: center.z + rz * sx + uz * sz,
      }, width, height));
    }
  }
  if (corners.some((point) => !point)) return null;
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function boxOf(cam, center, cardW, cardD, width, height, oriented = false) {
  return oriented
    ? orientedBox(cam, center, cardW, cardD, width, height)
    : projectCard(cam, center, cardW, cardD, width, height);
}

export function placeLayout(width, height, count, cardW, radiusScale = 1, stacks = []) {
  const cam = cameraRig(width, height);
  const play = playField(width, height);
  const cardD = cardW * 1.45;
  const nearWorld = screenToTable(cam, play.x + play.w / 2, play.y + play.h - 2, width, height);
  const farWorld = screenToTable(cam, play.x + play.w / 2, play.y + 2, width, height);
  const sideWorld = screenToTable(cam, play.x + 2, play.y + play.h / 2, width, height);
  if (!nearWorld || !farWorld || !sideWorld) return null;
  const nearBox = orientedBox(cam, nearWorld, cardW, cardD, width, height);
  const farBox = orientedBox(cam, farWorld, cardW, cardD, width, height);
  const sideBox = orientedBox(cam, sideWorld, cardW, cardD, width, height);
  if (!nearBox || !farBox || !sideBox) return null;
  const phone = width < 800;
  const sideInset = sideBox.w / 2 + (phone ? 1 : 14);
  const topInset = farBox.h / 2 + (phone ? 4 : 10);
  const botInset = nearBox.h / 2 + (phone ? 16 : 28);
  const availW = play.w - sideInset * 2;
  const availH = play.h - topInset - botInset;
  if (availW < 48 || availH < 48) return null;
  const rx = (availW / 2) * radiusScale;
  const ry = (availH / 2) * radiusScale;
  const cx = play.x + play.w / 2;
  const cy = play.y + topInset + availH / 2;
  const seats = [];
  const leaves = [];
  for (let i = 0; i < count; i += 1) {
    const angle = Math.PI / 2 + (Math.PI * 2 * i) / count;
    const sx = cx + Math.cos(angle) * rx;
    const sy = cy + Math.sin(angle) * ry;
    const world = screenToTable(cam, sx, sy, width, height);
    if (!world || !boxOf(cam, world, cardW, cardD, width, height, true)) return null;
    const probeBox = boxOf(cam, world, cardW, cardD, width, height, true);
    const stepX = probeBox.w + 12;
    const put = (kind, px, py) => {
      const center = screenToTable(cam, px, py, width, height);
      if (!center) return null;
      const box = boxOf(cam, { x: center.x, y: 0.02, z: center.z }, cardW, cardD, width, height, true);
      if (!box) return null;
      return {
        id: `seat-${i}-${kind}`,
        kind,
        seat: i,
        ...box,
        world: { x: center.x, y: 0.02, z: center.z, w: cardW, d: cardD },
      };
    };
    const compact = true;
    const role = compact ? null : put("role", sx - stepX / 2, sy);
    const character = put("character", compact ? sx : sx + stepX / 2, sy);
    if (!character || (!compact && !role)) return null;
    const chipW = Math.min(150, Math.max(character.w + 8, 88));
    const label = {
      id: `seat-${i}-label`,
      kind: "label",
      seat: i,
      x: character.x + character.w / 2 - chipW / 2,
      y: character.y + character.h + 4,
      w: chipW,
      h: 22,
    };
    let boxes = compact ? [character] : [role, character];
    const gearCount = Math.max(0, stacks[i] || 0);
    if (gearCount >= 1) {
      const gearW = cardW * (1 + 0.3 * (gearCount - 1));
      const span = Math.hypot(world.x, world.z) || 1;
      const shift = cardD * 0.18;
      const gearCenter = {
        x: world.x + (world.x / span) * shift,
        y: 0.02,
        z: world.z + (world.z / span) * shift,
      };
      const gearBox = orientedBox(cam, gearCenter, gearW, cardD, width, height);
      if (!gearBox) return null;
      boxes.push({
        id: `seat-${i}-gear`,
        kind: "gear",
        seat: i,
        ...gearBox,
        world: { ...gearCenter, w: gearW, d: cardD, cards: gearCount },
      });
    }
    if (!compact && i !== 0) {
      let handY = label.y + label.h + probeBox.h * 0.72;
      let spread = stepX;
      let hand = null;
      let gear = null;
      for (let nudge = 0; nudge < 8; nudge += 1) {
        hand = put("hand", sx - spread / 2, handY);
        gear = put("weapon", sx + spread / 2, handY);
        if (!hand || !gear) break;
        const top = Math.min(hand.y, gear.y);
        const gap = gear.x - (hand.x + hand.w);
        if (top >= label.y + label.h + 6 && gap >= 8) break;
        if (top < label.y + label.h + 6) handY += label.y + label.h + 6 - top + 8;
        if (gap < 8) spread += 8 - gap + 10;
      }
      if (!hand || !gear) {
        boxes = [role, character];
      } else {
      const halfW = Math.max(8, (gear.w - 6) / 2);
      const halfH = Math.max(8, (gear.h - 6) / 2);
      const weapon = { ...gear, id: `seat-${i}-weapon`, kind: "weapon", w: halfW, h: gear.h };
      const jail = { ...gear, id: `seat-${i}-jail`, kind: "jail", x: gear.x + halfW + 6, w: halfW, h: halfH };
      const dynamite = { ...jail, id: `seat-${i}-dynamite`, kind: "dynamite", y: gear.y + halfH + 6 };
      boxes = [role, character, hand, weapon, jail, dynamite];
      }
    }
    const shown = boxes;
    const union = shown.reduce((acc, box) => ({
      x: Math.min(acc.x, box.x),
      y: Math.min(acc.y, box.y),
      r: Math.max(acc.r, box.x + box.w),
      b: Math.max(acc.b, box.y + box.h),
    }), { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity });
    leaves.push(...shown, label);
    seats.push({
      id: `seat-${i}`,
      kind: "seat",
      index: i,
      x: union.x,
      y: union.y,
      w: union.r - union.x,
      h: label.y + label.h - union.y,
      cx: sx,
      cy: sy,
    });
  }
  const deckWorld = screenToTable(cam, cx, cy, width, height);
  if (!deckWorld) return null;
  let deck = null;
  let discard = null;
  for (const portion of [0.85, 0.7, 0.55, 0.4, 0.28, 0.18, 0.12]) {
    const deckW = cardW * portion;
    const deckD = deckW * 1.45;
    const sample = boxOf(cam, { x: deckWorld.x, y: 0.02, z: deckWorld.z }, deckW, deckD, width, height);
    if (!sample) continue;
    const phoneDeck = width < 800;
    const deckPoint = phoneDeck
      ? screenToTable(cam, cx, cy, width, height)
      : screenToTable(cam, cx - sample.w / 2 - 6, cy, width, height);
    const discardPoint = phoneDeck
      ? screenToTable(cam, cx, cy + sample.h + 8, width, height)
      : screenToTable(cam, cx + sample.w / 2 + 6, cy, width, height);
    if (!deckPoint || !discardPoint) continue;
    const deckCenter = { x: deckPoint.x, y: 0.02, z: deckPoint.z };
    const discardCenter = { x: discardPoint.x, y: 0.02, z: discardPoint.z };
    const deckBox = boxOf(cam, deckCenter, deckW, deckD, width, height);
    const discardBox = boxOf(cam, discardCenter, deckW, deckD, width, height);
    if (!deckBox || !discardBox) continue;
    const trialDeck = { id: "deck", kind: "deck", ...deckBox, world: { ...deckCenter, w: deckW, d: deckD } };
    const trialDiscard = { id: "discard", kind: "discard", ...discardBox, world: { ...discardCenter, w: deckW, d: deckD } };
    const gap = portion <= 0.18 ? 0 : 4;
    const crowded = leaves.some((zone) => (phoneDeck ? zone.kind !== "label" : true) && (rectsOverlap(zone, trialDeck, gap) || rectsOverlap(zone, trialDiscard, gap)))
      || rectsOverlap(trialDeck, trialDiscard, gap);
    if (!crowded && (!phoneDeck || deckBox.w >= 44)) {
      deck = trialDeck;
      discard = trialDiscard;
      break;
    }
  }
  if (!deck) {
    if (globalThis.__WHY) {
      console.log("nodeck", leaves.filter((zone) => zone.kind === "character").map((zone) => `${zone.seat}:${Math.round(zone.x)},${Math.round(zone.y)},${Math.round(zone.w)}x${Math.round(zone.h)}`).join(" | "));
    }
    return null;
  }
  leaves.push(deck, discard);
  const limit = {
    left: width >= 800 ? 12 : 2,
    top: width >= 800 ? 46 : 42,
    right: width - (width >= 800 ? 12 : 2),
    bottom: height - handReserve(width) + 4,
  };
  const inside = leaves.every((zone) => {
    if (zone.kind === "label") return zone.y >= limit.top - 8 && zone.y + zone.h <= limit.bottom + 8 && zone.x >= -8 && zone.x + zone.w <= width + 8;
    return zone.x >= limit.left && zone.y >= limit.top
      && zone.x + zone.w <= limit.right
      && zone.y + zone.h <= limit.bottom;
  });
  if (!inside) {
    const bad = leaves.find((zone) => {
      if (zone.kind === "label") return !(zone.y >= limit.top - 8 && zone.y + zone.h <= limit.bottom + 8);
      return !(zone.x >= limit.left && zone.y >= limit.top && zone.x + zone.w <= limit.right && zone.y + zone.h <= limit.bottom);
    });
    if (globalThis.__WHY) console.log("inside", bad && bad.id, bad && [Math.round(bad.x), Math.round(bad.y), Math.round(bad.w), Math.round(bad.h)].join(","));
    return null;
  }
  return { seats, leaves, deck, discard, scale: cardW, play, deckCenter: { x: cx, y: cy } };
}

function worldSeparated(a, b) {
  if (!a.world || !b.world) return true;
  const axesOf = (world) => {
    const span = Math.hypot(world.x, world.z) || 1;
    const ux = -world.x / span;
    const uz = -world.z / span;
    return { rx: uz, rz: -ux, ux, uz, w: world.w, d: world.d, x: world.x, z: world.z };
  };
  const A = axesOf(a.world);
  const B = axesOf(b.world);
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  for (const [x, z] of [[A.rx, A.rz], [A.ux, A.uz], [B.rx, B.rz], [B.ux, B.uz]]) {
    const dist = Math.abs(dx * x + dz * z);
    const ra = Math.abs(A.rx * x + A.rz * z) * A.w / 2 + Math.abs(A.ux * x + A.uz * z) * A.d / 2;
    const rb = Math.abs(B.rx * x + B.rz * z) * B.w / 2 + Math.abs(B.ux * x + B.uz * z) * B.d / 2;
    if (dist > ra + rb + 0.004) return true;
  }
  return false;
}

function phoneFits(leaves) {
  const cards = leaves.filter((zone) => zone.world && zone.kind !== "label" && zone.kind !== "deck" && zone.kind !== "discard");
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      if (cards[i].seat != null && cards[i].seat === cards[j].seat) continue;
      if (!worldSeparated(cards[i], cards[j])) return false;
    }
  }
  return true;
}

function zonesClear(leaves, phone) {
  if (phone) return phoneFits(leaves);
  for (let i = 0; i < leaves.length; i += 1) {
    for (let j = i + 1; j < leaves.length; j += 1) {
      const a = leaves[i];
      const b = leaves[j];
      if (a.seat != null && a.seat === b.seat) continue;
      if (rectsOverlap(a, b, 2)) return false;
    }
  }
  return true;
}

function cardCeiling(count, width) {
  if (count > 4) return 3.6;
  return width < 800 ? 0.4 : 0.9;
}

export function solveProjectedLayout(width, height, playerCount, stacks = []) {
  const count = Math.max(1, Math.min(7, playerCount));
  const play = playField(width, height);
  const phone = width < 800;
  let best = null;
  for (let radius = 100; radius >= 86; radius -= 2) {
    const radiusScale = radius / 100;
    let lo = 0.18;
    let hi = cardCeiling(count, width);
    let fit = null;
    for (let step = 0; step < 14; step += 1) {
      const mid = (lo + hi) / 2;
      const laid = placeLayout(width, height, count, mid, radiusScale, stacks);
      const clear = laid && zonesClear(laid.leaves, phone);
      if (clear) {
        fit = laid;
        lo = mid;
      } else hi = mid;
    }
    if (fit) {
      best = fit;
      break;
    }
  }
  if (!best) best = placeLayout(width, height, count, 0.18, 0.86, stacks) || { seats: [], leaves: [], deck: null, discard: null, scale: 0.18, play, deckCenter: null };
  return { ...best, play, width, height };
}

export function layoutOverlaps(zones, pad = 0) {
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      if (rectsOverlap(zones[i], zones[j], pad)) return true;
    }
  }
  return false;
}

function projectCard(cam, center, cardW, cardD, width, height) {
  const corners = [
    { x: center.x - cardW / 2, y: 0.02, z: center.z - cardD / 2 },
    { x: center.x + cardW / 2, y: 0.02, z: center.z - cardD / 2 },
    { x: center.x - cardW / 2, y: 0.02, z: center.z + cardD / 2 },
    { x: center.x + cardW / 2, y: 0.02, z: center.z + cardD / 2 },
  ].map((point) => projectPoint(cam, point, width, height));
  if (corners.some((point) => !point)) return null;
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function inside(box, zone, slack = 0) {
  return box.x >= zone.x - slack && box.y >= zone.y - slack
    && box.x + box.w <= zone.x + zone.w + slack
    && box.y + box.h <= zone.y + zone.h + slack;
}

/** World size of a flat card whose projected box stays inside `zone`. */
export function fitCard(cam, zone, width, height) {
  const center = screenToTable(cam, zone.x + zone.w / 2, zone.y + zone.h / 2, width, height);
  if (!center) return null;
  let lo = 0.004;
  let hi = 6;
  let best = null;
  for (let step = 0; step < 18; step += 1) {
    const mid = (lo + hi) / 2;
    const box = projectCard(cam, center, mid, mid * 1.45, width, height);
    if (box && inside(box, zone)) {
      best = { center, w: mid, d: mid * 1.45, screen: box };
      lo = mid;
    } else hi = mid;
  }
  return best;
}

export function projectedCards(width, height, playerCount) {
  const layout = solveProjectedLayout(width, height, playerCount);
  const cam = cameraRig(width, height);
  const cards = layout.leaves
    .filter((zone) => zone.kind !== "label")
    .map((zone) => ({ zone, fit: fitCard(cam, zone, width, height) }));
  return { layout, cam, cards };
}

export function solveTableLayout(playerCount) {
  const layout = solveProjectedLayout(1280, 800, playerCount);
  return {
    scale: layout.scale,
    zones: [
      ...layout.seats,
      ...(layout.deck ? [layout.deck] : []),
      ...(layout.discard ? [layout.discard] : []),
    ],
  };
}
