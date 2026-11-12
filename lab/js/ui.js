import { CARD_INFO, CHARACTERS, ROLES, SUITS, characterById } from "./cards.js?v=27";
import { naturalKorean } from "./engine.js?v=27";
import { applyEffects, captureBefore, isSoundOn, toggleSound } from "./motion.js?v=27";
import { solveProjectedLayout } from "./layout.js?v=27";
import { mountTable } from "./table3d.js?v=27";
import { stampURL } from "./stamp.js?v=27";

const ui = {
  selected: null,
  discard: new Set(),
  sid: new Set(),
  sidMode: false,
  roleFlip: false,
  tab: "log",
  chat: "",
  picker: null,
  wired: false,
  spread: null,
  spreadPick: null,
  hostAsk: null,
  kitKeep: new Set(),
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function cardArt(card, attrs = "") {
  if (!card || card.back || card.type === "back") {
    return `<button type="button" class="card card-back" ${attrs}><span class="back-mark">BANG!</span></button>`;
  }
  const info = CARD_INFO[card.type];
  const suit = SUITS[card.suit];
  const pip = `${suit.symbol}${esc(card.rank)}`;
  const tone = suit.red ? " red" : "";
  return `<button type="button" class="card" data-card-id="${esc(card.id)}" data-type="${esc(card.type)}" data-suit="${esc(card.suit)}" data-rank="${esc(card.rank)}" ${attrs}>
    <img src="${info.image}" alt="${esc(info.ko)}" draggable="false" />
    <span class="art-index" aria-hidden="true"></span>
    <span class="pip${tone}">${pip}</span>
    <span class="pip pip-foot${tone}">${pip}</span>
  </button>`;
}

function backCard(label, attrs = "") {
  return `<button type="button" class="card card-back" ${attrs}><span class="back-mark">BANG!</span><small>${esc(label)}</small></button>`;
}

export function mount(app, ctx) {
  app.__ctx = ctx;
  if (ui.pointerDown) {
    ui.pendingCtx = ctx;
    return;
  }
  paint(app, ctx);
}

function paint(app, ctx) {
  const previousView = ui.paintedView || null;
  const html = screenHtml(ctx);
  const same = ui.lastHtml === html && app.childElementCount > 0;
  if (!same) {
    const previousFrame = captureBefore(app, previousView);
    app.innerHTML = html;
    ui.lastHtml = html;
    applyEffects(app, previousView, ctx.view, previousFrame);
  }
  ui.paintedView = ctx.view;
  ui.life = {};
  for (const person of ctx.view?.players || []) ui.life[person.id] = person.hp;
  const prevYou = previousView?.players?.find((p) => p.id === previousView.yourId);
  const you = ctx.view?.players?.find((p) => p.id === ctx.view.yourId);
  if (prevYou && you && previousView.turnPhase === "draw" && ctx.view.turnPhase === "play" && you.hand && prevYou.hand && you.hand.length > prevYou.hand.length) {
    flyDrawCards(you.hand.slice(prevYou.hand.length));
  }
  const latestCue = (ctx.view?.cues || []).slice(-1)[0];
  if (latestCue && latestCue.id !== ui.seenCue) {
    ui.seenCue = latestCue.id;
    showAbilityCue(latestCue.text);
  }
  const view = ctx.view;
  app.dataset.screen = view?.phase || (ctx.status?.mode === "entry" ? "entry" : "wait");
  app.dataset.status = ctx.status?.mode || "";
  app.dataset.phase = view?.phase || "";
  app.dataset.prompt = view?.prompt?.mine ? view.prompt.kind : "";
  app.dataset.yourTurn = view && view.currentId === view.yourId && view.turnPhase === "play" && !view.prompt ? "1" : "0";
  app.dataset.aiming = ui.selected ? "1" : "0";
  app.dataset.winner = view?.winner?.team || "";
  app.dataset.host = view && view.yourId === view.hostId ? "1" : "0";
  app.dataset.arc = view?.arc ? "1" : "";
  if (!ui.wired) {
    ui.wired = true;
    app.addEventListener("pointerdown", () => { ui.pointerDown = true; }, true);
    const release = () => {
      ui.pointerDown = false;
      setTimeout(() => {
        if (ui.pointerDown || !ui.pendingCtx) return;
        const next = ui.pendingCtx;
        ui.pendingCtx = null;
        paint(app, next);
      }, 0);
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    let lastAim = "";
    window.addEventListener("pointermove", (event) => {
      const ctx = app.__ctx;
      const view = ctx?.view;
      if (!view || view.currentId !== view.yourId || view.turnPhase !== "play" || !ui.selected) {
        if (lastAim) {
          lastAim = "";
          ctx?.onAction?.({ type: "aim", targetId: "" });
        }
        return;
      }
      const seat = event.target?.closest?.("[data-player]");
      const id = seat && isTarget(view, seat.dataset.player) ? seat.dataset.player : "";
      if (id === lastAim) return;
      lastAim = id;
      globalThis.__bangLocalArc = id
        ? { fromId: view.yourId, toId: id, phase: "preview", at: Date.now() }
        : null;
      ctx.onAction({ type: "aim", targetId: id });
    });
    app.addEventListener("click", (event) => onClick(event, app));
    app.addEventListener("submit", (event) => onSubmit(event, app));
    wireSpread();
    wireFan();
  }
  if (ui.fan && view) {
    const me = view.players?.find((p) => p.id === view.yourId);
    const ids = new Set((me?.hand || []).map((card) => card.id));
    if (!ui.fan.cards.every((card) => ids.has(card.id))) closeFan();
    else ui.fan.cards = me.hand;
  }
  if (view?.arc) globalThis.__bangLocalArc = null;
  else if ((view?.seq || 0) !== globalThis.__bangAimSeq) {
    globalThis.__bangLocalArc = null;
    globalThis.__bangAimSeq = view?.seq || 0;
  }
  renderSpread(ctx);
  syncTable(app, view);
  syncReveal(view);
}

function soundButtonHtml() {
  return `<button type="button" class="sound-toggle" data-action="sound-toggle" aria-label="효과음 ${isSoundOn() ? "끄기" : "켜기"}" aria-pressed="${isSoundOn()}">${isSoundOn() ? "소리 켜짐" : "소리 꺼짐"}</button>`;
}
function screenHtml(ctx) {
  if (!ctx.view) return ctx.status?.mode === "entry" || !ctx.status ? entryHtml(ctx) : waitHtml(ctx);
  if (ctx.view.phase === "lobby") return lobbyHtml(ctx);
  if (ctx.view.phase === "select") return selectHtml(ctx);
  return tableHtml(ctx);
}

function entryHtml(ctx) {
  const name = esc(ctx.savedName || "");
  return `<main class="entry">
    <form class="poster ${ctx.entryError ? "is-shake" : ""}" data-form="entry" autocomplete="off">
      <div class="brand"><h1 class="bang">BANG!</h1><p class="ko">뱅!</p></div>
      <p class="tagline">최대 7명</p>
      <label class="field"><span>닉네임</span>
        <input data-field="nickname" maxlength="12" required placeholder="이름을 적어 주세요" value="${name}" />
      </label>
      <label class="field"><span>오늘의 암호</span>
        <input data-field="code" inputmode="numeric" maxlength="12" required placeholder="암호" autocomplete="off" />
      </label>
      <button class="enter-btn" type="submit" data-action="enter">입장</button>
      <p class="form-error" role="alert">${esc(ctx.entryError || "")}</p>
      <p class="footnote">같은 링크로 들어온 사람들만 한 테이블에 앉습니다.</p>
    </form>
  </main>`;
}

function waitHtml(ctx) {
  const lost = ctx.status?.mode === "lost";
  return `<main class="entry">
    <section class="poster">
      <div class="brand"><h1 class="bang">BANG!</h1><p class="ko">뱅!</p></div>
      <p class="tagline">${esc(ctx.status?.text || "방을 찾는 중…")}</p>
      ${lost ? `<button class="enter-btn" type="button" data-action="takeover">내가 방장 되기</button>` : `<p class="footnote">먼저 들어온 사람이 방장이 됩니다.</p>`}
      ${toastHtml(ctx)}
    </section>
  </main>`;
}

function lobbyHtml(ctx) {
  const view = ctx.view;
  const me = view.players.find((p) => p.id === view.yourId);
  const count = view.players.length;
  const host = view.yourId === view.hostId;
  const ready = count >= 2;
  return `<main class="salon">
    <header class="topbar">
      <div class="brand-mini">BANG!</div>
      <p>${esc(ctx.status?.text || "")}</p>
      ${soundButtonHtml()}
       <button type="button" data-action="help">도움말</button>
    </header>
    <section class="lobby">
      <h1>대기실</h1>
      <p class="muted" data-count="${count}">${count}/7명 · 2명이면 시작할 수 있습니다. 4명부터 정식 역할입니다.</p>
      <ol class="roster">
        ${view.players.map((p) => `<li data-player="${esc(p.id)}" data-presence="${p.connected ? "on" : "off"}">
          <span>${esc(p.nickname)}</span>
          <span class="marks">
            ${p.isHost ? `<em>방장</em>` : ""}
            ${p.id === view.yourId ? `<em>나</em>` : ""}
            ${presenceHtml(p)}
          </span>
        </li>`).join("")}
      </ol>
      ${host
        ? `<label class="field"><span>방장 암호</span><input data-field="host-pass" type="password" maxlength="24" autocomplete="new-password" placeholder="일시정지·종료에 사용" /></label>
          <button class="enter-btn" type="button" data-action="start" ${ready ? "" : "disabled"}>${ready ? "게임 시작" : `${count}명 · 2명부터`}</button>
          <p class="footnote">진행 중인 판이 남아 있으면 종료로 대기실을 비울 수 있습니다. 떠난 사람은 같은 닉네임으로 다시 앉습니다.</p>`
        : `<p class="footnote">${esc(me?.nickname || "")} 님, 방장이 시작하기를 기다리는 중입니다. 진행 중인 판이면 같은 닉네임으로 들어와 자리를 이어 받으세요.</p>`}
      <button class="text-btn" type="button" data-action="leave">나가기</button>
    </section>
    ${toastHtml(ctx)}
    ${helpHtml()}
  </main>`;
}

function selectHtml(ctx) {
  const view = ctx.view;
  const me = view.players.find((p) => p.id === view.yourId);
  const choices = (me?.choices || []).map((id) => characterById(id)).filter(Boolean);
  return `<main class="salon">
    <header class="topbar">
      <div class="brand-mini">BANG!</div>
      <p>${me?.role ? ROLES[me.role].ko : "역할 확인"} · 인물을 고르세요</p>
      ${soundButtonHtml()}
       <button type="button" data-action="help">도움말</button>
    </header>
    <section class="choose">
      ${me?.role ? `<div class="my-role">
        <img src="${ROLES[me.role].image}" alt="${esc(ROLES[me.role].ko)}" />
        <div><strong>${esc(ROLES[me.role].ko)}</strong><p>${esc(ROLES[me.role].goal)}</p></div>
      </div>` : ""}
      ${me?.character ? `<p class="chosen-note">${esc(naturalKorean(`${characterById(me.character).name}(으)로 앉았습니다.`))} 다른 사람을 기다리는 중.</p>` : `
        <div class="choice-row">
          ${choices.map((ch) => `<button type="button" class="choice" data-char="${esc(ch.id)}">
            <span class="card"><img src="${ch.image}" alt="${esc(ch.name)}" draggable="false" /></span>
            <strong>${esc(ch.name)}</strong>
            <em>생명 ${ch.hp + (me?.role === "sheriff" ? 1 : 0)}</em>
            <p>${esc(ch.ability)}</p>
          </button>`).join("")}
        </div>`}
      <ul class="roster compact">
        ${view.players.map((p) => `<li data-player="${esc(p.id)}" data-presence="${p.connected ? "on" : "off"}">
          <span>${esc(p.nickname)}${p.role === "sheriff" ? " · 보안관" : ""}</span>
          <span class="marks">
            <em>${p.character ? esc(characterById(p.character).name) : "고르는 중"}</em>
            ${presenceHtml(p)}
          </span>
        </li>`).join("")}
      </ul>
    </section>
    ${toastHtml(ctx)}
    ${helpHtml()}
  </main>`;
}

function tableHtml(ctx) {
  const view = ctx.view;
  const me = view.players.find((p) => p.id === view.yourId);
  const living = view.players.filter((p) => p.alive);
  const start = Math.max(0, living.findIndex((p) => p.id === view.yourId));
  const ring = living.length ? living.map((_, i) => living[(start + i) % living.length]) : [];
  const current = view.players.find((p) => p.id === view.currentId);
  const ended = view.phase === "end";
  return `<main class="table-screen">
    <section class="table-wrap">
      <header class="topbar">
        <div class="brand-mini">BANG!</div>
        <p>${esc(phaseLine(view, current))}</p>
        ${soundButtonHtml()}
        <button type="button" data-action="reset-view">시점</button>
        ${view.yourId === view.hostId ? `<button type="button" data-action="pause">일시정지</button><button type="button" data-action="resume">재개</button><button type="button" data-action="fresh">종료</button>` : ""}
       <button type="button" data-action="help">도움말</button>
      </header>
      <div class="board">
      <div class="felt">
      ${aroundHtml(ring.filter((p) => p.id !== view.yourId), view)}
      <div class="center-piles" data-discard-pile="1">
        ${view.deckCount ? backCard(String(view.deckCount), `data-card-id="deck" aria-label="덱 ${view.deckCount}장"`) : ""}
        ${view.discardTop ? cardArt(view.discardTop, `data-discard-top="1"`) : ""}
        ${storeHtml(view)}
        ${promptCardsHtml(view)}
      </div>
      ${deadHtml(view)}
      ${me?.alive ? selfTray(me, view) : ""}
      ${ended ? endHtml(view) : ""}
      </div>
      <div class="hand-dock">
        ${me?.alive && view.phase === "play" ? handHtml(view, me) : ""}
        ${actionBar(view, me)}
      </div>
      </div>
    </section>
    ${abilityPanel(view)}
    ${view.paused ? `<div class="pause-overlay" role="status">일시정지</div>` : ""}
    ${hostPassHtml()}
    ${pickerHtml(view)}
    ${toastHtml(ctx)}
    ${helpHtml()}
  </main>`;
}

function aroundHtml(others, view) {
  const n = others.length;
  const base = Math.floor(n / 3);
  const extra = n % 3;
  let leftN = base;
  let topN = base;
  let rightN = base;
  if (extra === 1) topN += 1;
  else if (extra === 2) {
    leftN += 1;
    rightN += 1;
  }
  const left = others.slice(0, leftN);
  const top = others.slice(leftN, leftN + topN);
  const right = others.slice(leftN + topN);
  const seats = (list) => list.map((p) => seatHtml(p, view)).join("");
  return `<div class="around">
    <div class="side side-left">${seats(left)}</div>
    <div class="side side-top">${seats(top)}</div>
    <div class="side side-right">${seats(right)}</div>
  </div>`;
}

function stackHtml(id, pieces, extra = "") {
  const cards = pieces.filter(Boolean);
  if (!cards.length) return "";
  return `<div class="stack ${extra}" data-stack-id="${esc(id)}" style="--n:${cards.length}">
    ${cards.map((html, i) => `<div class="stack-item" style="--i:${i}">${html}</div>`).join("")}
  </div>`;
}

function seatCards(p, view) {
  const ch = characterById(p.character);
  return [
    roleFace(p, view),
    ch ? `<button type="button" class="card char-card" data-card-id="${esc(p.character)}"><img src="${ch.image}" alt="${esc(ch.name)}" draggable="false" /></button>` : "",
    gearFan(p),
  ];
}

function seatHtml(p, view) {
  const selected = ui.picker?.targetId === p.id || isTarget(view, p.id);
  const offline = p.connected === false;
  const me = view.players.find((player) => player.id === view.yourId);
  const weapon = me?.equipment?.weapon;
  const range = weapon ? (CARD_INFO[weapon.type]?.range || 1) : 1;
  const reachable = Boolean(me?.alive && p.alive && p.distance != null && p.distance <= range);
  const distanceClass = view.phase !== "play" || !me?.alive ? "" : (selected || reachable ? "is-reachable" : "is-distant");
  const activeTurn = p.id === view.currentId ? "is-turn" : "";
  return `<div class="seat ${selected ? "is-target" : ""} ${offline ? "is-offline" : ""} ${distanceClass} ${activeTurn}" data-player="${esc(p.id)}" data-presence="${offline ? "off" : "on"}" data-distance="${p.distance ?? ""}">
    ${stackHtml(`seat-${p.id}`, seatCards(p, view))}
    <button type="button" class="seat-btn" data-player="${esc(p.id)}" ${selected ? `data-legal-target="1"` : ""} aria-label="${esc(p.nickname)}, 생명 ${p.hp}/${p.maxHp}">
      <span class="who">
        <span class="bullets" aria-label="생명 ${p.hp}/${p.maxHp}">${bullets(p.id, p.hp, p.maxHp)}</span>
        <strong>${esc(p.nickname)}</strong>
      </span>
    </button>
  </div>`;
}

function roleFace(p, view) {
  const ended = view.phase === "end";
  const mine = p.id === view.yourId;
  if (p.role === "sheriff" || ended) {
    const role = ROLES[p.role];
    if (!role) return backCard("역할");
    return `<button type="button" class="card role-card" data-card-id="role-${esc(p.id)}"><img src="${role.image}" alt="${esc(role.ko)}" draggable="false" /></button>`;
  }
  if (mine && p.role) {
    const role = ROLES[p.role];
    return `<button type="button" class="card flip role-card" data-self-role="1" data-card-id="my-role" aria-label="내 역할 카드">
      <span class="flip-inner ${ui.roleFlip ? "is-flipped" : ""}">
        <span class="flip-face flip-front card-back-fill"><b>BANG!</b></span>
        <span class="flip-face flip-back"><img src="${role.image}" alt="${esc(role.ko)}" draggable="false" /></span>
      </span>
    </button>`;
  }
  return backCard("역할", `data-card-id="role-${esc(p.id)}"`);
}

function equipPieces(p) {
  const eq = p.equipment || {};
  return [eq.weapon, eq.barrel, eq.mustang, eq.scope, eq.jail, eq.dynamite]
    .filter(Boolean)
    .map((card) => cardArt(card, `data-equip="${esc(card.id)}"`));
}

function gearFan(p) {
  const cards = equipPieces(p);
  if (!cards.length) return "";
  return `<button type="button" class="blue-fan" data-gear-stack="${esc(p.id)}" aria-label="장착 카드 ${cards.length}장">${cards.join("")}</button>`;
}

function presenceHtml(p) {
  const on = p.connected !== false;
  return `<span class="presence ${on ? "is-on" : "is-off"}" data-presence="${on ? "on" : "off"}">${on ? "접속" : "오프라인"}</span>`;
}

function bulletGraphic(ghost) {
  if (ghost) {
    return `<svg class="ghost" viewBox="0 0 24 48" aria-hidden="true">
      <path d="M12 3.2 18 15.2H6Z" fill="none" stroke="#e6c69c" stroke-width="1.6" stroke-dasharray="2.4 1.7" stroke-linejoin="round"/>
      <rect x="6.4" y="16" width="11.2" height="26" rx="1.2" fill="none" stroke="#e6c69c" stroke-width="1.6" stroke-dasharray="2.4 1.7"/>
    </svg>`;
  }
  return `<svg class="round" viewBox="0 0 24 48" aria-hidden="true">
    <path d="M12 2.2 18.2 15H5.8Z" fill="#c4622e"/>
    <path d="M12 2.2 15.2 15 12 13.4Z" fill="#f0b184"/>
    <rect x="6.2" y="14.6" width="11.6" height="25.2" rx="1.1" fill="#e2bc58"/>
    <rect x="8" y="14.6" width="2.1" height="25.2" fill="#f8e7ad"/>
    <rect x="5.2" y="37.2" width="13.6" height="5.4" rx="1" fill="#a67c32"/>
    <circle cx="12" cy="39.8" r="1.35" fill="#5c4316"/>
  </svg>`;
}

function bullets(id, hp, max) {
  if (!max) return "";
  const prev = ui.life?.[id];
  let html = "";
  for (let i = 0; i < max; i += 1) {
    const live = i < hp;
    let anim = "";
    if (prev != null && i >= hp && i < prev) anim = " is-pop";
    else if (prev != null && i >= prev && i < hp) anim = " is-drop";
    html += `<i class="bullet ${live ? "is-live" : "is-empty"}${anim}">${bulletGraphic(false)}${bulletGraphic(true)}</i>`;
  }
  return html;
}

function selfTray(p, view) {
  const selected = isTarget(view, p.id);
  return `<div class="self-tray ${selected ? "is-target" : ""} ${p.id === view.currentId ? "is-turn" : ""}" data-player="${esc(p.id)}">
    ${stackHtml("self", seatCards(p, view))}
    <button type="button" class="seat-btn" data-player="${esc(p.id)}" ${selected ? 'data-legal-target="1"' : ""} aria-label="${esc(p.nickname)}, 생명 ${p.hp}/${p.maxHp}">
      <span class="who">
        <span class="bullets" aria-label="생명 ${p.hp}/${p.maxHp}">${bullets(p.id, p.hp, p.maxHp)}</span>
        <strong>${esc(p.nickname)}</strong>
      </span>
    </button>
  </div>`;
}

function deadHtml(view) {
  const dead = view.players.filter((p) => !p.alive);
  if (!dead.length) return "";
  return `<p class="graveyard">탈락: ${dead.map((p) => esc(p.nickname)).join(", ")}</p>`;
}

function handHtml(view, me) {
  const hand = me.hand || [];
  const pieces = hand.map((card) => {
    const info = (view.handInfo || []).find((h) => h.cardId === card.id);
    const response = responseKind(view, me, card);
    const selected = ui.selected === card.id || ui.discard.has(card.id) || ui.sid.has(card.id);
    return {
      selected,
      html: cardArt(card, `data-hand-card="1" ${response ? `data-response-card="1"` : ""} ${info && !info.ok ? `data-illegal="1"` : ""}`),
    };
  });
  if (!pieces.length) return "";
  return `<div class="stack hand" data-hand="1" data-stack-id="hand" style="--n:${pieces.length}">
    ${pieces.map((piece, i) => `<div class="stack-item ${piece.selected ? "is-up" : ""}" style="--i:${i}">${piece.html}</div>`).join("")}
  </div>`;
}

function responseKind(view, me, card) {
  const prompt = view.prompt;
  if (!prompt?.mine) return false;
  if (prompt.kind === "miss") return card.type === "missed" || (me.character === "calamity" && card.type === "bang");
  if (prompt.kind === "discard-bang") return card.type === "bang" || (me.character === "calamity" && card.type === "missed");
  if (prompt.kind === "save") return card.type === "beer";
  return false;
}

function isTarget(view, id) {
  if (!ui.selected || !view.handInfo) return false;
  const info = view.handInfo.find((h) => h.cardId === ui.selected);
  return Boolean(info?.ok && info.targets?.some((t) => t.id === id));
}

function actionBar(view, me) {
  if (!me?.alive || view.phase !== "play") return "";
  const mine = view.currentId === me.id;
  const prompt = view.prompt;
  const bits = [];
  if (prompt?.mine && (prompt.kind === "miss" || prompt.kind === "discard-bang")) {
    bits.push(`<button type="button" class="bar-btn danger" data-action="pass">${prompt.kind === "miss" ? "맞기" : "포기"}</button>`);
  }
  if (prompt?.mine && prompt.kind === "save") {
    bits.push(`<button type="button" class="bar-btn danger" data-action="pass">쓰러지기</button>`);
    if (me.character === "sid" && (me.hand || []).length >= 2) bits.push(`<button type="button" class="bar-btn" data-action="sid-mode">카드 2장으로 버티기</button>`);
  }
  if (prompt?.mine && prompt.kind === "discard") {
    bits.push(`<button type="button" class="bar-btn" data-action="discard">버리기 (${ui.discard.size}/${prompt.count})</button>`);
  }
  if (prompt?.mine && prompt.kind === "jesse") {
    bits.push(`<button type="button" class="bar-btn" data-draw="deck">덱에서</button>`);
    for (const id of prompt.options || []) {
      const who = view.players.find((p) => p.id === id);
      bits.push(`<button type="button" class="bar-btn" data-draw="player" data-target="${esc(id)}">${esc(who?.nickname || "")}의 손패</button>`);
    }
  }
  if (prompt?.mine && prompt.kind === "pedro") {
    bits.push(`<button type="button" class="bar-btn" data-draw="discard">버린 카드 가져오기</button>`);
    bits.push(`<button type="button" class="bar-btn" data-draw="deck">덱에서</button>`);
  }
  if (mine && !prompt && view.turnPhase === "play") {
    bits.push(`<button type="button" class="bar-btn" data-action="end">턴 종료</button>`);
    if (me.character === "sid" && me.hp < me.maxHp && (me.hand || []).length >= 2) {
      bits.push(`<button type="button" class="bar-btn" data-action="sid-mode">${ui.sidMode ? "회복 취소" : "카드 2장 버리고 회복"}</button>`);
    }
  }
  if (ui.sidMode && ui.sid.size === 2) bits.push(`<button type="button" class="bar-btn" data-action="sid-go">이 두 장으로 회복</button>`);
  if (!bits.length) return "";
  return `<div class="action-bar">${bits.join("")}</div>`;
}

function storeHtml(view) {
  if (!view.store) return "";
  const mine = view.store.pickerId === view.yourId;
  const who = view.players.find((p) => p.id === view.store.pickerId);
  return `<div class="store">
    <p>${mine ? "가져갈 카드를 고르세요" : `${esc(who?.nickname || "")} 님이 고르는 중`}</p>
    <div class="store-row">${view.store.cards.map((card) => cardArt(card, mine ? `data-store-card="1"` : "")).join("")}</div>
  </div>`;
}

function abilityPanel(view) {
  const me = view.players.find((p) => p.id === view.yourId);
  const prompt = view.prompt;
  if (view.currentId === view.yourId && view.turnPhase === "draw" && !prompt && !view.paused) {
    return `<button type="button" class="draw-prompt" data-action="draw">카드 뽑기</button>`;
  }
  if (me?.character === "sid" && view.currentId === me.id && view.turnPhase === "play" && !prompt && me.hp < me.maxHp && (me.hand || []).length >= 2) {
    return `<div class="ability-panel"><p>시드 케첨</p><button type="button" class="bar-btn" data-action="sid-mode">${ui.sidMode ? "회복 취소" : "카드 2장 버리고 생명 1 회복"}</button></div>`;
  }
  if (prompt?.kind === "store" && prompt.mine) {
    const cards = (view.store?.cards || []).map((card) => cardArt(card, `data-store-card="1"`)).join("");
    return `<div class="ability-panel" data-ability="store"><p>잡화점 · 가져갈 카드를 고르세요</p><div class="store-row">${cards}</div></div>`;
  }
  if (!prompt?.mine) return "";
  if (prompt.kind === "hand") {
    const backs = Array.from({ length: prompt.count }, (_, index) =>
      `<button type="button" class="card card-back choice-back" data-hand-back="${index}" aria-label="뒷면 카드"><span class="back-mark">BANG!</span></button>`).join("");
    const title = prompt.reason === "jesse" ? "가져갈 손패를 고르세요" : "손패에서 한 장을 고르세요";
    return `<div class="ability-panel" data-ability="hand"><p>${title}</p><div class="store-row">${backs}</div></div>`;
  }
  if (prompt.kind === "kit") {
    const cards = prompt.cards || [];
    return `<div class="ability-panel" data-ability="kit">
      <p>키트 칼슨 · 가져갈 두 장을 고르세요</p>
      <div class="store-row">${cards.map((card) => cardArt(card, `data-kit-card="${esc(card.id)}" ${ui.kitKeep.has(card.id) ? "data-kept=\"1\"" : ""}`)).join("")}</div>
      <button type="button" class="bar-btn" data-action="kit-keep" ${ui.kitKeep.size === 2 ? "" : "disabled"}>이 두 장 가지기</button>
    </div>`;
  }
  if (prompt.kind === "jesse") {
    const people = (prompt.options || []).map((id) => {
      const who = view.players.find((p) => p.id === id);
      return `<button type="button" class="bar-btn" data-draw="player" data-target="${esc(id)}">${esc(who?.nickname || "")}의 손패</button>`;
    }).join("");
    return `<div class="ability-panel" data-ability="jesse"><p>제시 존스 · 첫 카드를 어디서 뽑을까요</p><div class="store-row"><button type="button" class="bar-btn" data-draw="deck">덱에서</button>${people}</div></div>`;
  }
  if (prompt.kind === "pedro") {
    const top = prompt.top ? cardArt(prompt.top) : "";
    return `<div class="ability-panel" data-ability="pedro"><p>페드로 라미레즈 · 첫 카드</p><div class="store-row">${top}<button type="button" class="bar-btn" data-draw="discard">버린 카드</button><button type="button" class="bar-btn" data-draw="deck">덱에서</button></div></div>`;
  }
  if (prompt.kind === "lucky") {
    return `<div class="ability-panel" data-ability="lucky"><p>럭키 듀크 · 드로우!로 쓸 카드를 고르세요</p><div class="store-row">${(prompt.cards || []).map((card) => cardArt(card, `data-pick-card="1"`)).join("")}</div></div>`;
  }
  return "";
}

function promptCardsHtml(view) {
  const prompt = view.prompt;
  if (!prompt || !prompt.cards || prompt.kind === "kit" || prompt.kind === "lucky") return "";
  if (!prompt.mine && prompt.kind === "kit") return `<p class="prompt-note">키트 칼슨이 카드를 살펴보는 중</p>`;
  const label = prompt.kind === "kit" ? "덱 위에 되돌릴 카드" : "드로우! 결과로 쓸 카드";
  return `<div class="store">
    <p>${prompt.mine ? label : "드로우!"}</p>
    <div class="store-row">${prompt.cards.map((card) => cardArt(card, prompt.mine ? `data-pick-card="1"` : "")).join("")}</div>
  </div>`;
}

function pickerHtml(view) {
  if (!ui.picker) return "";
  const target = view.players.find((p) => p.id === ui.picker.targetId);
  const backs = ui.picker.takes.includes("hand")
    ? Array.from({ length: target?.handCount || 0 }, (_, index) => `<button type="button" class="card card-back choice-back" data-take="hand" data-hand-index="${index}" aria-label="뒷면 카드"><span class="back-mark">BANG!</span></button>`).join("")
    : "";
  const table = ui.picker.takes.filter((take) => take !== "hand").map((take) => {
    const card = Object.values(target?.equipment || {}).find((c) => c && c.id === take);
    if (!card) return "";
    return cardArt(card, `data-take="${esc(take)}"`);
  }).join("");
  return `<div class="modal"><div class="modal-card steal-picker">
    <h2>${esc(target?.nickname || "")} 님의 카드</h2>
    ${backs ? `<p class="steal-label">손패</p><div class="take-row">${backs}</div>` : ""}
    ${table ? `<p class="steal-label">앞에 놓인 카드</p><div class="take-row">${table}</div>` : ""}
    <button type="button" class="text-btn" data-action="cancel-pick">취소</button>
  </div></div>`;
}

function endHtml(view) {
  const titles = { sheriff: "보안관 팀의 승리", outlaw: "무법자의 승리", renegade: "배신자의 승리" };
  const host = view.yourId === view.hostId;
  return `<div class="victory">
    <h2>${esc(titles[view.winner?.team] || "게임 끝")}</h2>
    <ul>${view.players.map((p) => `<li>${esc(p.nickname)} · ${esc(ROLES[p.role]?.ko || "")}${p.character ? ` · ${esc(characterById(p.character).name)}` : ""}</li>`).join("")}</ul>
    ${host ? `<button class="enter-btn" type="button" data-action="again">한 판 더</button>` : `<p>방장이 같은 멤버로 다시 시작할 수 있습니다.</p>`}
  </div>`;
}

function hostPassHtml() {
  if (!ui.hostAsk) return "";
  const labels = { pause: "일시정지", resume: "재개", fresh: "종료", start: "게임 시작" };
  return `<form class="host-pass" data-host-pass="1">
    <p>${esc(labels[ui.hostAsk] || "확인")} · 방장 암호</p>
    <input data-field="host-pass" type="password" maxlength="24" autocomplete="current-password" />
    <button class="enter-btn" type="submit">확인</button>
    <button class="text-btn" type="button" data-action="host-cancel">취소</button>
  </form>`;
}

function phaseLine(view, current) {
  if (view.phase === "end") return "모든 역할이 공개되었습니다.";
  const name = current?.nickname || "";
  const prompt = view.prompt;
  if (prompt && !prompt.mine) {
    const who = view.players.find((p) => p.id === prompt.playerId);
    return `${who?.nickname || ""} 님이 응답하는 중`;
  }
  if (prompt?.mine) {
    if (prompt.kind === "miss") return `빗나감! ${prompt.got || 0}/${prompt.need} · 막을지 맞을지 고르세요`;
    if (prompt.kind === "discard-bang") return prompt.reason === "duel" ? "결투: 뱅!을 내거나 맞으세요" : "인디언: 뱅!을 내거나 맞으세요";
    if (prompt.kind === "save") return "치명상입니다. 맥주로 버티거나 쓰러지세요";
    if (prompt.kind === "discard") return `손패가 생명보다 많습니다. ${prompt.count}장 버리세요`;
    if (prompt.kind === "store") return "잡화점에서 카드를 고르세요";
    if (prompt.kind === "jesse") return "첫 카드를 어디서 가져올까요?";
    if (prompt.kind === "pedro") return "버린 카드 더미를 가져올까요?";
    if (prompt.kind === "kit") return "키트 칼슨 · 가져갈 두 장을 고르세요";
    if (prompt.kind === "lucky") return "두 장 중 드로우! 결과를 고르세요";
  }
  if (prompt?.mine && prompt.kind === "kit") return "키트 칼슨 · 가져갈 두 장을 고르세요";
  if (view.currentId === view.yourId && view.turnPhase === "draw" && !prompt) return "덱을 눌러 카드를 뽑으세요";
  if (view.currentId === view.yourId && view.turnPhase === "play") return "당신의 턴 · 카드를 내거나 턴을 종료하세요";
  if (current) return `${name} 님의 턴`;
  return "게임 진행 중";
}

function toastHtml(ctx) {
  if (!ctx.toast) return "";
  return `<p class="toast" role="status">${esc(ctx.toast)}</p>`;
}

function helpHtml() {
  return `<dialog class="help" id="help">
    <h2>도움말</h2>
    <p>보안관은 무법자와 배신자를 모두 쓰러뜨리면 이깁니다. 부관은 보안관과 함께 이깁니다. 무법자는 보안관이 쓰러지면 이깁니다. 배신자는 마지막 한 명으로 남아야 이깁니다.</p>
    <p>턴마다 카드 2장을 뽑고, 카드를 낸 뒤, 손패가 생명력보다 많으면 버립니다. 뱅!은 보통 턴에 한 장입니다. 카드를 길게 누르면 크게 봅니다.</p>
    <p>방장(처음 들어온 사람)의 화면이 판을 진행합니다. 새로고침하면 같은 자리로 돌아옵니다.</p>
    <button type="button" data-action="close-help">닫기</button>
  </dialog>`;
}

function onSubmit(event, app) {
  const ctx = app.__ctx;
  if (event.target.matches("[data-form=entry]")) {
    event.preventDefault();
    const nickname = app.querySelector("[data-field=nickname]").value.trim();
    const code = app.querySelector("[data-field=code]").value.trim();
    ctx.onEnter(nickname, code);
    return;
  }
  if (event.target.matches("[data-host-pass]")) {
    event.preventDefault();
    const pass = event.target.querySelector("[data-field=host-pass]")?.value || "";
    const type = ui.hostAsk;
    ui.hostAsk = null;
    if (!type) return;
    if (!pass) {
      ctx.onToast?.("암호를 입력하세요.");
      mount(app, ctx);
      return;
    }
    ctx.onAction({ type, pass });
    mount(app, ctx);
  }
}

function onClick(event, app) {
  const ctx = app.__ctx;
  const view = ctx.view;
  if (event.target.closest("[data-action=sound-toggle]")) {
    toggleSound();
    mount(app, ctx);
    return;
  }
  if (event.target.closest("[data-action=reset-view]")) {
    ui.gl?.resetView?.();
    closePeek();
    return;
  }
  if (event.target.closest("[data-action=help]")) app.querySelector("#help")?.showModal();
  if (event.target.closest("[data-action=close-help]")) app.querySelector("#help")?.close();
  if (event.target.closest("[data-action=takeover]")) ctx.onTakeOver();
  if (event.target.closest("[data-action=leave]")) ctx.onLeave();
  if (event.target.closest("[data-action=host-cancel]")) {
    ui.hostAsk = null;
    mount(app, ctx);
    return;
  }
  if (event.target.closest("[data-action=start]")) {
    const pass = app.querySelector("[data-field=host-pass]")?.value || "";
    if (!pass) {
      ctx.onToast?.("방장 암호를 정하세요.");
      return;
    }
    ctx.onAction({ type: "start", pass });
    return;
  }
  const hostAct = event.target.closest("[data-action=pause], [data-action=resume], [data-action=fresh]");
  if (hostAct) {
    ui.hostAsk = hostAct.dataset.action;
    mount(app, ctx);
    return;
  }
  if (event.target.closest("[data-action=again]")) ctx.onAction({ type: "again" });
  if (event.target.closest("[data-action=end]")) ctx.onAction({ type: "end" });
  if (event.target.closest("[data-action=draw]")) {
    ctx.onAction({ type: "draw" });
    return;
  }
  const panelCard = event.target.closest(".ability-panel .card, .steal-picker .card, .store .card");
  if (panelCard) {
    zoomPanelCard(panelCard, () => confirmPanelCard(ctx, view, panelCard));
    return;
  }
  if (event.target.closest("[data-action=kit-keep]") && view?.prompt?.kind === "kit" && ui.kitKeep.size === 2) {
    const back = (view.prompt.cards || []).find((card) => !ui.kitKeep.has(card.id));
    ui.kitKeep = new Set();
    if (back) ctx.onAction({ type: "respond", cardId: back.id });
    return;
  }
  if (event.target.closest("[data-char]")) {
    ctx.onAction({ type: "choose", characterId: event.target.closest("[data-char]").dataset.char });
    return;
  }
  if (event.target.closest("[data-self-role]") && !event.target.closest(".stack")) {
    ui.roleFlip = !ui.roleFlip;
    mount(app, ctx);
    return;
  }
  if (event.target.closest("[data-action=cancel-pick]")) {
    ui.picker = null;
    ui.selected = null;
    mount(app, ctx);
    return;
  }
  if (event.target.closest("[data-take], [data-store-card], [data-pick-card]")) return;
  if (event.target.closest("[data-draw]")) {
    const button = event.target.closest("[data-draw]");
    ctx.onAction({ type: "respond", mode: button.dataset.draw, targetId: button.dataset.target });
    return;
  }
  if (event.target.closest("[data-action=pass]")) {
    const kind = view?.prompt?.kind;
    ctx.onAction({ type: "respond", choice: kind === "save" ? "accept" : "take" });
    return;
  }
  if (event.target.closest("[data-action=discard]")) {
    const need = view?.prompt?.count || 0;
    if (ui.discard.size !== need) {
      ctx.onToast?.(`${need}장을 고른 다음 버리세요.`);
      return;
    }
    ctx.onAction({ type: "discard", cardIds: [...ui.discard] });
    ui.discard = new Set();
    return;
  }
  if (event.target.closest("[data-action=sid-mode]")) {
    ui.sidMode = !ui.sidMode;
    ui.sid = new Set();
    mount(app, ctx);
    return;
  }
  if (event.target.closest("[data-action=sid-go]")) {
    ctx.onAction({ type: "sid", cardIds: [...ui.sid] });
    ui.sidMode = false;
    ui.sid = new Set();
    return;
  }
  const gearStack = event.target.closest("[data-gear-stack]");
  if (gearStack) {
    ui.spread = { kind: "gear", playerId: gearStack.dataset.gearStack };
    ui.spreadPick = null;
    renderSpread(ctx);
    return;
  }
  const seatBtn = event.target.closest(".seat-btn");
  if (seatBtn) {
    const id = seatBtn.dataset.player;
    if (ui.selected && id) {
      if (isTarget(view, id)) playAt(ctx, ui.selected, id);
      else ctx.onToast?.("사정거리 밖입니다.");
      return;
    }
    if (id && id !== view?.yourId) {
      ui.spread = { kind: "seat", playerId: id };
      ui.spreadPick = null;
      renderSpread(ctx);
    }
    return;
  }
  const seat = event.target.closest("[data-player]");
  if (seat && ui.selected && isTarget(view, seat.dataset.player) && !event.target.closest("[data-hand-card]")) {
    playAt(ctx, ui.selected, seat.dataset.player);
    return;
  }
  const stack = event.target.closest(".stack");
  if (stack) {
    if (stack.dataset.hand) return;
    const stackId = stack.dataset.stackId || "";
    const playerId = stackId === "self" ? view?.yourId : (stackId.startsWith("seat-") ? stackId.slice(5) : "");
    if (playerId) {
      ui.spread = { kind: "seat", playerId };
      ui.spreadPick = null;
      renderSpread(ctx);
    }
  }
}

function playAt(ctx, cardId, targetId) {
  const info = ctx.view.handInfo?.find((h) => h.cardId === cardId);
  const target = info?.targets?.find((t) => t.id === targetId);
  if (!target) return;
  if (info.needsTake) {
    const takes = target.takes || [];
    if (takes.length <= 1) {
      ui.selected = null;
      ctx.onAction({ type: "play", cardId, targetId, take: takes[0] });
      return;
    }
    ui.picker = { cardId, targetId, takes };
    mount(document.querySelector("#app"), ctx);
    return;
  }
  ui.selected = null;
  globalThis.__bangLocalArc = null;
  closeFan();
  ctx.onAction({ type: "play", cardId, targetId });
}

function onHand(ctx, cardEl) {
  const view = ctx.view;
  const me = view.players.find((p) => p.id === view.yourId);
  const cardId = cardEl.dataset.cardId;
  const card = me?.hand?.find((c) => c.id === cardId);
  const prompt = view.prompt;
  if (prompt?.mine && prompt.kind === "discard") {
    if (ui.discard.has(cardId)) ui.discard.delete(cardId);
    else if (ui.discard.size < prompt.count) ui.discard.add(cardId);
    mount(document.querySelector("#app"), ctx);
    return;
  }
  if (ui.sidMode && card) {
    if (ui.sid.has(cardId)) ui.sid.delete(cardId);
    else if (ui.sid.size < 2) ui.sid.add(cardId);
    mount(document.querySelector("#app"), ctx);
    return;
  }
  if (prompt?.mine && card && responseKind(view, me, card)) {
    const choice = prompt.kind === "save" ? "beer" : "card";
    ctx.onAction({ type: "respond", choice, cardId });
    return;
  }
  if (prompt?.mine && prompt.kind === "save" && me?.character === "sid" && ui.sidMode) return;
  const info = view.handInfo?.find((h) => h.cardId === cardId);
  if (!info) {
    ctx.onToast?.("지금은 그 카드를 낼 수 없습니다.");
    return;
  }
  if (!info.ok) {
    ctx.onToast?.(info.reason || "지금은 그 카드를 낼 수 없습니다.");
    ui.selected = null;
    return;
  }
  if (!info.needsTarget) {
    ui.selected = null;
    ctx.onAction({ type: "play", cardId });
    return;
  }
  ui.selected = ui.selected === cardId ? null : cardId;
  ui.picker = null;
  mount(document.querySelector("#app"), ctx);
}

let spreadDrag = null;

function closeSpread() {
  ui.spread = null;
  ui.spreadPick = null;
  const layer = document.querySelector("#zoom-layer");
  if (!layer) return;
  layer.hidden = true;
  layer.innerHTML = "";
}

function wireSpread() {
  const layer = document.querySelector("#zoom-layer");
  layer.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".spread-scroller")) return;
    spreadDrag = { x: event.clientX, y: event.clientY, moved: false };
  });
  layer.addEventListener("pointermove", (event) => {
    if (!spreadDrag) return;
    if (Math.hypot(event.clientX - spreadDrag.x, event.clientY - spreadDrag.y) > 10) spreadDrag.moved = true;
  });
  layer.addEventListener("click", (event) => onSpreadClick(event, layer));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.spread) closeSpread();
  });
}

