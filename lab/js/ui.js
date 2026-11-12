import { CARD_INFO, CHARACTERS, ROLES, SUITS, characterById } from "./cards.js";

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
  heldStack: null,
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function cardArt(card, attrs = "") {
  const info = CARD_INFO[card.type];
  const suit = SUITS[card.suit];
  return `<button type="button" class="card" data-card-id="${esc(card.id)}" data-type="${esc(card.type)}" ${attrs}>
    <img src="${info.image}" alt="${esc(info.ko)}" draggable="false" />
    <span class="pip ${suit.red ? "red" : ""}">${suit.symbol}${esc(card.rank)}</span>
  </button>`;
}

function backCard(label, attrs = "") {
  return `<button type="button" class="card card-back" ${attrs}><span class="back-mark">BANG!</span><small>${esc(label)}</small></button>`;
}

export function mount(app, ctx) {
  const log = app.querySelector("#log");
  const stick = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 28;
  const input = app.querySelector("#chat-input");
  if (input) ui.chat = input.value;
  app.innerHTML = screenHtml(ctx);
  const nextLog = app.querySelector("#log");
  if (nextLog && stick) nextLog.scrollTop = nextLog.scrollHeight;
  const nextInput = app.querySelector("#chat-input");
  if (nextInput) {
    nextInput.value = ui.chat;
    if (input && document.activeElement === input) nextInput.focus();
  }
  const view = ctx.view;
  app.dataset.screen = view?.phase || (ctx.status?.mode === "entry" ? "entry" : "wait");
  app.dataset.phase = view?.phase || "";
  app.dataset.prompt = view?.prompt?.mine ? view.prompt.kind : "";
  app.dataset.yourTurn = view && view.currentId === view.yourId && view.turnPhase === "play" && !view.prompt ? "1" : "0";
  app.dataset.winner = view?.winner?.team || "";
  app.dataset.host = view && view.yourId === view.hostId ? "1" : "0";
  if (!ui.wired) {
    ui.wired = true;
    app.addEventListener("click", (event) => onClick(event, app));
    app.addEventListener("submit", (event) => onSubmit(event, app));
    wireZoom();
  }
  app.__ctx = ctx;
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
      <p class="tagline">서부 살롱 · 베이스 게임 · 최대 7명</p>
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
      <p class="tagline">${esc(ctx.status?.text || "살롱을 찾는 중…")}</p>
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
  const ready = count >= 4;
  return `<main class="salon">
    <header class="topbar">
      <div class="brand-mini">BANG!</div>
      <p>${esc(ctx.status?.text || "")}</p>
      <button type="button" data-action="help">도움말</button>
    </header>
    <section class="lobby">
      <h1>살롱</h1>
      <p class="muted">${count}/7명 · 4명이 모이면 시작할 수 있습니다.</p>
      <ol class="roster">
        ${view.players.map((p) => `<li data-player="${esc(p.id)}">
          <span>${esc(p.nickname)}</span>
          ${p.isHost ? `<em>방장</em>` : ""}
          ${p.id === view.yourId ? `<em>나</em>` : ""}
          ${p.connected ? "" : `<em class="off">끊김</em>`}
        </li>`).join("")}
      </ol>
      ${host
        ? `<button class="enter-btn" type="button" data-action="start" ${ready ? "" : "disabled"}>${ready ? "게임 시작" : `${count}명 · 4명부터`}</button>`
        : `<p class="footnote">${esc(me?.nickname || "")} 님, 방장이 시작하기를 기다리는 중입니다.</p>`}
      <button class="text-btn" type="button" data-action="leave">나가기</button>
    </section>
    ${dockHtml(ctx)}
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
      <button type="button" data-action="help">도움말</button>
    </header>
    <section class="choose">
      ${me?.role ? `<div class="my-role">
        <img src="${ROLES[me.role].image}" alt="${esc(ROLES[me.role].ko)}" />
        <div><strong>${esc(ROLES[me.role].ko)}</strong><p>${esc(ROLES[me.role].goal)}</p></div>
      </div>` : ""}
      ${me?.character ? `<p class="chosen-note">${esc(characterById(me.character).name)}(으)로 앉았습니다. 다른 사람을 기다리는 중.</p>` : `
        <div class="choice-row">
          ${choices.map((ch) => `<button type="button" class="choice" data-char="${esc(ch.id)}">
            <span class="card"><img src="${ch.image}" alt="${esc(ch.name)}" draggable="false" /></span>
            <strong>${esc(ch.name)}</strong>
            <em>생명 ${ch.hp}${me?.role === "sheriff" ? " + 1" : ""}</em>
            <p>${esc(ch.ability)}</p>
          </button>`).join("")}
        </div>`}
      <ul class="roster compact">
        ${view.players.map((p) => `<li>
          <span>${esc(p.nickname)}${p.role === "sheriff" ? " · 보안관" : ""}</span>
          <em>${p.character ? esc(characterById(p.character).name) : "고르는 중"}</em>
        </li>`).join("")}
      </ul>
    </section>
    ${dockHtml(ctx)}
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
        <button type="button" data-action="help">도움말</button>
      </header>
      <div class="board">
      ${aroundHtml(ring.filter((p) => p.id !== view.yourId), view)}
      <div class="center-piles">
        ${view.deckCount ? backCard(String(view.deckCount), `data-card-id="deck" aria-label="덱 ${view.deckCount}장"`) : ""}
        ${view.discardTop ? cardArt(view.discardTop, `data-discard-top="1"`) : ""}
        ${storeHtml(view)}
        ${promptCardsHtml(view)}
      </div>
      <div class="mine">
        ${deadHtml(view)}
        ${me?.alive ? selfTray(me, view) : ""}
        ${me?.alive && view.phase === "play" ? handHtml(view, me) : ""}
        ${actionBar(view, me)}
      </div>
      ${ended ? endHtml(view) : ""}
      </div>
    </section>
    ${dockHtml(ctx)}
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
    ...equipPieces(p),
  ];
}

function seatHtml(p, view) {
  const selected = ui.picker?.targetId === p.id || isTarget(view, p.id);
  return `<article class="seat ${selected ? "is-target" : ""}" data-player="${esc(p.id)}" ${selected ? `data-legal-target="1"` : ""}>
    ${stackHtml(`seat-${p.id}`, seatCards(p, view))}
    <p class="who">
      <strong>${esc(p.nickname)}</strong>
      ${p.distance ? `<span>거리 ${p.distance}</span>` : ""}
      ${p.connected ? "" : `<span class="off">끊김</span>`}
      <span class="bullets" aria-label="생명 ${p.hp}">${bullets(p.hp, p.maxHp)}</span>
      <span class="hand-count" title="손패" aria-label="손패 ${p.handCount}장">${p.handCount}</span>
    </p>
  </article>`;
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

function bullets(hp, max) {
  if (!max) return "";
  let html = "";
  for (let i = 0; i < max; i += 1) html += `<i class="${i < hp ? "on" : ""}"></i>`;
  return html;
}

function selfTray(p, view) {
  const selected = isTarget(view, p.id);
  return `<div class="self-tray ${selected ? "is-target" : ""}" ${selected ? `data-legal-target="1" data-player="${esc(p.id)}"` : ""}>
    ${stackHtml("self", seatCards(p, view))}
    <p class="who">
      <strong>${esc(p.nickname)}</strong>
      <span class="bullets" aria-label="생명 ${p.hp}">${bullets(p.hp, p.maxHp)}</span>
    </p>
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
    bits.push(`<button type="button" class="bar-btn" data-action="discard" ${ui.discard.size === prompt.count ? "" : "disabled"}>버리기 (${ui.discard.size}/${prompt.count})</button>`);
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

function promptCardsHtml(view) {
  const prompt = view.prompt;
  if (!prompt || !prompt.cards) return "";
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
  const buttons = ui.picker.takes.map((take) => {
    if (take === "hand") return `<button type="button" data-take="hand">손패에서 무작위</button>`;
    const card = Object.values(target?.equipment || {}).find((c) => c && c.id === take);
    if (!card) return "";
    return `<button type="button" data-take="${esc(take)}">${cardArt(card)}</button>`;
  }).join("");
  return `<div class="modal"><div class="modal-card">
    <h2>${esc(target?.nickname || "")} 님의 카드</h2>
    <div class="take-row">${buttons}</div>
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
    if (prompt.kind === "kit") return "한 장을 덱 위에 올리세요";
    if (prompt.kind === "lucky") return "두 장 중 드로우! 결과를 고르세요";
  }
  if (view.currentId === view.yourId && view.turnPhase === "play") return "당신의 턴 · 카드를 내거나 턴을 종료하세요";
  if (current) return `${name} 님의 턴`;
  return "게임 진행 중";
}

function dockHtml(ctx) {
  const view = ctx.view;
  const tab = ui.tab;
  return `<aside class="dock" data-tab="${tab}">
    <div class="tabs">
      <button type="button" data-tab="log" class="${tab === "log" ? "on" : ""}">기록</button>
      <button type="button" data-tab="chat" class="${tab === "chat" ? "on" : ""}">대화</button>
    </div>
    <div id="log" class="log" ${tab === "log" ? "" : "hidden"}>
      ${(view.log || []).map((line) => `<p>${esc(line.text)}</p>`).join("") || `<p class="muted">아직 기록이 없습니다.</p>`}
    </div>
    <div class="chat" ${tab === "chat" ? "" : "hidden"}>
      ${(view.chat || []).map((line) => `<p><b>${esc(line.name)}</b> ${esc(line.text)}</p>`).join("") || `<p class="muted">인사를 남겨 보세요.</p>`}
    </div>
    <form data-chat>
      <input id="chat-input" maxlength="200" placeholder="메시지" autocomplete="off" />
      <button type="submit">보내기</button>
    </form>
  </aside>`;
}

function toastHtml(ctx) {
  if (!ctx.toast) return "";
  return `<p class="toast" role="status">${esc(ctx.toast)}</p>`;
}

function helpHtml() {
  return `<dialog class="help" id="help">
    <h2>뱅! 베이스</h2>
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
  if (event.target.matches("[data-chat]")) {
    event.preventDefault();
    const input = app.querySelector("#chat-input");
    const text = input.value.trim();
    if (!text) return;
    ui.chat = "";
    input.value = "";
    ctx.onAction({ type: "chat", text });
  }
}

function onClick(event, app) {
  const ctx = app.__ctx;
  const view = ctx.view;
  if (eatingClick && event.target.closest(".card")) return;
  if (event.target.closest("[data-action=help]")) app.querySelector("#help")?.showModal();
  if (event.target.closest("[data-action=close-help]")) app.querySelector("#help")?.close();
  if (event.target.closest("[data-tab]")) {
    ui.tab = event.target.closest("[data-tab]").dataset.tab;
    mount(app, ctx);
    return;
  }
  if (event.target.closest("[data-action=takeover]")) ctx.onTakeOver();
  if (event.target.closest("[data-action=leave]")) ctx.onLeave();
  if (event.target.closest("[data-action=start]")) ctx.onAction({ type: "start" });
  if (event.target.closest("[data-action=again]")) ctx.onAction({ type: "again" });
  if (event.target.closest("[data-action=end]")) ctx.onAction({ type: "end" });
  if (event.target.closest("[data-char]")) {
    ctx.onAction({ type: "choose", characterId: event.target.closest("[data-char]").dataset.char });
    return;
  }
  if (event.target.closest("[data-self-role]")) {
    if (eatingClick) return;
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
  if (event.target.closest("[data-take]")) {
    const take = event.target.closest("[data-take]").dataset.take;
    const pick = ui.picker;
    ui.picker = null;
    ui.selected = null;
    if (pick) ctx.onAction({ type: "play", cardId: pick.cardId, targetId: pick.targetId, take });
    return;
  }
  if (event.target.closest("[data-store-card]")) {
    ctx.onAction({ type: "respond", cardId: event.target.closest(".card").dataset.cardId });
    return;
  }
  if (event.target.closest("[data-pick-card]")) {
    ctx.onAction({ type: "respond", cardId: event.target.closest(".card").dataset.cardId });
    return;
  }
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
  const seat = event.target.closest("[data-legal-target]");
  if (seat && ui.selected && !event.target.closest(".card")) {
    playAt(ctx, ui.selected, seat.dataset.player);
    return;
  }
  if (seat && ui.selected && event.target.closest(".card") && !event.target.closest("[data-hand-card]") && !event.target.closest("[data-self-role]")) {
    playAt(ctx, ui.selected, seat.dataset.player);
    return;
  }
  const hand = event.target.closest("[data-hand-card]");
  if (hand) {
    if (eatingClick) return;
    onHand(ctx, hand.closest(".card"));
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

let zoom = null;
let eatingClick = false;

function wireZoom() {
  const layer = document.querySelector("#zoom-layer");
  window.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    const stack = event.target.closest?.(".stack");
    const cards = stack
      ? [...stack.querySelectorAll(".card")]
      : (event.target.closest?.(".card") ? [event.target.closest(".card")] : []);
    if (!cards.length) return;
    const point = { x: event.clientX, y: event.clientY, cards, moved: false, opened: false };
    point.timer = setTimeout(() => openZoom(cards, layer, point), 240);
    zoom = point;
  });
  window.addEventListener("pointermove", (event) => {
    if (!zoom || zoom.opened) return;
    if (Math.hypot(event.clientX - zoom.x, event.clientY - zoom.y) > 12) {
      clearTimeout(zoom.timer);
      zoom.moved = true;
    }
  });
  window.addEventListener("pointerup", () => finishZoom(layer));
  window.addEventListener("pointercancel", () => finishZoom(layer));
}

function placeClone(clone, rect) {
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
}

function openZoom(cards, layer, point) {
  const live = cards.filter((card) => card.isConnected);
  if (!live.length) return;
  const clones = live.map((card) => {
    const rect = card.getBoundingClientRect();
    const clone = card.cloneNode(true);
    clone.querySelectorAll("[data-hand-card],[data-self-role],[data-store-card],[data-pick-card],[data-response-card]").forEach((node) => {
      node.removeAttribute("data-hand-card");
      node.removeAttribute("data-self-role");
      node.removeAttribute("data-store-card");
      node.removeAttribute("data-pick-card");
      node.removeAttribute("data-response-card");
    });
    clone.style.transition = "none";
    clone.style.margin = "0";
    clone.style.transform = "none";
    placeClone(clone, rect);
    return { clone, rect };
  });
  layer.replaceChildren(...clones.map((item) => item.clone));
  layer.hidden = false;
  point.opened = true;
  point.clones = clones;
  eatingClick = true;
  requestAnimationFrame(() => {
    const n = clones.length;
    const pad = 18;
    const gap = n > 1 ? 12 : 0;
    let cardW = Math.min(176, (window.innerWidth - pad * 2 - gap * (n - 1)) / n);
    let cardH = cardW * 1.555;
    const maxH = window.innerHeight - pad * 2;
    if (cardH > maxH) {
      cardH = maxH;
      cardW = cardH / 1.555;
    }
    const total = n * cardW + (n - 1) * gap;
    const startX = (window.innerWidth - total) / 2;
    const top = (window.innerHeight - cardH) / 2;
    clones.forEach(({ clone }, i) => {
      clone.style.transition = "left .42s cubic-bezier(.22,.7,.25,1), top .42s cubic-bezier(.22,.7,.25,1), width .42s cubic-bezier(.22,.7,.25,1), height .42s cubic-bezier(.22,.7,.25,1)";
      clone.style.left = `${startX + i * (cardW + gap)}px`;
      clone.style.top = `${top}px`;
      clone.style.width = `${cardW}px`;
      clone.style.height = `${cardH}px`;
    });
  });
}

function finishZoom(layer) {
  if (!zoom) return;
  clearTimeout(zoom.timer);
  const point = zoom;
  zoom = null;
  if (!point.opened) {
    eatingClick = false;
    return;
  }
  for (const item of point.clones || []) placeClone(item.clone, item.rect);
  setTimeout(() => {
    layer.hidden = true;
    layer.replaceChildren();
    setTimeout(() => { eatingClick = false; }, 40);
  }, 430);
}
