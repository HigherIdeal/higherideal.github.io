// Presentation-only effects. Never mutates or sends game state.
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let soundOn = localStorage.getItem("bang-fx-sound") === "1";
let audioContext = null;
let toastTimer = 0;

export function isSoundOn() { return soundOn; }

export function toggleSound() {
  soundOn = !soundOn;
  localStorage.setItem("bang-fx-sound", soundOn ? "1" : "0");
  if (soundOn) playSound("toggle");
  return soundOn;
}

function playSound(type) {
  if (!soundOn || reduced()) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) audioContext = new Audio();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const at = audioContext.currentTime;
    const notes = {
      toggle: [480, 660, 0.08],
      draw: [320, 460, 0.09],
      card: [340, 230, 0.12],
      hit: [110, 65, 0.18],
      turn: [400, 560, 0.15],
    };
    const [from, to, duration] = notes[type] || notes.card;
    osc.type = type === "hit" ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(type === "hit" ? 0.045 : 0.024, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  } catch { /* Audio is optional. */ }
}

function rect(element) {
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function captureBefore(app, view) {
  if (!view || (view.phase !== "play" && view.phase !== "select")) return null;
  const cards = new Map();
  app.querySelectorAll("[data-hand-card]").forEach((el) => {
    if (!el.dataset.cardId) return;
    cards.set(el.dataset.cardId, { box: rect(el), node: el.cloneNode(true) });
  });
  return { cards, deck: rect(app.querySelector('.center-piles [data-card-id="deck"]')) };
}

function fly(node, from, to, delay = 0, type = "card") {
  if (reduced() || !from || !to || from.width < 2 || to.width < 2) return;
  const ghost = node.cloneNode(true);
  ghost.classList.add("motion-ghost");
  ghost.removeAttribute("id");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("tabindex", "-1");
  Object.assign(ghost.style, {
    position: "fixed", left: from.left + "px", top: from.top + "px",
    width: from.width + "px", height: from.height + "px",
    zIndex: "110", pointerEvents: "none", transformOrigin: "top left",
  });
  document.body.appendChild(ghost);
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  const scale = Math.max(0.35, Math.min(2, to.width / from.width));
  const motion = ghost.animate([
    { transform: "translate3d(0,0,0) rotate(-5deg)", opacity: 0.92 },
    { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale}) rotate(3deg)`, opacity: 0.12 },
  ], { duration: type === "draw" ? 480 : 440, delay, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" });
  motion.finished.then(() => ghost.remove(), () => ghost.remove());
}

function eventToast(message) {
  if (!message) return;
  let target = document.querySelector("#fx-event-toast");
  if (!target) {
    target = document.createElement("div");
    target.id = "fx-event-toast";
    target.className = "fx-event-toast";
    target.setAttribute("role", "status");
    target.setAttribute("aria-live", "polite");
    document.body.appendChild(target);
  }
  clearTimeout(toastTimer);
  target.textContent = message.length > 86 ? message.slice(0, 85) + "…" : message;
  target.classList.remove("is-visible");
  void target.offsetWidth;
  target.classList.add("is-visible");
  toastTimer = window.setTimeout(() => target.classList.remove("is-visible"), 2300);
}

export function applyEffects(app, previous, next, frame) {
  if (!previous || !next || previous.seq === next.seq && previous.phase === next.phase) return;
  if (next.phase !== "play" && next.phase !== "end") return;

  const oldLog = previous.log?.at(-1)?.id;
  const last = next.log?.at(-1);
  if (last && last.id !== oldLog) eventToast(last.text);

  if (next.phase === "play" && previous.currentId && next.currentId !== previous.currentId) {
    app.querySelectorAll(".is-turn").forEach((node) => {
      node.classList.add("turn-arrival");
      node.addEventListener("animationend", () => node.classList.remove("turn-arrival"), { once: true });
    });
    playSound("turn");
  }

  let hit = false;
  if (previous.phase === "play") {
    for (const p of next.players || []) {
      const was = previous.players?.find((x) => x.id === p.id);
      if (!was || p.hp >= was.hp) continue;
      const node = [...app.querySelectorAll("[data-player]")].find((el) => el.dataset.player === p.id);
      const target = node || (p.id === next.yourId ? app.querySelector(".self-tray") : null);
      if (target) {
        target.classList.add("is-hit");
        target.addEventListener("animationend", () => target.classList.remove("is-hit"), { once: true });
      }
      hit = true;
    }
  }
  if (hit) playSound("hit");

  const me = next.players?.find((p) => p.id === next.yourId);
  const oldMe = previous.players?.find((p) => p.id === next.yourId);
  if (!me || !oldMe || !frame) return;
  const oldCards = new Set((oldMe.hand || []).map((c) => c.id));
  const newCards = new Set((me.hand || []).map((c) => c.id));
  const deck = rect(app.querySelector('.center-piles [data-card-id="deck"]')) || frame.deck;
  const discard = rect(app.querySelector(".center-piles [data-discard-top]")) ||
    rect(app.querySelector(".center-piles"));
  let drawn = 0;
  for (const card of me.hand || []) {
    if (oldCards.has(card.id) || drawn >= 4) continue;
    const node = [...app.querySelectorAll("[data-hand-card]")].find((el) => el.dataset.cardId === card.id);
    if (node && deck) {
      node.closest(".stack-item")?.classList.add("is-dealt");
      fly(node, deck, rect(node), drawn * 70, "draw");
      drawn++;
    }
  }
  let played = 0;
  for (const [id, old] of frame.cards) {
    if (newCards.has(id) || played >= 3) continue;
    if (old?.box && old.node && discard) {
      fly(old.node, old.box, discard, played * 60);
      played++;
    }
  }
  if (drawn) playSound("draw");
  else if (played && !hit) playSound("card");
}