function onSpreadClick(event, layer) {
  const ctx = document.querySelector("#app")?.__ctx;
  if (!ctx) return;
  const moved = spreadDrag?.moved;
  spreadDrag = null;
  if (event.target === layer || event.target.closest("[data-spread-close]")) {
    closeSpread();
    return;
  }
  if (moved) return;
  const act = event.target.closest("[data-spread-act]");
  if (act) {
    runSpreadAction(ctx, act.dataset.spreadAct);
    return;
  }
  const card = event.target.closest(".spread-card");
  if (!card) return;
  ui.spreadPick = card.dataset.cardId || null;
  renderSpread(ctx);
}

function runSpreadAction(ctx, act, zoomCardId) {
  const cardId = zoomCardId || ui.spreadPick;
  const view = ctx.view;
  const me = view?.players?.find((p) => p.id === view.yourId);
  if (act === "play" && cardId) {
    ui.selected = null;
    closeSpread();
    closeFan();
    globalThis.__bangLocalArc = null;
    ctx.onAction({ type: "play", cardId });
    return;
  }
  if (act === "aim" && cardId) {
    ui.selected = cardId;
    ui.picker = null;
    closeSpread();
    closeFan();
    mount(document.querySelector("#app"), ctx);
    return;
  }
  if (act === "respond" && cardId) {
    const choice = view?.prompt?.kind === "save" ? "beer" : "card";
    closeSpread();
    closeFan();
    ctx.onAction({ type: "respond", choice, cardId });
    return;
  }
  if (act === "discard-toggle" && cardId) {
    if (ui.discard.has(cardId)) ui.discard.delete(cardId);
    else if (ui.discard.size < (view?.prompt?.count || 0)) ui.discard.add(cardId);
    renderSpread(ctx);
    return;
  }
  if (act === "discard-go") {
    ctx.onAction({ type: "discard", cardIds: [...ui.discard] });
    ui.discard = new Set();
    closeSpread();
    return;
  }
  if (act === "sid-toggle" && cardId) {
    if (ui.sid.has(cardId)) ui.sid.delete(cardId);
    else if (ui.sid.size < 2) ui.sid.add(cardId);
    renderSpread(ctx);
    return;
  }
  if (act === "sid-go") {
    ctx.onAction({ type: "sid", cardIds: [...ui.sid] });
    ui.sidMode = false;
    ui.sid = new Set();
    closeSpread();
  }
}

