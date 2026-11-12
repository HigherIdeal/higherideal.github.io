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
  const fov = 42 * Math.PI / 180;
  const tilt = 50 * Math.PI / 180;
  const dist = aspect > 1.35 ? 9.2 : 10.4;
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

function playField(width, height) {
  const wide = width >= 800;
  const top = 72;
  const bottom = wide ? 210 : Math.round(height * 0.4);
  const right = wide ? 280 : 12;
  const left = 12;
  return {
    x: left,
    y: top,
    w: Math.max(80, width - left - right),
    h: Math.max(80, height - top - bottom),
  };
}

function rectsOverlap(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

function leavesOf(seat) {
  const pad = 8;
  const labelH = 22;
  const gap = GAP;
  const innerX = seat.x + pad;
  const innerY = seat.y + pad;
  const innerW = seat.w - pad * 2;
  const innerH = seat.h - pad * 2 - labelH - gap;
  const cols = 4;
  const colW = (innerW - gap * (cols - 1)) / cols;
  const kinds = ["role", "character", "hand", "gear"];
  const colsRect = kinds.map((kind, index) => ({
    id: `${seat.id}-${kind}`,
    kind,
    seat: seat.index,
    x: innerX + index * (colW + gap),
    y: innerY,
    w: colW,
    h: innerH,
  }));
  const gear = colsRect[3];
  const weaponH = (gear.h - gap) / 2;
  const weapon = { ...gear, id: `${seat.id}-weapon`, kind: "weapon", h: weaponH };
  const table = { ...gear, id: `${seat.id}-table`, kind: "table", y: gear.y + weaponH + gap, h: weaponH };
  const half = (table.w - gap) / 2;
  const jail = { ...table, id: `${seat.id}-jail`, kind: "jail", w: half };
  const dynamite = { ...table, id: `${seat.id}-dynamite`, kind: "dynamite", x: table.x + half + gap, w: half };
  const label = {
    id: `${seat.id}-label`,
    kind: "label",
    seat: seat.index,
    x: innerX,
    y: seat.y + seat.h - pad - labelH,
    w: innerW,
    h: labelH,
  };
  return [colsRect[0], colsRect[1], colsRect[2], weapon, jail, dynamite, label];
}

function place(play, count, scale) {
  const col = Math.min(play.w, play.h) * 0.28 * scale;
  const deckW = col * 0.95;
  const deckH = col * 1.15;
  const cx = play.x + play.w / 2;
  const cy = play.y + play.h / 2;
  const deck = { id: "deck", kind: "deck", x: cx - deckW - GAP, y: cy - deckH / 2, w: deckW, h: deckH };
  const discard = { id: "discard", kind: "discard", x: cx + GAP, y: cy - deckH / 2, w: deckW, h: deckH };
  const gap = GAP;
  const pad = 8;
  const seatW = pad * 2 + col * 4 + gap * 3;
  const seatH = pad * 2 + Math.max(col * 1.05, 36) + 22 + gap;
  const rx = (play.w - seatW) / 2 - 4;
  const ry = (play.h - seatH) / 2 - 4;
  if (rx < 8 || ry < 8 || seatW > play.w || seatH > play.h) return null;
  const seats = [];
  const leaves = [deck, discard];
  for (let i = 0; i < count; i += 1) {
    const angle = Math.PI / 2 + (Math.PI * 2 * i) / count;
    const sx = cx + Math.cos(angle) * rx - seatW / 2;
    const sy = cy + Math.sin(angle) * ry - seatH / 2;
    if (sx < play.x || sy < play.y || sx + seatW > play.x + play.w || sy + seatH > play.y + play.h) return null;
    const seat = { id: `seat-${i}`, kind: "seat", index: i, x: sx, y: sy, w: seatW, h: seatH, scale };
    seats.push(seat);
    leaves.push(...leavesOf(seat));
  }
  return { seats, leaves, deck, discard, scale };
}

export function solveProjectedLayout(width, height, playerCount) {
  const count = Math.max(1, Math.min(7, playerCount));
  const play = playField(width, height);
  let scale = 1;
  let laid = place(play, count, scale);
  for (let step = 0; step < 36 && (!laid || layoutOverlaps(laid.leaves, 2)); step += 1) {
    scale *= 0.9;
    laid = place(play, count, scale);
  }
  if (!laid) laid = place(play, count, 0.2) || { seats: [], leaves: [], deck: null, discard: null, scale: 0.2 };
  return { ...laid, play, width, height };
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
  let lo = 0.02;
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
