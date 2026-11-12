import * as THREE from "../vendor/three.module.js?v=14";
import { CARD_INFO, ROLES, characterById } from "./cards.js?v=14";
import { solveTableLayout } from "./layout.js?v=14";

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
  return texture;
}

function loadTexture(url, cache) {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(url, texture);
  return texture;
}

function cardMaterial(texture, fallback) {
  return new THREE.MeshStandardMaterial({
    map: texture || fallback,
    roughness: 0.72,
    metalness: 0.02,
  });
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.02);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
  const hemi = new THREE.AmbientLight(0xfff4e4, 0.28);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe2b8, 1.15);
  key.position.set(0, 8, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  scene.add(key);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x070605, roughness: 1, metalness: 0 }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  scene.add(plane);
  const spot = new THREE.SpotLight(0xffc98a, 6, 18, 0.7, 0.6, 1);
  spot.position.set(0, 7, 0.2);
  spot.target.position.set(0, 0, 0);
  scene.add(spot);
  scene.add(spot.target);
  const back = makeBackTexture();
  const textures = new Map();
  const groups = new Map();
  const lights = new Map();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let view = null;
  let aimIds = new Set();
  let running = true;
  let width = 1;
  let height = 1;

  function aspectWide() {
    return (canvas.clientWidth || 1) / Math.max(1, canvas.clientHeight || 1) > 1.35;
  }

  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    width = Math.max(1, parent.clientWidth);
    height = Math.max(1, parent.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.aspect = aspect;
    camera.fov = 42;
    const tilt = 50 * Math.PI / 180;
    const radius = aspect > 1.35 ? 5.2 : 4.4;
    const dist = aspect > 1.35 ? 6.15 : 7.6;
    camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    camera.lookAt(0, 0.15, 0);
    camera.updateProjectionMatrix();
    canvas.__bangRadius = radius;
  }

  function cardMesh(texture, w, h) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), cardMaterial(texture, back));
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function rebuild(next) {
    view = next;
    for (const group of groups.values()) scene.remove(group);
    groups.clear();
    for (const light of lights.values()) scene.remove(light);
    lights.clear();
    if (!next) return;
    const living = next.players.filter((p) => p.alive !== false);
    const self = living.find((p) => p.id === next.yourId);
    const others = living.filter((p) => p.id !== next.yourId);
    const ordered = self ? [self, ...others] : living;
    const layout = solveTableLayout(ordered.length);
    ordered.forEach((player, index) => {
      const zone = layout.zones.find((item) => item.id === `seat-${index}`);
      if (!zone) return;
      const group = new THREE.Group();
      const radius = canvas.__bangRadius || 4.4;
      const spread = radius * (0.62 + Math.min(ordered.length, 7) * 0.035);
      const angle = Math.PI * 0.5 + (Math.PI * 2 * index) / ordered.length;
      const x = Math.cos(angle) * spread * (aspectWide() ? 1.35 : 1);
      const z = Math.sin(angle) * spread * 0.48;
      group.position.set(x, 0.02, z);
      group.userData.playerId = player.id;
      const reach = player.id !== next.yourId && player.connected !== false && player.distance != null && player.distance <= weaponRange(next);
      group.userData.baseY = reach ? 0.28 : 0.02;
      group.position.y = group.userData.baseY;
      const character = characterById(player.character);
      const faceW = radius * (ordered.length > 5 ? 0.3 : 0.42) * zone.scale;
      const face = cardMesh(loadTexture(character?.image, textures), faceW, faceW * 1.48);
      face.position.set(0, 0.01, 0);
      face.userData.playerId = player.id;
      group.add(face);
      const gear = [player.equipment?.weapon, player.equipment?.barrel, player.equipment?.mustang, player.equipment?.scope, player.equipment?.jail, player.equipment?.dynamite].filter(Boolean);
      gear.forEach((card, gearIndex) => {
        const mesh = cardMesh(loadTexture(CARD_INFO[card.type]?.image, textures), faceW * 0.62, faceW * 0.9);
        mesh.position.set(faceW * 0.72, 0.02 + gearIndex * 0.01, -0.2 + gearIndex * 0.22);
        mesh.userData.playerId = player.id;
        group.add(mesh);
      });
      const role = player.role && ROLES[player.role];
      const roleMesh = cardMesh(role ? loadTexture(role.image, textures) : back, faceW * 0.55, faceW * 0.8);
      roleMesh.position.set(-faceW * 0.62, 0.015, 0.05);
      roleMesh.userData.playerId = player.id;
      group.add(roleMesh);
      const backs = Math.min(player.handCount || 0, 6);
      for (let n = 0; n < backs; n += 1) {
        const pile = cardMesh(back, faceW * 0.48, faceW * 0.7);
        pile.position.set(0.08, 0.03 + n * 0.015, faceW * 0.55);
        pile.userData.playerId = player.id;
        group.add(pile);
      }
      if (reach) {
        const pool = new THREE.PointLight(0xffc48a, 1.4, 2.4, 2);
        pool.position.set(x, 1.3, z);
        scene.add(pool);
        lights.set(player.id, pool);
      }
      scene.add(group);
      groups.set(player.id, group);
    });
    const deck = layout.zones.find((item) => item.id === "deck");
    if (deck && next.deckCount) {
      const group = new THREE.Group();
      const radius = canvas.__bangRadius || 4.4;
      group.position.set(-radius * 0.22, 0.03, 0);
      const mesh = cardMesh(back, radius * 0.28, radius * 0.4);
      mesh.userData.kind = "deck";
      group.add(mesh);
      scene.add(group);
      groups.set("deck", group);
    }
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
      const lift = aimIds.has(group.userData.playerId) ? 0.55 : group.userData.baseY;
      group.position.y += (lift - group.position.y) * (reduced() ? 1 : 0.18);
    }
    renderer.render(scene, camera);
  }

  function update(next, aim) {
    aimIds = new Set(aim || []);
    resize();
    rebuild(next);
    return projectSeats();
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const hit = hits.find((item) => item.object.userData.playerId);
    return hit?.object.userData.playerId || "";
  }

  resize();
  window.addEventListener("resize", resize);
  tick();
  return {
    update,
    pick,
    resize,
    stop() {
      running = false;
      renderer.dispose();
    },
  };
}