function spreadHandActions(ctx, cardId) {
  const view = ctx.view;
  const me = view.players.find((p) => p.id === view.yourId);
  const card = me?.hand?.find((c) => c.id === cardId);
  const prompt = view.prompt;
  if (!card) return "";
  if (prompt?.mine && prompt.kind === "discard") {
    const on = ui.discard.has(cardId);
    const ready = ui.discard.size === prompt.count;
    return `<button type="button" class="bar-btn" data-spread-act="discard-toggle">${on ? "선택 해제" : "버리기"}</button>
      <button type="button" class="bar-btn" data-spread-act="discard-go" ${ready ? "" : "disabled"}>버리기 (${ui.discard.size}/${prompt.count})</button>`;
  }
  if (ui.sidMode) {
    const on = ui.sid.has(cardId);
    return `<button type="button" class="bar-btn" data-spread-act="sid-toggle">${on ? "선택 해제" : "선택"}</button>
      <button type="button" class="bar-btn" data-spread-act="sid-go" ${ui.sid.size === 2 ? "" : "disabled"}>사용</button>`;
  }
  if (prompt?.mine && responseKind(view, me, card)) {
    return `<button type="button" class="bar-btn" data-spread-act="respond">사용</button>`;
  }
  const info = view.handInfo?.find((h) => h.cardId === cardId);
  if (!info) return `<p class="spread-note">지금은 그 카드를 낼 수 없습니다.</p>`;
  if (!info.ok) return `<p class="spread-note">${esc(info.reason || "지금은 그 카드를 낼 수 없습니다.")}</p>`;
  if (info.needsTarget) return `<button type="button" class="bar-btn choice-btn" data-spread-act="aim">내기</button>`;
  return `<button type="button" class="bar-btn choice-btn" data-spread-act="play">내기</button>`;
}

