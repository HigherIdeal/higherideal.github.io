import * as THREE from "../vendor/three.module.js?v=17";
import { CARD_INFO, ROLES, characterById } from "./cards.js?v=17";
import { cameraRig, solveProjectedLayout } from "./layout.js?v=17";

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
  renderer.toneMappingExposure = 1.05;
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
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x161616, metalness: 0.94, roughness: 0.1 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf0c14a, metalness: 0.78, roughness: 0.22, emissive: 0x8a6414, emissiveIntensity: 0.4 });
  const dashes = Array.from({ length: 16 }, () => {
      const dash = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 1 }),
    );
    dash.visible = false;
    scene.add(dash);
    return dash;
  });
  const turnLight = new THREE.SpotLight(0xfff7e8, 0, 7.5, 0.38, 0.5, 1);
  scene.add(turnLight);
  scene.add(turnLight.target);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let view = null;
  let aimIds = new Set();
  let running = true;
  let width = 1;
  let height = 1;
  let yaw = 0;
  let pitch = 0;
  let distMul = 0.72;
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

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    applyRig();
  }

  function resetView() {
    yaw = 0;
    pitch = 0;
    distMul = 0.72;
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
      material.color.set(0xfff6ea);
      material.emissive.set(0x6b4424);
      material.emissiveIntensity = 0.16;
    } else if (mode === "dim") {
      material.color.set(0x8a8478);
      material.emissive.set(0x000000);
      material.emissiveIntensity = 0;
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    if (mode === "reach") {
      const rim = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 1.12, h * 1.12),
        new THREE.MeshBasicMaterial({ color: 0xffb15a, transparent: true, opacity: 0.38, depthWrite: false }),
      );
      rim.position.z = -0.01;
      mesh.add(rim);
    }
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
    const layout = solveProjectedLayout(width, height, ordered.length);
    const mine = next.yourId;
    const onTurn = next.currentId === mine && next.turnPhase === "play" && !next.prompt;
    const put = (zone, texture, playerId, mode) => {
      if (!zone?.world || !texture) return;
      const mesh = cardMesh(texture, zone.world.w, zone.world.d, mode);
      mesh.position.set(zone.world.x, mode === "reach" ? 0.08 : 0.03, zone.world.z);
      mesh.rotation.order = "YXZ";
      mesh.rotation.y = Math.atan2(-zone.world.x, -zone.world.z);
      mesh.rotation.x = -Math.PI / 2;
      mesh.userData.baseY = mesh.position.y;
      mesh.userData.image = typeof texture === "string" ? texture : (texture?.image?.toDataURL?.() || "");
      if (playerId) {
        mesh.userData.playerId = playerId;
        mesh.userData.peek = playerId !== mine;
      }
      scene.add(mesh);
      groups.set(zone.id, mesh);
    };
    ordered.forEach((player, index) => {
      const zone = (kind) => layout.leaves.find((item) => item.seat === index && item.kind === kind);
      const reach = onTurn && player.id !== mine && player.connected !== false && player.distance != null && player.distance <= weaponRange(next);
      const mode = player.id === mine ? "self" : (reach ? "reach" : "dim");
      const character = characterById(player.character);
      const role = player.role && ROLES[player.role];
      put(zone("character"), loadTexture(character?.image, textures) || back, player.id, mode);
      put(zone("role"), role ? loadTexture(role.image, textures) : back, player.id, mode);
      if (player.id !== mine) put(zone("hand"), back, player.id, mode);
      const eq = player.equipment || {};
      put(zone("weapon"), eq.weapon ? loadTexture(CARD_INFO[eq.weapon.type]?.image, textures) : null, player.id, mode);
      const blue = eq.jail || eq.dynamite || eq.barrel || eq.mustang || eq.scope;
      put(zone("jail"), blue ? loadTexture(CARD_INFO[blue.type]?.image, textures) : null, player.id, mode);
      if (eq.jail && eq.dynamite) put(zone("dynamite"), loadTexture(CARD_INFO[eq.dynamite.type]?.image, textures), player.id, mode);
      const anchor = zone("character");
      if (anchor?.world && reach) {
        const pool = new THREE.PointLight(0xffb56a, 1.15, 1.7, 2);
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
      const marker = new THREE.Mesh(sheriff ? starGeo : new THREE.SphereGeometry(0.085, 28, 18), sheriff ? goldMat : blackMat);
      if (sheriff) {
        marker.rotation.x = -Math.PI / 2;
        marker.scale.setScalar(0.38);
      }
      marker.position.set(spot.world.x, 1.05, spot.world.z);
      marker.userData.bob = index * 0.7;
      marker.userData.baseY = 1.05;
      marker.userData.playerId = player.id;
      scene.add(marker);
      markers.set(player.id, marker);
    });
    if (next.deckCount) put(layout.deck, back, "", "self");
    if (next.discardTop) put(layout.discard, loadTexture(CARD_INFO[next.discardTop.type]?.image, textures), "", "self");
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
      const t = ((index / dashes.length) + time * 0.45) % 1;
      dash.position.copy(arcPoint(from.position, goal.position, t));
      dash.visible = true;
      const fade = arc.phase === "preview" ? 0.38 : Math.max(0, 1 - Math.max(0, age - 0.45) / 0.9);
      dash.material.opacity = fade;
      dash.scale.setScalar(arc.phase === "flash" && age < 0.25 ? 1.6 : 1);
    });
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
    let obj = hits[0]?.object;
    while (obj && !obj.userData?.playerId && !obj.userData?.peek) obj = obj.parent;
    if (!obj) return null;
    return {
      playerId: obj.userData.playerId || "",
      image: obj.userData.image || "",
      peek: Boolean(obj.userData.peek),
    };
  }

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("wheel", (event) => {
    distMul = Math.min(1.4, Math.max(0.48, distMul * (event.deltaY > 0 ? 1.06 : 0.94)));
    applyRig();
  }, { passive: true });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.target !== canvas) return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY, ox: event.clientX, oy: event.clientY, button: event.button });
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
    if (moved < 8 && prev.button === 0) {
      const now = Date.now();
      if (now - lastTap < 320) {
        lastTap = 0;
        resetView();
        return;
      }
      lastTap = now;
      const info = pick(event.clientX, event.clientY);
      if (info?.peek && info.image) onPeek?.(info);
    } else settleView();
  }
  canvas.addEventListener("pointerup", endFinger);
  canvas.addEventListener("pointercancel", (event) => fingers.delete(event.pointerId));
  let onPeek = null;

  resize();
  window.addEventListener("resize", resize);
  tick();
  return {
    update,
    pick,
    resize,
    resetView,
    setPeek(fn) { onPeek = fn; },
    stop() {
      running = false;
      renderer.dispose();
    },
  };
}
