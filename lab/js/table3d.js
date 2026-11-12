import * as THREE from "../vendor/three.module.js?v=31";
import { CARD_INFO, ROLES, characterById } from "./cards.js?v=31";
import { cameraRig, cardYaw, solveProjectedLayout } from "./layout.js?v=31";
import { stampCanvas } from "./stamp.js?v=31";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function makeBackTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 396;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#efe4cc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(92,64,48,0.35)";
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
  ctx.fillStyle = "#6b3a32";
  ctx.font = "700 42px serif";
  ctx.textAlign = "center";
  ctx.fillText("BANG!", canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData = { url: canvas.toDataURL() };
  return texture;
}

function loadTexture(url, cache) {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData = { url };
  cache.set(url, texture);
  return texture;
}

function loadPlayCard(card, cache) {
  const url = CARD_INFO[card?.type]?.image;
  if (!url) return null;
  const key = `play:${url}:${card.suit}:${card.rank}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 622;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, 400, 622);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData = { url, suit: card.suit, rank: card.rank };
  const img = new Image();
  img.onload = () => {
    const stamped = stampCanvas(img, card.suit, card.rank);
    ctx.clearRect(0, 0, 400, 622);
    ctx.drawImage(stamped, 0, 0, 400, 622);
    texture.needsUpdate = true;
    texture.userData.url = stamped.toDataURL("image/jpeg", 0.86);
  };
  img.src = url;
  cache.set(key, texture);
  return texture;
}

function cardMaterial(texture, fallback) {
  return new THREE.MeshStandardMaterial({
    map: texture || fallback,
    roughness: 0.72,
    metalness: 0.02,
  });
}

function starShape() {
  const shape = new THREE.Shape();
  const spikes = 5;
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? 0.2 : 0.08;
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function arcPoint(a, b, t) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y = Math.max(a.y, b.y) + 0.9;
  return a.clone().lerp(mid, t).lerp(mid.clone().lerp(b, t), t);
}

export function mountTable(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "default",
    });
    if (!renderer.getContext()) throw new Error("no webgl context");
  } catch (error) {
    return { error: error?.message || "webgl unavailable" };
  }
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.012);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
  const hemi = new THREE.AmbientLight(0xfff4e4, 0.34);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d8, 1.15);
  key.position.set(1.2, 7.5, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 3;
  key.shadow.bias = -0.0008;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 28;
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  scene.add(key);
  const felt = new THREE.MeshStandardMaterial({ color: 0x16120f, roughness: 1, metalness: 0 });
  felt.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vFadePos;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\n vFadePos = worldPosition.xyz;",
    );
    shader.fragmentShader = `varying vec3 vFadePos;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `#include <opaque_fragment>
       gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0), smoothstep(4.2, 11.5, length(vFadePos.xz)));`,
    );
  };
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), felt);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  scene.add(plane);
  const spot = new THREE.SpotLight(0xffe2b8, 1.4, 18, 0.85, 0.7, 1);
  spot.position.set(0, 7, 0.2);
  spot.target.position.set(0, 0, 0);
  scene.add(spot);
  scene.add(spot.target);
  const back = makeBackTexture();
  const textures = new Map();
  const groups = new Map();
  const lights = new Map();
  const markers = new Map();
  const starGeo = new THREE.ExtrudeGeometry(starShape(), {
    depth: 0.045, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1,
  });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, metalness: 1, roughness: 0.08 });
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xfff6e4, side: THREE.BackSide, toneMapped: false });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf0c14a, metalness: 0.78, roughness: 0.22, emissive: 0x8a6414, emissiveIntensity: 0.4 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xff2e00, toneMapped: false, fog: false, transparent: true, opacity: 1 });
  const dashes = Array.from({ length: 22 }, () => {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dashMat.clone());
    dash.visible = false;
    dash.frustumCulled = false;
    scene.add(dash);
    return dash;
  });
  const dashAxis = new THREE.Vector3(0, 0, 1);
  const turnLight = new THREE.SpotLight(0xfff7e8, 0, 7.5, 0.38, 0.5, 1);
  scene.add(turnLight);
  scene.add(turnLight.target);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let view = null;
  let aimIds = new Set();
  let aiming = false;
  let running = true;
  let width = 1;
  let height = 1;
  let yaw = 0;
  let pitch = 0;
  let distMul = 1;
  let panX = 0;
  let panZ = 0;
  let focusId = "";
  const fingers = new Map();
  let lastTap = 0;

  function applyRig() {
    const rig = cameraRig(width, height);
    const elev = Math.atan2(rig.position.y, Math.hypot(rig.position.x, rig.position.z)) + pitch;
    const base = Math.hypot(rig.position.x, rig.position.y, rig.position.z) * distMul;
    const targetX = panX;
    const targetZ = panZ;
    camera.fov = rig.fov * 180 / Math.PI;
    camera.aspect = width / Math.max(1, height);
    camera.position.set(
      targetX + Math.sin(yaw) * Math.cos(elev) * base,
      Math.sin(elev) * base,
      targetZ + Math.cos(yaw) * Math.cos(elev) * base,
    );
    camera.lookAt(targetX, 0.05, targetZ);
    camera.updateProjectionMatrix();
  }

  function viewPixels() {
    const visual = window.visualViewport;
    const cssW = document.documentElement?.clientWidth || window.innerWidth;
    const cssH = document.documentElement?.clientHeight || window.innerHeight;
    return {
      width: Math.max(1, Math.round(Math.min(window.innerWidth || cssW, cssW, visual?.width || cssW))),
      height: Math.max(1, Math.round(Math.min(window.innerHeight || cssH, cssH, visual?.height || cssH))),
    };
  }

  function resize() {
    const next = viewPixels();
    width = next.width;
    height = next.height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    applyRig();
  }

  function resetView() {
    yaw = 0;
    pitch = 0;
    distMul = 1;
    panX = 0;
    panZ = 0;
    focusId = "";
    applyRig();
  }

  function settleView() {
    let best = "";
    let bestD = 180;
    const midX = width / 2;
    const midY = height / 2;
    for (const mesh of groups.values()) {
      if (!mesh.userData?.playerId) continue;
      const p = mesh.position.clone();
      p.project(camera);
      const x = (p.x * 0.5 + 0.5) * width;
      const y = (-p.y * 0.5 + 0.5) * height;
      const d = Math.hypot(x - midX, y - midY);
      if (d < bestD) {
        bestD = d;
        best = mesh.userData.playerId;
      }
    }
    focusId = bestD < 160 ? best : "";
  }

  function cardMesh(texture, w, h, mode) {
    const material = cardMaterial(texture, back);
    if (mode === "reach") {
      material.color.set(0xfff6e4);
      material.emissive.set(0xe0a040);
      material.emissiveIntensity = 0.7;
    } else if (mode === "dim") {
      material.color.set(0x6a635c);
      material.emissive.set(0x000000);
      material.emissiveIntensity = 0;
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function rebuild(next) {
    view = next;
    for (const group of groups.values()) scene.remove(group);
    groups.clear();
    for (const light of lights.values()) {
      scene.remove(light);
      if (light.target) scene.remove(light.target);
    }
    lights.clear();
    if (!next) return;
    const living = next.players.filter((p) => p.alive !== false);
    const start = Math.max(0, living.findIndex((p) => p.id === next.yourId));
    const ordered = living.map((_, index) => living[(start + index) % living.length]);
    const stacks = ordered.map((player) => [player.equipment?.weapon, player.equipment?.barrel, player.equipment?.mustang, player.equipment?.scope, player.equipment?.jail, player.equipment?.dynamite].filter(Boolean).length);
    const layout = solveProjectedLayout(width, height, ordered.length, stacks);
    const mine = next.yourId;
    const onTurn = next.currentId === mine && next.turnPhase === "play" && !next.prompt;
    const put = (zone, texture, playerId, mode) => {
      if (!zone?.world || !texture) return;
      const mesh = cardMesh(texture, zone.world.w, zone.world.d, mode);
      mesh.position.set(zone.world.x, mode === "reach" ? 0.08 : 0.03, zone.world.z);
      mesh.rotation.order = "YXZ";
      mesh.rotation.y = playerId ? cardYaw(zone.world.x, zone.world.z) : Math.atan2(-zone.world.x, -zone.world.z);
      mesh.rotation.x = -Math.PI / 2;
      mesh.userData.kind = zone.kind;
      mesh.userData.baseY = mesh.position.y;
      mesh.userData.image = texture?.userData?.url || texture?.image?.src || "";
      mesh.userData.suit = texture?.userData?.suit || "";
      mesh.userData.rank = texture?.userData?.rank || "";
      if (playerId) {
        mesh.userData.playerId = playerId;
        mesh.userData.peek = playerId !== mine;
      }
      scene.add(mesh);
      groups.set(zone.id, mesh);
      if (mode === "reach" && zone.kind === "character") {
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(zone.world.w * 1.14, zone.world.d * 1.14),
          new THREE.MeshBasicMaterial({ color: 0xf0c14a, toneMapped: false }),
        );
        glow.position.set(mesh.position.x, mesh.position.y - 0.02, mesh.position.z);
        glow.rotation.copy(mesh.rotation);
        glow.userData.kind = "glow";
        scene.add(glow);
        groups.set(`${zone.id}:glow`, glow);
      }
    };
    ordered.forEach((player, index) => {
      const zone = (kind) => layout.leaves.find((item) => item.seat === index && item.kind === kind);
      const reach = aiming ? aimIds.has(player.id) : (onTurn && player.id !== mine && player.connected !== false && player.distance != null && player.distance <= weaponRange(next));
      const mode = player.id === mine ? "self" : (aiming ? (reach ? "reach" : "dim") : (reach ? "reach" : "self"));
      const character = characterById(player.character);
      const role = player.role && ROLES[player.role];
      put(zone("character"), loadTexture(character?.image, textures) || back, player.id, mode);
      const anchor = zone("character");
      placeFieldStack(player, anchor, mode, role);
      placeHandStack(player, anchor, player.id === mine);
      if (anchor?.world && reach) {
        const pool = new THREE.PointLight(0xffc48a, 0.28, 1.25, 2);
        pool.position.set(anchor.world.x, 0.22, anchor.world.z);
        scene.add(pool);
        lights.set(player.id, pool);
      }
    });
    for (const marker of markers.values()) scene.remove(marker);
    markers.clear();
    ordered.forEach((player, index) => {
      const spot = layout.leaves.find((item) => item.seat === index && item.kind === "character");
      if (!spot?.world) return;
      const sheriff = player.role === "sheriff";
      const phone = width < 800;
      const markerRadius = phone ? 0.105 : 0.07;
      const marker = new THREE.Mesh(sheriff ? starGeo : new THREE.SphereGeometry(markerRadius, 32, 20), sheriff ? goldMat : blackMat);
      if (sheriff) {
        marker.rotation.x = -Math.PI / 2;
        marker.scale.setScalar(phone ? 0.51 : 0.34);
      } else {
        const rim = new THREE.Mesh(new THREE.SphereGeometry(markerRadius, 32, 20), rimMat);
        rim.scale.setScalar(1.16);
        marker.add(rim);
      }
      marker.position.set(spot.world.x, 0.46, spot.world.z);
      marker.userData.bob = index * 0.7;
      marker.userData.baseY = 0.46;
      marker.userData.playerId = player.id;
      scene.add(marker);
      markers.set(player.id, marker);
    });
    if (next.deckCount) put(layout.deck, back, "", "self");
    if (next.discardTop) put(layout.discard, loadPlayCard(next.discardTop, textures), "", "self");
    groups.__layout = layout;
    groups.__order = ordered.map((player) => player.id);
  }

  function pileAxes(anchor) {
    const span = Math.hypot(anchor.world.x, anchor.world.z) || 1;
    return {
      inX: -anchor.world.x / span,
      inZ: -anchor.world.z / span,
      rightX: anchor.world.z / span,
      rightZ: -anchor.world.x / span,
    };
  }

  function placePileCard(anchor, texture, index, total, opts) {
    const axes = pileAxes(anchor);
    const cardW = anchor.world.w * (opts.scale || 0.86);
    const cardD = anchor.world.d * (opts.scale || 0.86);
    const mesh = cardMesh(texture, cardW, cardD, opts.mode || "self");
    const step = cardW * 0.16;
    const along = (index - (total - 1) / 2) * step;
    mesh.position.set(
      anchor.world.x + axes.inX * (opts.inward || 0) + axes.rightX * along,
      (opts.y || 0.05) + index * 0.012,
      anchor.world.z + axes.inZ * (opts.inward || 0) + axes.rightZ * along,
    );
    mesh.rotation.order = "YXZ";
    mesh.rotation.y = cardYaw(anchor.world.x, anchor.world.z);
    mesh.rotation.x = -Math.PI / 2;
    Object.assign(mesh.userData, opts.data || {});
    mesh.userData.image = texture?.userData?.url || texture?.image?.src || mesh.userData.image || "";
    mesh.userData.baseY = mesh.position.y;
    scene.add(mesh);
    groups.set(opts.id, mesh);
  }

  function placeFieldStack(player, anchor, mode, role) {
    if (!anchor?.world) return;
    const gear = [player.equipment?.weapon, player.equipment?.barrel, player.equipment?.mustang, player.equipment?.scope, player.equipment?.jail, player.equipment?.dynamite].filter(Boolean);
    const roleTexture = role ? loadTexture(role.image, textures) : back;
    const cards = [{ texture: roleTexture, kind: "role" }, ...gear.map((card) => ({ texture: loadPlayCard(card, textures), kind: "gear", card }))].filter((item) => item.texture);
    cards.forEach((item, index) => {
      placePileCard(anchor, item.texture, index, cards.length, {
        scale: 0.9,
        y: 0.045,
        mode,
        id: `field-${player.id}-${index}`,
        data: {
          kind: item.kind,
          gear: item.kind === "gear",
          playerId: player.id,
          suit: item.card?.suit || "",
          rank: item.card?.rank || "",
          cardType: item.card?.type || "",
        },
      });
    });
  }

  function placeHandStack(player, anchor, mine) {
    if (!anchor?.world) return;
    const owned = mine ? (player.hand || []) : [];
    const count = mine ? owned.length : (player.handCount || 0);
    const shown = Math.min(count, 8);
    if (!shown) return;
    for (let i = 0; i < shown; i += 1) {
      const card = owned[i];
      const texture = card ? (loadPlayCard(card, textures) || back) : back;
      placePileCard(anchor, texture, i, shown, {
        scale: 0.78,
        inward: anchor.world.d * 0.28,
        y: 0.16,
        id: `hand-${player.id}-${i}`,
        data: {
          kind: "hand",
          playerId: player.id,
          secret: !mine,
          handCount: count,
          handId: card?.id || "",
          suit: mine ? (card?.suit || "") : "",
          rank: mine ? (card?.rank || "") : "",
        },
      });
    }
  }

  function placeGear(player, zone, mode, character) {
    const cards = [player.equipment?.weapon, player.equipment?.barrel, player.equipment?.mustang, player.equipment?.scope, player.equipment?.jail, player.equipment?.dynamite].filter(Boolean);
    if (!cards.length || !zone?.world) return;
    const n = cards.length;
    const beside = character?.world;
    const cardW = beside ? beside.w * 0.6 : zone.world.w / (1 + 0.3 * (n - 1));
    const cardD = beside ? beside.d * 0.6 : zone.world.d;
    const span = Math.hypot((beside || zone.world).x, (beside || zone.world).z) || 1;
    const rightX = -(beside || zone.world).z / span;
    const rightZ = (beside || zone.world).x / span;
    const gap = beside ? beside.w * 1.45 : 0;
    cards.forEach((card, index) => {
      const texture = loadPlayCard(card, textures);
      if (!texture) return;
      const mesh = cardMesh(texture, cardW, cardD, mode);
      const along = (index - (n - 1) / 2) * cardW * 0.3;
      const origin = beside || zone.world;
      mesh.position.set(
        origin.x + rightX * (gap + along),
        0.05 + (n - index) * 0.016,
        origin.z + rightZ * (gap + along),
      );
      mesh.rotation.order = "YXZ";
      mesh.rotation.y = cardYaw(zone.world.x, zone.world.z);
      mesh.rotation.x = -Math.PI / 2;
      mesh.userData.kind = "gear";
      mesh.userData.cardType = card.type || "";
      mesh.userData.gear = true;
      mesh.userData.image = texture?.userData?.url || "";
      mesh.userData.suit = card.suit || "";
      mesh.userData.rank = card.rank || "";
      mesh.userData.playerId = player.id;
      mesh.userData.peek = false;
      mesh.userData.baseY = mesh.position.y;
      scene.add(mesh);
      groups.set(`gear-${player.id}-${card.id}`, mesh);
    });
  }

  function weaponRange(next) {
    const me = next.players.find((p) => p.id === next.yourId);
    return CARD_INFO[me?.equipment?.weapon?.type]?.range || 1;
  }

  function projectSeats() {
    const parent = canvas.getBoundingClientRect();
    const placed = [];
    for (const [id, group] of groups) {
      if (!group.userData.playerId) continue;
      const point = group.position.clone();
      point.y += 0.2;
      point.project(camera);
      const x = (point.x * 0.5 + 0.5) * parent.width;
      const y = (-point.y * 0.5 + 0.5) * parent.height;
      placed.push({ id, x, y });
    }
    return placed;
  }

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    for (const group of groups.values()) {
      if (!group.userData.playerId) continue;
      const lift = aimIds.has(group.userData.playerId) ? 0.16 : (group.userData.baseY || 0.03);
      group.position.y += (lift - group.position.y) * (reduced() ? 1 : 0.18);
      const want = group.userData.playerId && group.userData.playerId === focusId ? 1.14 : 1;
      const have = group.scale.x || 1;
      const nextScale = have + (want - have) * (reduced() ? 1 : 0.16);
      group.scale.setScalar(nextScale);
    }
    const time = performance.now() / 1000;
    for (const marker of markers.values()) {
      marker.position.y = marker.userData.baseY + Math.sin(time * 2.1 + marker.userData.bob) * 0.055;
    }
    const arc = view?.arc || globalThis.__bangLocalArc;
    const from = arc && markers.get(arc.fromId);
    const goal = arc && markers.get(arc.toId);
    const age = arc ? (Date.now() - arc.at) / 1000 : 99;
    const live = Boolean(from && goal && (arc.phase === "preview" || age < 1.45));
    dashes.forEach((dash, index) => {
      if (!live) {
        dash.visible = false;
        return;
      }
      const phone = window.innerWidth < 800;
      if (phone && index % 2 !== 0) {
        dash.visible = false;
        return;
      }
      const t = ((index / dashes.length) + time * 0.55) % 1;
      const next = ((index + 0.35) / dashes.length + time * 0.55) % 1;
      const at = arcPoint(from.position, goal.position, t);
      const ahead = arcPoint(from.position, goal.position, next > t ? next : Math.min(0.999, t + 0.02));
      dash.position.copy(at);
      const tangent = ahead.clone().sub(at);
      if (tangent.lengthSq() > 1e-6) dash.quaternion.setFromUnitVectors(dashAxis, tangent.normalize());
      const px = worldPerPixel(at);
      dash.material.depthTest = !phone;
      dash.renderOrder = phone ? 8 : 0;
      dash.scale.set(3.2 * px, 3.2 * px, (phone ? 9 : 13) * px);
      dash.visible = true;
      dash.material.opacity = arc.phase === "preview" ? 0.72 : Math.max(0, 1 - Math.max(0, age - 0.35) / 1);
    });
    publishSpots();
    const current = markers.get(view?.currentId);
    if (current && view?.phase === "play") {
      turnLight.intensity = 14;
      turnLight.position.set(current.position.x, 3.6, current.position.z);
      turnLight.target.position.set(current.position.x, 0.2, current.position.z);
    } else {
      turnLight.intensity = 0;
    }
    renderer.render(scene, camera);
  }

  function worldPerPixel(at) {
    const dist = Math.max(0.2, camera.position.distanceTo(at));
    return (2 * Math.tan((camera.fov * Math.PI / 180) / 2) * dist) / Math.max(1, height);
  }

  function projectLocal(mesh, x, y) {
    const point = new THREE.Vector3(x, y, 0).applyMatrix4(mesh.matrixWorld).project(camera);
    return {
      x: (point.x * 0.5 + 0.5) * width,
      y: (-point.y * 0.5 + 0.5) * height,
    };
  }

  function cardScreenBox(mesh) {
    const w = mesh.geometry.parameters.width;
    const h = mesh.geometry.parameters.height;
    mesh.updateMatrixWorld();
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].map(([x, y]) => projectLocal(mesh, x, y));
    const center = projectLocal(mesh, 0, 0);
    return {
      left: Math.min(...corners.map((point) => point.x)),
      top: Math.min(...corners.map((point) => point.y)),
      right: Math.max(...corners.map((point) => point.x)),
      bottom: Math.max(...corners.map((point) => point.y)),
      anchorX: center.x,
      anchorY: Math.max(...corners.map((point) => point.y)),
    };
  }

  function publishSpots() {
    const spots = [];
    const boxes = [];
    for (const mesh of groups.values()) {
      if (mesh.userData.kind !== "character" || !mesh.userData.playerId) continue;
      const box = cardScreenBox(mesh);
      const chipW = 108;
      spots.push({
        id: mesh.userData.playerId,
        x: box.anchorX,
        y: box.anchorY,
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        w: chipW,
        h: 36,
      });
      boxes.push({ id: mesh.userData.playerId, ...box });
    }
    const hits = [];
    for (const mesh of groups.values()) {
      const kind = mesh.userData.kind;
      if (!kind || kind === "role" || kind === "glow") continue;
      const box = cardScreenBox(mesh);
      hits.push({
        kind,
        playerId: mesh.userData.playerId || "",
        secret: Boolean(mesh.userData.secret),
        handCount: mesh.userData.handCount || 0,
        cx: (box.left + box.right) / 2,
        cy: (box.top + box.bottom) / 2,
      });
    }
    globalThis.__bangHits = hits;
    globalThis.__bangBoxes = boxes;
    if (typeof onSpots === "function") onSpots(spots);
    return spots;
  }

  function update(next, aim, aimingNow) {
    aimIds = new Set(aim || []);
    aiming = Boolean(aimingNow);
    resize();
    rebuild(next);
    return publishSpots();
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    let obj = null;
    for (const hit of hits) {
      let cursor = hit.object;
      while (cursor && !cursor.userData?.image) cursor = cursor.parent;
      if (cursor?.userData?.image) {
        obj = cursor;
        break;
      }
    }
    if (!obj) return null;
    return {
      playerId: obj.userData.playerId || "",
      image: obj.userData.image || "",
      peek: Boolean(obj.userData.peek),
      gear: Boolean(obj.userData.gear),
      kind: obj.userData.kind || "",
      suit: obj.userData.suit || "",
      rank: obj.userData.rank || "",
      secret: Boolean(obj.userData.secret),
      handCount: obj.userData.handCount || 0,
      handId: obj.userData.handId || "",
      box: meshScreenBox(obj),
    };
  }

  function meshScreenBox(mesh) {
    const w = mesh.geometry?.parameters?.width;
    const h = mesh.geometry?.parameters?.height;
    if (!w || !h) return null;
    mesh.updateMatrixWorld();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const corner of [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]]) {
      const point = new THREE.Vector3(corner[0], corner[1], 0).applyMatrix4(mesh.matrixWorld).project(camera);
      const x = (point.x * 0.5 + 0.5) * width;
      const y = (-point.y * 0.5 + 0.5) * height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { left: minX, top: minY, width: Math.max(8, maxX - minX), height: Math.max(8, maxY - minY) };
  }

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("wheel", (event) => {
    distMul = Math.min(1.4, Math.max(0.48, distMul * (event.deltaY > 0 ? 1.06 : 0.94)));
    applyRig();
  }, { passive: true });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.target !== canvas) return;
    const startHit = event.button === 0 ? pick(event.clientX, event.clientY) : null;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY, ox: event.clientX, oy: event.clientY, button: event.button, startHit });
    try { canvas.setPointerCapture(event.pointerId); } catch { /* already captured */ }
  });
  canvas.addEventListener("pointermove", (event) => {
    const prev = fingers.get(event.pointerId);
    if (!prev) return;
    const dx = event.clientX - prev.x;
    const dy = event.clientY - prev.y;
    prev.x = event.clientX;
    prev.y = event.clientY;
    if (fingers.size >= 2) {
      yaw += dx * 0.006;
      pitch = Math.max(-0.25, Math.min(0.28, pitch + dy * 0.003));
      panX += dx * 0.004;
      panZ += dy * 0.004;
      applyRig();
      return;
    }
    if ((event.buttons & 2) || event.shiftKey) {
      if (event.shiftKey && (event.buttons & 2)) {
        panX += dx * 0.01;
        panZ += dy * 0.01;
      } else {
        yaw += dx * 0.007;
        pitch = Math.max(-0.25, Math.min(0.28, pitch + dy * 0.004));
      }
      applyRig();
    }
  });
  function endFinger(event) {
    const prev = fingers.get(event.pointerId);
    fingers.delete(event.pointerId);
    if (!prev || fingers.size) return;
    const moved = Math.hypot(event.clientX - prev.ox, event.clientY - prev.oy);
    if (moved >= 8 && prev.button === 0 && prev.startHit?.kind === "deck") {
      onZoom?.(prev.startHit);
      return;
    }
    if (moved < 8 && prev.button === 0) {
      const now = Date.now();
      const info = pick(event.clientX, event.clientY);
      if (now - lastTap < 320 && !info?.image && !info?.kind) {
        lastTap = 0;
        resetView();
        return;
      }
      lastTap = now;
      if (info?.image || info?.kind) onZoom?.(info);
    } else settleView();
  }
  canvas.addEventListener("pointerup", endFinger);
  canvas.addEventListener("pointercancel", (event) => fingers.delete(event.pointerId));
  let onPeek = null;
  let onGear = null;
  let onZoom = null;
  let onSpots = null;

  resize();
  const onResize = () => {
    resize();
    if (view) rebuild(view);
  };
  window.addEventListener("resize", onResize);
  window.visualViewport?.addEventListener("resize", onResize);
  tick();
  return {
    update,
    pick,
    resize,
    resetView,
    setPeek(fn) { onPeek = fn; },
    setGear(fn) { onGear = fn; },
    setZoom(fn) { onZoom = fn; },
    setSpots(fn) { onSpots = fn; },
    stop() {
      running = false;
      renderer.dispose();
    },
  };
}