function spreadSeatHtml(p, view) {
  const cards = [];
  if (p.role && (p.id === view.yourId || p.role === "sheriff" || view.phase === "end")) {
    const role = ROLES[p.role];
    if (role) cards.push(`<button type="button" class="card" data-card-id="role-${esc(p.id)}"><img src="${role.image}" alt="${esc(role.ko)}" draggable="false" /></button>`);
  } else cards.push(backCard("역할", `data-card-id="role-${esc(p.id)}"`));
  const ch = characterById(p.character);
  if (ch) cards.push(`<button type="button" class="card" data-card-id="${esc(ch.id)}"><img src="${ch.image}" alt="${esc(ch.name)}" draggable="false" /></button>`);
  for (const piece of equipPieces(p)) if (piece) cards.push(piece);
  return cards.filter(Boolean);
}

function renderSpread(ctx) {
  const layer = document.querySelector("#zoom-layer");
  if (!layer) return;
  const view = ctx?.view;
  const oldScroller = layer.querySelector(".spread-scroller");
  const oldScrollLeft = oldScroller?.scrollLeft || 0;
  const oldKind = layer.querySelector(".spread-sheet")?.dataset.spreadKind;
  const opening = layer.hidden;
  if (!ui.spread || !view || (view.phase !== "play" && view.phase !== "end")) {
    if (ui.spread && view && view.phase !== "play" && view.phase !== "end") ui.spread = null;
    layer.hidden = true;
    layer.innerHTML = "";
    return;
  }
  let title = "카드";
  let cards = [];
  let actions = "";
  if (ui.spread.kind === "hand") {
    const me = view.players.find((p) => p.id === view.yourId);
    const hand = me?.hand || [];
    if (!hand.length) {
      ui.spread = null;
      layer.hidden = true;
      layer.innerHTML = "";
      return;
    }
    if (ui.spreadPick && !hand.some((c) => c.id === ui.spreadPick)) ui.spreadPick = null;
    title = "손패";
    cards = hand.map((card) => cardArt(card, `data-spread-card="1"`));
    if (ui.spreadPick) actions = spreadHandActions(ctx, ui.spreadPick);
  } else if (ui.spread.kind === "gear") {
    const p = view.players.find((pl) => pl.id === ui.spread.playerId);
    const gear = p ? equipPieces(p) : [];
    if (!p || !gear.length) {
      ui.spread = null;
      layer.hidden = true;
      layer.innerHTML = "";
      return;
    }
    title = `${p.nickname} 앞에 놓은 카드`;
    cards = gear;
  } else {
    const p = view.players.find((pl) => pl.id === ui.spread.playerId);
    if (!p) {
      ui.spread = null;
      layer.hidden = true;
      layer.innerHTML = "";
      return;
    }
    title = p.nickname;
    cards = spreadSeatHtml(p, view);
  }
  const picked = ui.spreadPick;
  layer.hidden = false;
  layer.innerHTML = `<div class="spread-sheet ${opening ? "" : "no-intro"}" data-spread-kind="${esc(ui.spread.kind)}">
    <div class="spread-top">
      <p>${esc(title)}</p>
      <button type="button" class="text-btn" data-spread-close>닫기</button>
    </div>
    <div class="spread-scroller">
      ${cards.map((html) => {
        const id = html.match(/data-card-id="([^"]+)"/)?.[1] || "";
        const on = picked && id === picked;
        return `<div class="spread-card${on ? " is-current" : ""}" style="--spread-i:${cards.indexOf(html)}" data-card-id="${esc(id)}">${html}</div>`;
      }).join("")}
    </div>
    <div class="spread-actions">${actions}</div>
  </div>`;
  const scroller = layer.querySelector(".spread-scroller");
  if (scroller && !opening && oldKind === ui.spread.kind) scroller.scrollLeft = oldScrollLeft;
}

