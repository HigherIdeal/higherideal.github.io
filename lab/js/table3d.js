import * as THREE from "../vendor/three.module.js?v=15";
import { CARD_INFO, ROLES, characterById } from "./cards.js?v=15";
import { cameraRig, fitCard, solveProjectedLayout } from "./layout.js?v=15";

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
  scene.fog = new THREE.FogExp2(0x000000, 0.012);
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
    new THREE.PlaneGeometry(240, 240),
    new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vPos = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        void main() {
          float d = length(vPos.xz);
          float fade = smoothstep(5.5, 14.0, d);
          vec3 col = mix(vec3(0.055, 0.043, 0.032), vec3(0.0), fade);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
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

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    const rig = cameraRig(width, height);
    camera.aspect = rig.aspect;
    camera.fov = rig.fov * 180 / Math.PI;
    camera.position.set(rig.position.x, rig.position.y, rig.position.z);
    camera.lookAt(rig.lookAt.x, rig.lookAt.y, rig.lookAt.z);
    camera.updateProjectionMatrix();
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
    const layout = solveProjectedLayout(width, height, ordered.length);
    const rig = cameraRig(width, height);
    const put = (zone, texture, playerId) => {
      if (!zone || !texture) return;
      const fit = fitCard(rig, zone, width, height);
      if (!fit) return;
      const mesh = cardMesh(texture, fit.w, fit.d);
      mesh.position.set(fit.center.x, 0.03, fit.center.z);
      mesh.userData.baseY = 0.03;
      if (playerId) mesh.userData.playerId = playerId;
      scene.add(mesh);
      groups.set(zone.id, mesh);
    };
    ordered.forEach((player, index) => {
      const zone = (kind) => layout.leaves.find((item) => item.seat === index && item.kind === kind);
      const character = characterById(player.character);
      const role = player.role && ROLES[player.role];
      put(zone("character"), loadTexture(character?.image, textures) || back, player.id);
      put(zone("role"), role ? loadTexture(role.image, textures) : back, player.id);
      if (player.id !== next.yourId) put(zone("hand"), back, player.id);
      const eq = player.equipment || {};
      put(zone("weapon"), eq.weapon ? loadTexture(CARD_INFO[eq.weapon.type]?.image, textures) : null, player.id);
      const blue = eq.jail || eq.dynamite || eq.barrel || eq.mustang || eq.scope;
      put(zone("jail"), blue ? loadTexture(CARD_INFO[blue.type]?.image, textures) : null, player.id);
      if (eq.jail && eq.dynamite) put(zone("dynamite"), loadTexture(CARD_INFO[eq.dynamite.type]?.image, textures), player.id);
      const reach = player.id !== next.yourId && player.connected !== false && player.distance != null && player.distance <= weaponRange(next);
      const anchor = zone("character");
      const fit = anchor && fitCard(rig, anchor, width, height);
      if (fit && reach) {
        const pool = new THREE.PointLight(0xffc48a, 1.6, 3.2, 2);
        pool.position.set(fit.center.x, 1.4, fit.center.z);
        scene.add(pool);
        lights.set(player.id, pool);
      }
    });
    if (next.deckCount) put(layout.deck, back, "");
    if (next.discardTop) put(layout.discard, loadTexture(CARD_INFO[next.discardTop.type]?.image, textures), "");
    groups.__layout = layout;
    groups.__order = ordered.map((player) => player.id);
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
    }
    renderer.render(scene, camera);
  }

  function update(next, aim) {
    aimIds = new Set(aim || []);
    resize();
    rebuild(next);
    const order = groups.__order || [];
    const layout = groups.__layout;
    if (!layout) return [];
    return layout.leaves.filter((zone) => zone.kind === "label").map((zone) => ({
      id: order[zone.seat],
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: zone.h,
    }));
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