function syncTable(app, view) {
  const board = app.querySelector(".board");
  const felt = board?.querySelector(".felt");
  if (!board || !felt || !view || (view.phase !== "play" && view.phase !== "end")) return;
  let canvas = document.querySelector("#table-gl");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "table-gl";
    document.body.prepend(canvas);
    canvas.addEventListener("pointerdown", (event) => {
      const ctx = app.__ctx;
      if (!ui.gl?.pick || !ctx?.view || !ui.selected) return;
      const hit = ui.gl.pick(event.clientX, event.clientY);
      const id = hit?.playerId || "";
      if (!id) return;
      if (isTarget(ctx.view, id)) playAt(ctx, ui.selected, id);
      else ctx.onToast?.("사정거리 밖입니다.");
    });
  }
  if (ui.gl !== false && (!ui.gl || ui.glCanvas !== canvas)) {
    ui.gl?.stop?.();
    const mounted = mountTable(canvas);
    if (mounted?.update) {
      ui.gl = mounted;
      ui.glCanvas = canvas;
      if (app.dataset.renderer !== "webgl") console.info("[bang] renderer", "webgl");
      app.dataset.renderer = "webgl";
      ui.gl.setPeek?.(showPeek);
      ui.gl.setZoom?.((info) => {
        const ctx = app.__ctx;
        const view = ctx?.view;
        if (ui.selected && info?.kind === "character" && info.playerId) {
          const cardInfo = view?.handInfo?.find((item) => item.cardId === ui.selected);
          const allowed = cardInfo?.targets?.some((target) => target.id === info.playerId);
          if (allowed) playAt(ctx, ui.selected, info.playerId);
          else {
            const blocked = cardInfo?.blocked?.find((target) => target.id === info.playerId);
            ctx.onToast?.(blocked?.reason || "그 대상에게는 낼 수 없습니다.");
          }
          return;
        }
        if (info?.kind === "deck" && view && view.currentId === view.yourId && view.turnPhase === "draw" && !view.prompt) {
          ctx.onAction({ type: "draw" });
          return;
        }
        if (info?.kind === "hand" && info.secret) {
          openCardZoom(info.image, info.box, { backs: info.handCount || 1, caption: `${info.handCount || 0}장` });
          return;
        }
        if (info?.kind === "hand" && info.handId) {
          openCardZoom(info.image, info.box, { handId: info.handId, suit: info.suit, rank: info.rank });
          return;
        }
        if (info?.image && info.box) openCardZoom(info.image, info.box, info);
      });
      ui.gl.setGear?.((info) => {
        if (!info?.playerId) return;
        ui.spread = { kind: "gear", playerId: info.playerId };
        ui.spreadPick = null;
        renderSpread(app.__ctx);
      });
    } else {
      ui.gl = false;
      ui.glCanvas = null;
      if (app.dataset.renderer !== "2d") console.info("[bang] renderer", "2d", mounted?.error || "webgl unavailable");
      app.dataset.renderer = "2d";
    }
  }
  const webgl = Boolean(ui.gl && ui.gl.update);
  board.classList.toggle("is-webgl", webgl);
  board.classList.toggle("is-flat3d", !webgl);
  board.classList.toggle("is-aiming", Boolean(ui.selected));
  ui.latestView = view;
  if (webgl) {
    ui.gl.setSpots?.((spots) => {
      const live = app.querySelector(".felt");
      if (live && ui.latestView) placeFelt(live, ui.latestView, spots, true);
    });
    const legal = ui.selected ? view.players.filter((p) => isTarget(view, p.id)).map((p) => p.id) : [];
    ui.gl.update(view, legal, Boolean(ui.selected));
  } else placeFelt(felt, view, null, false);
}

function stableSpot(id, x, y) {
  if (!ui.labelHold) ui.labelHold = new Map();
  const prev = ui.labelHold.get(id);
  if (!prev) {
    const spot = { x, y, pendingX: x, pendingY: y, pendingN: 0 };
    ui.labelHold.set(id, spot);
    return spot;
  }
  const jump = Math.hypot(x - prev.x, y - prev.y);
  if (jump < 4) {
    prev.pendingN = 0;
    return prev;
  }
  if (Math.hypot(x - prev.pendingX, y - prev.pendingY) < 4) prev.pendingN += 1;
  else {
    prev.pendingX = x;
    prev.pendingY = y;
    prev.pendingN = 1;
  }
  if (prev.pendingN >= 5 || jump > 120) {
    prev.x = x;
    prev.y = y;
    prev.pendingN = 0;
  }
  return prev;
}

function placeFelt(felt, view, projected, webgl) {
  const living = view.players.filter((p) => p.alive !== false);
  const me = living.find((p) => p.id === view.yourId);
  const ordered = me ? [me, ...living.filter((p) => p.id !== me.id)] : living;
  const layout = webgl ? null : solveProjectedLayout(window.innerWidth, window.innerHeight, ordered.length);
  ordered.forEach((player, index) => {
    const node = felt.querySelector(player.id === view.yourId ? ".self-tray" : `.seat[data-player="${player.id}"]`);
    if (!node) return;
    const raw = webgl && projected ? projected.find((item) => item.id === player.id) : layout.seats[index];
    if (!raw) return;
    const spot = webgl ? stableSpot(player.id, raw.x, raw.y) : raw;
    node.style.left = `${spot.x}px`;
    node.style.top = `${spot.y}px`;
    node.style.width = `${raw.w}px`;
    node.style.height = "auto";
    node.style.transform = "none";
  });
  const piles = felt.querySelector(".center-piles");
  if (piles && layout?.deck && !webgl) {
    piles.style.left = `${layout.deck.x}px`;
    piles.style.top = `${layout.deck.y}px`;
    piles.style.width = `${layout.discard.x + layout.discard.w - layout.deck.x}px`;
    piles.style.transform = "none";
  }
}

let zoomToken = 0;

function zoomPanelCard(card, confirm) {
  const from = card.getBoundingClientRect();
  const face = card.querySelector("img");
  if (!face || card.classList.contains("card-back")) {
    openCardZoom("", from, { backs: 1, confirm });
    return;
  }
  openCardZoom(face.getAttribute("src"), from, { suit: card.dataset.suit, rank: card.dataset.rank, confirm });
}

function confirmPanelCard(ctx, view, card) {
  if (card.dataset.handBack != null && view?.prompt?.kind === "hand") {
    ctx.onAction({ type: "respond", index: Number(card.dataset.handBack) });
    return;
  }
  if (card.dataset.kitCard && view?.prompt?.kind === "kit") {
    const id = card.dataset.kitCard;
    if (ui.kitKeep.has(id)) ui.kitKeep.delete(id);
    else if (ui.kitKeep.size < 2) ui.kitKeep.add(id);
    mount(document.querySelector("#app"), ctx);
    return;
  }
  if (card.dataset.take != null && ui.picker) {
    const pick = ui.picker;
    const index = card.dataset.handIndex;
    ui.picker = null;
    ui.selected = null;
    ctx.onAction({ type: "play", cardId: pick.cardId, targetId: pick.targetId, take: card.dataset.take, index: index == null ? undefined : Number(index) });
    return;
  }
  if (card.hasAttribute("data-store-card") || card.hasAttribute("data-pick-card")) {
    ctx.onAction({ type: "respond", cardId: card.dataset.cardId });
  }
}

function openCardZoom(src, from, extra = {}) {
  if (!from || (!src && !extra.backs)) return;
  const token = ++zoomToken;
  const show = (url) => {
    if (token === zoomToken) paintCardZoom(url, from, extra);
  };
  if (extra.suit && extra.rank) {
    stampURL(src, extra.suit, extra.rank).then(show);
    return;
  }
  show(src);
}

function paintCardZoom(src, from, extra) {
  let layer = document.querySelector("#card-zoom");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "card-zoom";
    layer.hidden = true;
    document.body.appendChild(layer);
    layer.addEventListener("click", (event) => {
      if (event.target.closest("[data-zoom-act]")) return;
      closeCardZoom();
    });
  }
  const ctx = document.querySelector("#app")?.__ctx;
  const handId = extra.handId || "";
  const actions = handId && ctx ? spreadHandActions(ctx, handId) : "";
  const choose = extra.confirm ? `<button type="button" class="bar-btn choice-btn" data-zoom-act="choose">선택</button>` : "";
  const backs = extra.backs ? Array.from({ length: Math.max(1, extra.backs) }, () => `<span class="zoom-back">BANG!</span>`).join("") : "";
  layer.hidden = false;
  layer.innerHTML = `${backs ? `<div class="zoom-backs" style="left:${from.left}px;top:${from.top}px">${backs}<p>${esc(extra.caption || "")}</p></div>` : `<img class="zoom-fly" alt="" src="${esc(src)}" style="left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px" />`}<div class="zoom-actions">${choose}${actions ? actions.replaceAll("data-spread-act", "data-zoom-act") : ""}</div>`;
  const wire = () => {
    layer.querySelectorAll("[data-zoom-act]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const act = button.dataset.zoomAct;
        const confirm = extra.confirm;
        const cardId = extra.handId || "";
        closeCardZoom();
        if (act === "choose") confirm?.();
        else if (ctx) runSpreadAction(ctx, act, cardId);
      });
    });
  };
  if (backs) {
    const fan = layer.querySelector(".zoom-backs");
    requestAnimationFrame(() => fan?.classList.add("is-open"));
    wire();
    return;
  }
  const img = layer.querySelector(".zoom-fly");
  img.dataset.from = JSON.stringify({ left: from.left, top: from.top, width: from.width, height: from.height });
  requestAnimationFrame(() => img.classList.add("is-open"));
  wire();
}

function closeCardZoom() {
  zoomToken += 1;
  const layer = document.querySelector("#card-zoom");
  const img = layer?.querySelector(".zoom-fly, .zoom-backs");
  if (!img) {
    if (layer) {
      layer.hidden = true;
      layer.innerHTML = "";
    }
    return;
  }
  const from = JSON.parse(img.dataset.from || "{}");
  img.classList.remove("is-open");
  img.style.left = `${from.left || 0}px`;
  img.style.top = `${from.top || 0}px`;
  img.style.width = `${from.width || 80}px`;
  img.style.height = `${from.height || 112}px`;
  setTimeout(() => {
    if (layer) {
      layer.hidden = true;
      layer.innerHTML = "";
    }
  }, 380);
}

function flyDrawCards(cards) {
  const hand = document.querySelector(".stack.hand")?.getBoundingClientRect();
  cards.forEach((card, index) => {
    const info = CARD_INFO[card.type];
    if (!info) return;
    const img = document.createElement("img");
    img.className = "draw-fly";
    img.alt = "";
    img.src = info.image;
    img.style.left = `${window.innerWidth / 2 - 36}px`;
    img.style.top = `${window.innerHeight * 0.42}px`;
    document.body.appendChild(img);
    const to = hand || { left: window.innerWidth / 2, top: window.innerHeight - 120 };
    setTimeout(() => {
      img.style.left = `${to.left + index * 18}px`;
      img.style.top = `${to.top}px`;
      img.style.opacity = "0.2";
    }, 30);
    setTimeout(() => img.remove(), 700);
  });
}

function showAbilityCue(text) {
  let node = document.querySelector("#ability-cue");
  if (!node) {
    node = document.createElement("div");
    node.id = "ability-cue";
    document.body.appendChild(node);
  }
  node.textContent = text;
  node.hidden = false;
  clearTimeout(ui.cueTimer);
  ui.cueTimer = setTimeout(() => { node.hidden = true; }, 1700);
}

function wireFan() {
  const app = document.querySelector("#app");
  app.addEventListener("pointerdown", (event) => {
    const card = event.target.closest(".stack.hand [data-card-id]");
    if (!card || event.button > 0) return;
    ui.handTap = { id: event.pointerId, x: event.clientX, y: event.clientY, card };
  });
  app.addEventListener("pointerup", (event) => {
    const tap = ui.handTap;
    if (!tap || tap.id !== event.pointerId) return;
    ui.handTap = null;
    const dx = event.clientX - tap.x;
    const dy = event.clientY - tap.y;
    if (dy < -42 && Math.abs(dy) > Math.abs(dx)) {
      const ctx = app.__ctx;
      const info = ctx?.view?.handInfo?.find((item) => item.cardId === tap.card.dataset.cardId);
      if (info?.ok && info.needsTarget) {
        ui.selected = tap.card.dataset.cardId;
        mount(app, ctx);
      } else if (info?.ok) ctx.onAction({ type: "play", cardId: tap.card.dataset.cardId });
      return;
    }
    if (Math.hypot(dx, dy) > 14) return;
    const img = tap.card.querySelector("img");
    if (!img) return;
    openCardZoom(img.getAttribute("src"), tap.card.getBoundingClientRect(), {
      handId: tap.card.dataset.cardId,
      suit: tap.card.dataset.suit,
      rank: tap.card.dataset.rank,
    });
  });
  window.addEventListener("pointermove", (event) => {
    const fan = ui.fan;
    if (!fan) return;
    const limit = Math.max(0, fan.cards.length - 1);
    if (fan.holding && event.pointerId === fan.id) {
      fan.target = Math.max(-limit, Math.min(0, fan.drag + (fan.originX - event.clientX) / 46));
      fan.lastY = event.clientY;
      fanFrame();
      return;
    }
    if (fan.panning && event.pointerId === fan.panId) {
      fan.target = Math.max(-limit, Math.min(0, fan.panBase + (fan.panX - event.clientX) / 46));
    }
  });
  window.addEventListener("pointerup", finishFan);
  window.addEventListener("pointercancel", finishFan);
}

function ensureFan() {
  let layer = document.querySelector("#hand-fan");
  if (layer) return layer;
  layer = document.createElement("div");
  layer.id = "hand-fan";
  layer.hidden = true;
  document.body.appendChild(layer);
  layer.addEventListener("pointerdown", (event) => {
    if (!ui.fan || event.target.closest(".fan-actions, [data-spread-act]")) return;
    const card = event.target.closest(".fan-card");
    if (card) {
      const index = ui.fan.cards.findIndex((item) => item.id === card.dataset.cardId);
      if (index >= 0) {
        ui.fan.target = -index;
        ui.fan.drag = -index;
        ui.fan.focus = index;
        fanFrame();
      }
    }
    ui.fan.panning = true;
    ui.fan.panId = event.pointerId;
    ui.fan.panX = event.clientX;
    ui.fan.panBase = ui.fan.target;
  });
  layer.addEventListener("click", (event) => {
    if (event.target.id === "hand-fan" || event.target.classList.contains("fan-stage")) closeFan();
    const act = event.target.closest("[data-spread-act]");
    const ctx = document.querySelector("#app")?.__ctx;
    if (act && ctx) runSpreadAction(ctx, act.dataset.spreadAct);
  });
  window.addEventListener("keydown", (event) => {
    if (!ui.fan || ui.fan.holding) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const limit = ui.fan.cards.length - 1;
    const next = Math.max(0, Math.min(limit, ui.fan.focus + (event.key === "ArrowRight" ? 1 : -1)));
    ui.fan.target = -next;
    ui.fan.drag = -next;
    ui.fan.focus = next;
    fanFrame();
  });
  return layer;
}

function fanBounds() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const margin = 12;
  return {
    left: margin,
    right: width - margin,
    top: Math.round(height * 0.46),
    bottom: height - margin,
    cx: width / 2,
  };
}

function fanFrame() {
  const fan = ui.fan;
  const layer = ensureFan();
  if (!fan) return;
  const limit = Math.max(0, fan.cards.length - 1);
  fan.target = Math.max(-limit, Math.min(0, fan.target));
  fan.drag += (fan.target - fan.drag) * 0.3;
  const focus = Math.max(0, Math.min(limit, Math.round(-fan.drag)));
  fan.focus = focus;
  ui.spreadPick = fan.cards[focus]?.id || null;
  const box = fanBounds();
  const boxW = box.right - box.left;
  const cardW = Math.max(78, Math.min(148, (boxW - 24) / Math.max(3, Math.min(fan.cards.length, 6))));
  const spacing = Math.min(cardW * 0.62, (boxW - cardW) / Math.max(fan.cards.length, 1));
  const ctx = document.querySelector("#app")?.__ctx;
  layer.hidden = false;
  layer.innerHTML = `<div class="fan-stage">${fan.cards.map((card, index) => {
    const rel = index + fan.drag;
    const centered = index === focus;
    const scale = centered ? 1.08 : 0.82;
    const cardH = cardW * 1.48 * scale;
    let x = box.cx + rel * spacing;
    let y = box.bottom - cardH - (centered ? 28 : 8);
    const half = (cardW * scale) / 2;
    x = Math.max(box.left + half, Math.min(box.right - half, x));
    y = Math.max(box.top, Math.min(box.bottom - cardH, y));
    return `<button type="button" class="fan-card${centered ? " is-focus" : ""}" data-card-id="${esc(card.id)}" style="left:${x}px;top:${y}px;width:${cardW}px;transform:translate(-50%,0) scale(${scale})">${cardArt(card).replace(/^<button/, "<span").replace(/<\/button>$/, "</span>")}</button>`;
  }).join("")}${fan.holding || !ctx ? "" : `<div class="fan-actions">${spreadHandActions(ctx, ui.spreadPick)}</div>`}</div>`;
  if (fan.holding || Math.abs(fan.target - fan.drag) > 0.03) requestAnimationFrame(fanFrame);
}

function finishFan(event) {
  const fan = ui.fan;
  if (!fan?.holding || event.pointerId !== fan.id) return;
  const rise = fan.originY - event.clientY;
  const drop = event.clientY - fan.originY;
  const card = fan.cards[fan.focus];
  fan.holding = false;
  fan.panning = false;
  const ctx = document.querySelector("#app")?.__ctx;
  const prompt = ctx?.view?.prompt;
  if (prompt?.mine && prompt.kind === "discard" && card && drop > 54) {
    if (!ui.discard.has(card.id) && ui.discard.size < prompt.count) ui.discard.add(card.id);
    closeFan();
    if (ui.discard.size === prompt.count) {
      ctx.onAction({ type: "discard", cardIds: [...ui.discard] });
      ui.discard = new Set();
    } else paint(document.querySelector("#app"), ctx);
    return;
  }
  if (rise > 76 && card && ctx) {
    ui.spreadPick = card.id;
    const act = spreadHandActions(ctx, card.id).match(/data-spread-act="([^"]+)"/);
    closeFan();
    if (act) runSpreadAction(ctx, act[1]);
    return;
  }
  if (drop > 64) {
    closeFan();
    return;
  }
  if (prompt?.mine && prompt.kind === "discard" && card && Math.abs(event.clientX - fan.originX) < 18) {
    if (ui.discard.has(card.id)) ui.discard.delete(card.id);
    else if (ui.discard.size < prompt.count) ui.discard.add(card.id);
    closeFan();
    paint(document.querySelector("#app"), ctx);
    return;
  }
  fanFrame();
}

const seenReveal = new Set();
let revealReady = false;
const revealQueue = [];
let revealBusy = false;

function syncReveal(view) {
  if (!view) return;
  if (!revealReady) {
    revealReady = true;
    if (view.phase === "play" || view.phase === "end") {
      for (const ev of view.events || []) seenReveal.add(ev.id);
      return;
    }
  }
  for (const ev of view.events || []) {
    if (!ev?.id || seenReveal.has(ev.id)) continue;
    seenReveal.add(ev.id);
    revealQueue.push(ev);
  }
  drainReveal();
}

function showPeek(info) {
  let layer = document.querySelector("#card-peek");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "card-peek";
    document.body.appendChild(layer);
    layer.addEventListener("click", () => closePeek());
  }
  layer.hidden = false;
  layer.innerHTML = `<button type="button" class="peek-card"><img src="${esc(info.image)}" alt="카드" /></button>`;
}

function closePeek() {
  const layer = document.querySelector("#card-peek");
  if (!layer) return;
  layer.hidden = true;
  layer.innerHTML = "";
}

function ensureReveal() {
  let layer = document.querySelector("#reveal-layer");
  if (layer) return layer;
  layer = document.createElement("div");
  layer.id = "reveal-layer";
  layer.hidden = true;
  document.body.appendChild(layer);
  return layer;
}

function revealDestination(ev) {
  if (ev.to === "hand" && ev.ownerId) {
    const node = document.querySelector(`[data-player="${CSS.escape(ev.ownerId)}"]`);
    if (node) return node.getBoundingClientRect();
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (ev.to === "deck") return { left: w / 2 - 90, top: h / 2 - 30, width: 64, height: 90 };
  if (ev.to === "discard") return { left: w / 2 + 24, top: h / 2 - 30, width: 64, height: 90 };
  return null;
}

function drainReveal() {
  if (revealBusy || !revealQueue.length) return;
  revealBusy = true;
  const ev = revealQueue.shift();
  const layer = ensureReveal();
  const cards = ev.cards || [];
  layer.hidden = false;
  document.body.dataset.reveals = `${document.body.dataset.reveals || ""}|${ev.caption || ""}`.slice(-900);
  layer.innerHTML = `<div class="reveal-stage">
    <div class="reveal-row">${cards.map((card) => `<div class="reveal-flip"><div class="reveal-inner">${cardArt(card)}</div></div>`).join("")}</div>
    <p class="reveal-caption">${esc(ev.caption || "")}</p>
  </div>`;
  requestAnimationFrame(() => layer.querySelectorAll(".reveal-flip").forEach((node) => node.classList.add("is-up")));
  const hold = ev.to === "hold" ? 1800 : 1600;
  window.setTimeout(() => {
    const dest = revealDestination(ev);
    const row = layer.querySelector(".reveal-row");
    if (dest && row) {
      const from = row.getBoundingClientRect();
      const dx = dest.left + dest.width / 2 - (from.left + from.width / 2);
      const dy = dest.top + dest.height / 2 - (from.top + from.height / 2);
      row.style.transform = `translate(${dx}px, ${dy}px) scale(0.28)`;
    } else if (row) row.style.opacity = "0";
    window.setTimeout(() => {
      layer.hidden = true;
      layer.innerHTML = "";
      revealBusy = false;
      drainReveal();
    }, ev.to === "hold" ? 240 : 480);
  }, hold);
}

function closeFan() {
  ui.fan = null;
  const layer = document.querySelector("#hand-fan");
  if (layer) {
    layer.hidden = true;
    layer.innerHTML = "";
  }
}

