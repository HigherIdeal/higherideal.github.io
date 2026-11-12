import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/lab/?v=24";
const NAMES = ["가람", "나래", "다온", "라온", "마루"];
mkdirSync("/opt/cursor/artifacts", { recursive: true });

const C = (type, suit, rank) => ({ type, suit, rank });
const PAD = [C("missed", "clubs", "2"), C("missed", "clubs", "3")];
const results = [];

function fail(error) {
  const text = error?.stack || String(error);
  const line = text.split("\n").slice(0, 4).join(" | ");
  return line;
}

async function openTable(browser, setup) {
  const room = `hibang${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const pages = [];
  for (let i = 0; i < NAMES.length; i += 1) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript((id) => {
      globalThis.__BANG_ROOM_ID = id;
      globalThis.__BANG_TEST = true;
    }, room);
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("pageerror", NAMES[i], String(err)));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator("[data-field=nickname]").fill(NAMES[i]);
    await page.locator("[data-field=code]").fill("3913");
    await page.locator("[data-action=enter]").click();
    if (i === 0) {
      await page.waitForFunction(() => document.querySelector("#app")?.dataset.host === "1" && document.querySelector("[data-count]")?.dataset.count === "1", null, { timeout: 40000 });
    } else {
      try {
        await pages[0].waitForFunction((n) => document.querySelector("[data-count]")?.dataset.count === String(n), i + 1, { timeout: 40000 });
      } catch (error) {
        const text = await pages[0].locator("body").innerText().catch(() => "");
        const guest = await page.locator("body").innerText().catch(() => "");
        throw new Error(`join ${i + 1} stalled\nhost:${text.slice(0, 180)}\nguest:${guest.slice(0, 180)}\n${error.message}`);
      }
    }
    pages.push(page);
  }
  await pages[0].evaluate((payload) => {
    document.querySelector("#app").__ctx.onAction({ type: "start", pass: "secret", setup: payload });
  }, setup);
  try {
    await pages[0].waitForFunction(() => {
      const phase = document.querySelector("#app")?.dataset.phase;
      return phase === "play" || phase === "select";
    }, null, { timeout: 20000 });
  } catch (error) {
    const text = await pages[0].locator("body").innerText().catch(() => "");
    throw new Error(`start stalled ${text.slice(0, 300)} ${error.message}`);
  }
  const phase = await pages[0].evaluate(() => document.querySelector("#app").dataset.phase);
  if (phase !== "play") {
    const toast = await pages[0].locator(".toast").textContent().catch(() => "");
    const text = await pages[0].locator("body").innerText().catch(() => "");
    throw new Error(`game did not start (${phase}) ${toast} ${text.slice(0, 240)}`);
  }
  for (const page of pages) {
    try {
      await page.waitForFunction(() => document.querySelector("#app").dataset.phase === "play", null, { timeout: 30000 });
    } catch (error) {
      const text = await page.locator("body").innerText().catch(() => "");
      const status = await page.locator("#app").getAttribute("data-status").catch(() => "");
      throw new Error(`seat stuck status=${status} ${text.slice(0, 220)} ${error.message}`);
    }
  }
  return { browser, pages, room };
}

async function closeTable(table) {
  await Promise.all(table.pages.map((page) => page.context().close().catch(() => {})));
}

async function read(page) {
  return page.evaluate(() => {
    const view = document.querySelector("#app")?.__ctx?.view;
    if (!view) return null;
    return {
      yourId: view.yourId,
      yourName: view.yourName,
      phase: view.phase,
      hostId: view.hostId,
      currentId: view.currentId,
      turnPhase: view.turnPhase,
      winner: view.winner?.team || "",
      deckCount: view.deckCount,
      prompt: view.prompt ? { kind: view.prompt.kind, playerId: view.prompt.playerId, mine: view.prompt.mine, need: view.prompt.need || 0, count: view.prompt.count || 0 } : null,
      lastEvent: view.events?.at?.(-1)?.caption || view.events?.slice?.(-1)?.[0]?.caption || "",
      players: view.players.map((p) => ({
        id: p.id,
        name: p.nickname,
        hp: p.hp,
        max: p.maxHp,
        hand: p.handCount,
        alive: p.alive !== false,
        role: p.role,
        character: p.character,
        self: p.id === view.yourId,
        distance: p.distance,
        eq: ["weapon", "mustang", "scope", "barrel", "jail", "dynamite"].filter((slot) => p.equipment?.[slot]).map((slot) => `${slot}:${p.equipment[slot].type}`).join(","),
        cards: p.hand ? p.hand.map((c) => `${c.type}:${c.suit}:${c.rank}`) : null,
      })),
    };
  });
}

function pub(view) {
  return JSON.stringify({
    phase: view.phase,
    currentId: view.currentId,
    turnPhase: view.turnPhase,
    winner: view.winner,
    deckCount: view.deckCount,
    prompt: view.prompt ? `${view.prompt.kind}:${view.prompt.playerId}` : "",
    lastEvent: view.lastEvent,
    players: view.players.map((p) => [p.name, p.hp, p.hand, p.alive, p.eq, p.character]),
  });
}

async function views(pages) {
  return Promise.all(pages.map((page) => read(page)));
}

async function sync(pages, label) {
  const all = (await views(pages)).filter(Boolean);
  if (all.length !== pages.length) throw new Error(`${label}: a seat has no view`);
  const first = pub(all[0]);
  all.forEach((view, index) => {
    if (pub(view) !== first) throw new Error(`${label}: seat ${index} ${view.yourName} diverged ${pub(view)} != ${first}`);
  });
  return all;
}

async function waitFor(pages, pred, label, timeout = 12000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeout) {
    const all = await views(pages);
    if (all.every(Boolean) && all.every(pred)) {
      await sync(pages, label);
      return all;
    }
    last = all.find(Boolean) ? pub(all.find(Boolean)) : "empty";
    await pages[0].waitForTimeout(150);
  }
  throw new Error(`${label} timed out ${last}`);
}

async function pageOf(pages, id) {
  for (const page of pages) {
    const mine = await page.evaluate((pid) => document.querySelector("#app").__ctx.view.yourId === pid, id);
    if (mine) return page;
  }
  throw new Error(`no page for ${id}`);
}

async function byName(pages, name) {
  for (const page of pages) {
    const mine = await page.evaluate((wanted) => document.querySelector("#app").__ctx.view.yourName === wanted, name);
    if (mine) return page;
  }
  throw new Error(`no page for ${name}`);
}

async function act(page, action) {
  await page.evaluate((payload) => document.querySelector("#app").__ctx.onAction(payload), action);
}

async function handId(page, type, suit = "", rank = "") {
  return page.evaluate(({ type, suit, rank }) => {
    const view = document.querySelector("#app").__ctx.view;
    const me = view.players.find((p) => p.id === view.yourId);
    const card = (me.hand || []).find((c) => c.type === type && (!suit || c.suit === suit) && (!rank || c.rank === rank));
    return card?.id || "";
  }, { type, suit, rank });
}

async function idOf(pages, name) {
  const view = await read(pages[0]);
  return view.players.find((p) => p.name === name).id;
}

async function current(pages) {
  const view = await read(pages[0]);
  return { view, page: await pageOf(pages, view.currentId) };
}

async function draw(pages) {
  const { view, page } = await current(pages);
  if (view.turnPhase !== "draw" || view.prompt) return;
  await act(page, { type: "draw" });
  await waitFor(pages, (v) => v.turnPhase === "play" && v.currentId === view.currentId, "draw");
}

async function endTurn(pages) {
  const { view, page } = await current(pages);
  await act(page, { type: "end" });
  const all = await waitFor(pages, (v) => v.phase === "end" || v.prompt?.kind === "discard" || v.currentId !== view.currentId, "end turn");
  if (all[0].prompt?.kind === "discard") {
    const owner = await pageOf(pages, all[0].prompt.playerId);
    const ids = await owner.evaluate((count) => {
      const view = document.querySelector("#app").__ctx.view;
      const me = view.players.find((p) => p.id === view.yourId);
      return me.hand.slice(0, count).map((c) => c.id);
    }, all[0].prompt.count);
    await act(owner, { type: "discard", cardIds: ids });
    await waitFor(pages, (v) => v.prompt?.kind !== "discard", "discard");
  }
}

async function only(pages, selector) {
  const names = [];
  for (const page of pages) {
    const count = await page.locator(selector).count();
    if (count) names.push(await page.evaluate(() => document.querySelector("#app").__ctx.view.yourName));
  }
  return names;
}

async function watchReveal(pages, text) {
  const start = Date.now();
  let shot = null;
  while (Date.now() - start < 6000) {
    const flags = [];
    for (const page of pages) {
      const flag = await page.evaluate((needle) => {
        const node = document.querySelector("#reveal-layer:not([hidden]) .reveal-caption");
        return {
          live: Boolean(node && node.textContent.includes(needle)),
          seen: (document.body.dataset.reveals || "").includes(needle),
        };
      }, text);
      flags.push(flag);
      if (flag.live && !shot) shot = page;
    }
    if (flags.every((flag) => flag.seen || flag.live)) return shot || pages[0];
    await pages[0].waitForTimeout(70);
  }
  throw new Error(`reveal "${text}" missed on at least one seat`);
}

async function shot(page, name) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png` });
}

const roles = ["sheriff", "deputy", "outlaw", "outlaw", "renegade"];

async function run(browser, name, setup, fn) {
  if (focus && !name.includes(focus)) return;
  let table;
  try {
    table = await openTable(browser, setup);
    await fn(table.pages);
    results.push({ name, ok: true, error: "" });
    console.log("PASS", name);
  } catch (error) {
    results.push({ name, ok: false, error: fail(error) });
    console.error("FAIL", name, fail(error));
  } finally {
    if (table) await closeTable(table);
  }
}

const focus = process.env.SCENARIO || "";
const browser = await chromium.launch({ headless: true });
try {
  await run(browser, "roles and corners", {
    roles,
    characters: ["bart", "calamity", "suzy", "rose", "willy"],
    hands: [[C("bang", "diamonds", "4"), C("beer", "hearts", "6"), C("bang", "spades", "A"), C("catbalou", "diamonds", "9"), C("panic", "diamonds", "8")], [], [], [], []],
    deck: [...PAD],
    hp: [4, 4, 4, 4, 4],
  }, async (pages) => {
    const all = await sync(pages, "opening");
    for (const view of all) {
      const self = view.players.find((p) => p.self);
      const sheriff = view.players.find((p) => p.name === "가람");
      if (sheriff.role !== "sheriff") throw new Error("sheriff is not public");
      if (self.role !== roles[NAMES.indexOf(self.name)]) throw new Error(`${self.name} cannot see their role`);
      for (const player of view.players) {
        if (player.self || player.role === "sheriff") continue;
        if (player.role) throw new Error(`${view.yourName} can see ${player.name}'s role`);
      }
    }
    const host = await byName(pages, "가람");
    const pips = await host.locator('.stack.hand [data-rank="4"]').evaluate((card) => [...card.querySelectorAll(".pip")].map((node) => node.textContent));
    if (pips.length !== 2 || pips[0] !== "♦4" || pips[1] !== "♦4") throw new Error(`corners ${pips.join("|")}`);
    const masked = await host.locator('.stack.hand [data-rank="4"] .art-index').count();
    if (!masked) throw new Error("baked index is not covered");
    await host.evaluate(() => {
      const card = document.querySelector('.stack.hand [data-rank="4"]');
      const box = card.getBoundingClientRect();
      const common = { bubbles: true, clientX: box.x + 12, clientY: box.y + 12, pointerId: 4, button: 0 };
      card.dispatchEvent(new PointerEvent("pointerdown", common));
      card.dispatchEvent(new PointerEvent("pointerup", common));
    });
    await host.waitForSelector("#card-zoom .zoom-fly.is-open", { timeout: 4000 });
    await shot(host, "v24_corners");
    await host.locator("#card-zoom").click({ position: { x: 8, y: 8 } });
    await draw(pages);
    const beer = await handId(host, "beer");
    await act(host, { type: "play", cardId: beer });
    await waitFor(pages, (v) => v.players.find((p) => p.name === "가람").hp === 5, "beer heal");
    await endTurn(pages);
    await waitFor(pages, (v) => v.players.find((p) => p.name === "가람").hand === v.players.find((p) => p.name === "가람").hp, "hand limit");
  });

  await run(browser, "barrel, Jourdonnais, range, death", {
    roles: ["sheriff", "outlaw", "deputy", "outlaw", "renegade"],
    characters: ["willy", "jourdonnais", "rose", "paul", "bart"],
    hands: [[C("bang", "spades", "A"), C("bang", "diamonds", "2"), C("bang", "diamonds", "3"), C("bang", "diamonds", "5"), C("bang", "diamonds", "K"), C("scope", "spades", "A")], [], [], [], []],
    equipment: [null, { barrel: C("barrel", "spades", "Q") }, { mustang: C("mustang", "hearts", "8") }, null, null],
    deck: [...PAD, C("missed", "hearts", "A"), C("bang", "spades", "5"), C("missed", "hearts", "K"), C("bang", "spades", "6"), C("bang", "spades", "7"), C("beer", "hearts", "6"), C("beer", "hearts", "7"), C("beer", "hearts", "8")],
    hp: [5, 1, 1, 4, 4],
  }, async (pages) => {
    await draw(pages);
    const sheriff = await byName(pages, "가람");
    const far = await read(pages[0]);
    const rose = far.players.find((p) => p.name === "다온");
    if (rose.distance !== 3) throw new Error(`mustang distance ${rose.distance}`);
    const paul = far.players.find((p) => p.name === "라온");
    if (paul.distance !== 3) throw new Error(`paul distance ${paul.distance}`);
    const early = await handId(sheriff, "bang", "spades", "A");
    await act(sheriff, { type: "play", cardId: early, targetId: rose.id });
    await pages[0].waitForTimeout(500);
    const blocked = await sheriff.locator(".toast").textContent().catch(() => "");
    if (!blocked.includes("사정거리")) throw new Error(`range toast missing: ${blocked}`);
    const neighbor = await idOf(pages, "나래");
    const first = await handId(sheriff, "bang", "diamonds", "2");
    await act(sheriff, { type: "play", cardId: first, targetId: neighbor });
    const heartShot = await watchReveal(pages, "피했다");
    if (heartShot?.screenshot) await heartShot.screenshot({ path: "/opt/cursor/artifacts/v24_barrel_heart.png" }).catch(() => {});
    await waitFor(pages, (v) => v.players.find((p) => p.name === "나래").hp === 1 && !v.prompt, "heart check saved");
    const second = await handId(sheriff, "bang", "diamonds", "3");
    await act(sheriff, { type: "play", cardId: second, targetId: neighbor });
    await watchReveal(pages, "피했다");
    await waitFor(pages, (v) => v.players.find((p) => p.name === "나래").hp === 1 && !v.prompt, "barrel heart saved");
    const third = await handId(sheriff, "bang", "diamonds", "5");
    await act(sheriff, { type: "play", cardId: third, targetId: neighbor });
    await waitFor(pages, (v) => v.prompt?.kind === "miss", "miss prompt");
    const choosers = await only(pages, "[data-action=pass]");
    if (choosers.join() !== "나래") throw new Error(`miss prompt shown to ${choosers}`);
    await act(await byName(pages, "나래"), { type: "respond", choice: "take" });
    await waitFor(pages, (v) => v.players.find((p) => p.name === "나래").alive === false, "outlaw dies");
    const reward = await read(await byName(pages, "가람"));
    if (!reward.players.find((p) => p.self).cards.filter((c) => c.startsWith("beer:")).length) throw new Error("outlaw reward was not drawn");
    const after = await read(sheriff);
    if (after.players.find((p) => p.name === "다온").distance !== 2) throw new Error(`distance after death ${after.players.find((p) => p.name === "다온").distance}`);
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "scope") });
    await waitFor(pages, (v) => v.players.find((p) => p.name === "가람").eq.includes("scope"), "scope equipped");
    const scoped = await read(sheriff);
    if (scoped.players.find((p) => p.name === "다온").distance !== 1) throw new Error(`scoped distance ${scoped.players.find((p) => p.name === "다온").distance}`);
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "bang", "diamonds", "K"), targetId: rose.id });
    await waitFor(pages, (v) => v.prompt?.kind === "miss" && v.prompt.playerId === rose.id, "scope reaches");
    await act(await byName(pages, "다온"), { type: "respond", choice: "take" });
    await waitFor(pages, (v) => {
      const shooter = v.players.find((p) => p.name === "가람");
      const deputy = v.players.find((p) => p.name === "다온");
      return deputy.alive === false && shooter.hand === 0 && shooter.eq === "";
    }, "sheriff discarded everything after killing a deputy");
  });

  await run(browser, "Dynamite pass then explosion", {
    roles,
    characters: ["paul", "bart", "suzy", "rose", "willy"],
    equipment: [{ dynamite: C("dynamite", "hearts", "2") }, null, null, null, null],
    deck: [C("missed", "hearts", "A"), ...PAD, C("bang", "spades", "5")],
    hp: [4, 4, 4, 4, 4],
  }, async (pages) => {
    await watchReveal(pages, "넘어감");
    await waitFor(pages, (v) => v.players.find((p) => p.name === "나래").eq.includes("dynamite") && v.turnPhase === "draw", "dynamite passed");
    await draw(pages);
    await endTurn(pages);
    const boom = await watchReveal(pages, "폭발");
    if (boom?.screenshot) await boom.screenshot({ path: "/opt/cursor/artifacts/v24_dynamite.png" });
    else await shot(pages[0], "v24_dynamite");
    await waitFor(pages, (v) => v.players.find((p) => p.name === "나래").hp === 1 && !v.players.find((p) => p.name === "나래").eq.includes("dynamite"), "dynamite exploded");
  });

  await run(browser, "Jail escape, skip, and not on the Sheriff", {
    roles,
    characters: ["bart", "lucky", "calamity", "suzy", "rose"],
    hands: [[], [], [C("jail", "hearts", "4")], [], []],
    equipment: [null, { jail: C("jail", "spades", "J") }, null, null, null],
    deck: [...PAD, C("missed", "hearts", "A"), C("bang", "spades", "9")],
  }, async (pages) => {
    await draw(pages);
    await endTurn(pages);
    await waitFor(pages, (v) => v.prompt?.kind === "lucky", "lucky jail");
    const who = await only(pages, "[data-ability=lucky] [data-pick-card]");
    if (who.join() !== "나래") throw new Error(`jail choice shown to ${who}`);
    await shot(await byName(pages, "나래"), "v24_jail");
    await (await byName(pages, "나래")).locator("[data-pick-card]").filter({ hasText: "♥" }).first().click();
    await waitFor(pages, (v) => v.currentId === v.players.find((p) => p.name === "나래").id && v.turnPhase === "draw" && !v.players.find((p) => p.name === "나래").eq.includes("jail"), "escaped jail");
    await draw(pages);
    await endTurn(pages);
    for (let i = 0; i < 4; i += 1) {
      const view = await read(pages[0]);
      if (view.players.find((p) => p.name === "다온").eq.includes("jail") || view.phase === "end") break;
      if (view.prompt?.kind === "lucky") break;
      const actor = await pageOf(pages, view.currentId);
      if (view.turnPhase === "draw") await draw(pages);
      else if ((await read(pages[0])).currentId === await idOf(pages, "다온") && view.turnPhase === "play") {
        const jail = await handId(actor, "jail");
        const sheriff = await idOf(pages, "가람");
        await act(actor, { type: "play", cardId: jail, targetId: sheriff });
        await pages[0].waitForTimeout(500);
        const toast = await actor.locator(".toast").textContent().catch(() => "");
        if (!toast.includes("보안관")) throw new Error(`sheriff jail toast: ${toast}`);
        const still = await handId(actor, "jail");
        if (!still) throw new Error("jail left the hand");
        const narae = await idOf(pages, "나래");
        await act(actor, { type: "play", cardId: still, targetId: narae });
        await waitFor(pages, (v) => v.players.find((p) => p.name === "나래").eq.includes("jail"), "jailed again");
        await endTurn(pages);
      } else await endTurn(pages);
    }
    await waitFor(pages, (v) => v.prompt?.kind === "lucky", "second jail", 20000);
    const skippers = await only(pages, "[data-ability=lucky] [data-pick-card]");
    if (skippers.join() !== "나래") throw new Error(`skip choice shown to ${skippers}`);
    await (await byName(pages, "나래")).locator("[data-pick-card]").first().click();
    await waitFor(pages, (v) => v.currentId !== v.players.find((p) => p.name === "나래").id && !v.players.find((p) => p.name === "나래").eq.includes("jail"), "jail skipped the turn");
  });

  await run(browser, "Duel, Indians, Gatling", {
    roles,
    characters: ["bart", "calamity", "suzy", "rose", "willy"],
    hands: [[C("duel", "diamonds", "Q"), C("bang", "spades", "A"), C("indians", "diamonds", "A"), C("gatling", "hearts", "10")], [C("missed", "clubs", "K")], [], [], []],
    deck: [...PAD, ...PAD, ...PAD, ...PAD, ...PAD],
    hp: [4, 4, 4, 4, 4],
  }, async (pages) => {
    await draw(pages);
    const sheriff = await byName(pages, "가람");
    const foe = await idOf(pages, "나래");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "duel"), targetId: foe });
    await waitFor(pages, (v) => v.prompt?.kind === "discard-bang" && v.prompt.playerId === foe, "duel starts");
    if ((await only(pages, "[data-action=pass]")).join() !== "나래") throw new Error("duel prompt leaked");
    await shot(await byName(pages, "나래"), "v24_duel");
    const narae = await byName(pages, "나래");
    await act(narae, { type: "respond", choice: "card", cardId: await handId(narae, "missed") });
    const calamity = await narae.evaluate(() => (document.querySelector("#app").__ctx.view.cues || []).map((c) => c.text).join(" "));
    if (!calamity.includes("캘러미티")) throw new Error(`calamity cue missing ${calamity}`);
    await waitFor(pages, (v) => v.prompt?.playerId === v.players.find((p) => p.name === "가람").id, "duel back to sheriff");
    await act(sheriff, { type: "respond", choice: "card", cardId: await handId(sheriff, "bang") });
    await waitFor(pages, (v) => v.prompt?.playerId === foe, "duel returns");
    await act(narae, { type: "respond", choice: "take" });
    await waitFor(pages, (v) => v.players.find((p) => p.name === "나래").hp === 3 && !v.prompt, "duel hit");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "indians") });
    await waitFor(pages, (v) => v.prompt?.kind === "discard-bang", "indians");
    for (let i = 0; i < 4; i += 1) {
      const view = await read(pages[0]);
      if (!view.prompt || view.prompt.kind !== "discard-bang") break;
      if ((await only(pages, "[data-action=pass]")).length !== 1) throw new Error("indians prompt leaked");
      await act(await pageOf(pages, view.prompt.playerId), { type: "respond", choice: "take" });
      await pages[0].waitForTimeout(200);
    }
    await waitFor(pages, (v) => !v.prompt && v.players.filter((p) => p.name !== "가람" && p.hp === p.max - 1).length >= 3, "indians damage");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "gatling") });
    for (let i = 0; i < 4; i += 1) {
      const view = await read(pages[0]);
      if (!view.prompt) break;
      if ((await only(pages, "[data-action=pass]")).length !== 1) throw new Error("gatling prompt leaked");
      await act(await pageOf(pages, view.prompt.playerId), { type: "respond", choice: "take" });
      await waitFor(pages, (v) => !v.prompt || v.prompt.playerId !== view.prompt.playerId, "next gatling");
    }
    await sync(pages, "after gatling");
  });

  await run(browser, "Store, Panic, Cat Balou, draws, weapons, Saloon", {
    roles,
    characters: ["bart", "calamity", "suzy", "rose", "willy"],
    hands: [[
      C("store", "clubs", "9"), C("panic", "hearts", "A"), C("catbalou", "hearts", "K"),
      C("stagecoach", "spades", "9"), C("wells", "hearts", "3"), C("saloon", "hearts", "5"),
      C("schofield", "clubs", "J"), C("remington", "clubs", "A"), C("carbine", "clubs", "K"),
      C("winchester", "spades", "8"), C("volcanic", "clubs", "10"), C("bang", "diamonds", "6"), C("bang", "diamonds", "7"),
    ], [C("beer", "hearts", "6")], [C("missed", "clubs", "K")], [], []],
    deck: [
      ...PAD,
      C("beer", "hearts", "9"),
      C("bang", "clubs", "2"), C("bang", "clubs", "3"), C("bang", "clubs", "4"), C("bang", "clubs", "5"), C("bang", "clubs", "6"),
      C("missed", "spades", "2"), C("missed", "spades", "3"),
      C("beer", "hearts", "8"), C("beer", "hearts", "10"), C("beer", "hearts", "J"),
    ],
    hp: [3, 3, 3, 3, 3],
  }, async (pages) => {
    await draw(pages);
    const sheriff = await byName(pages, "가람");
    const neighbor = await idOf(pages, "나래");
    const far = await idOf(pages, "다온");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "panic"), targetId: far, take: "hand" });
    await pages[0].waitForTimeout(400);
    if (!(await sheriff.locator(".toast").textContent().catch(() => "")).includes("거리")) throw new Error("panic range was not enforced");
    const before = (await read(pages[0])).players.find((p) => p.name === "나래").hand;
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "panic"), targetId: neighbor, take: "hand" });
    await waitFor(pages, (v) => v.players.find((p) => p.name === "나래").hand === before - 1, "panic stole");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "catbalou"), targetId: far, take: "hand" });
    await waitFor(pages, (v) => v.players.find((p) => p.name === "다온").cards?.includes("beer:hearts:9"), "suzy drew");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "store") });
    const order = [];
    for (let i = 0; i < 5; i += 1) {
      await waitFor(pages, (v) => v.prompt?.kind === "store", `store ${i}`);
      const view = await read(pages[0]);
      const picker = view.players.find((p) => p.id === view.prompt.playerId);
      order.push(picker.name);
      const buttons = await only(pages, "[data-store-card]");
      if (buttons.join() !== picker.name) throw new Error(`store pick shown to ${buttons}`);
      if (i === 0) await shot(await pageOf(pages, view.prompt.playerId), "v24_store");
      const owner = await pageOf(pages, view.prompt.playerId);
      const cardId = await owner.evaluate(() => document.querySelector("[data-store-card]")?.dataset.cardId || document.querySelector(".store .card")?.dataset.cardId || "");
      await act(owner, { type: "respond", cardId });
    }
    if (order.join() !== NAMES.join()) throw new Error(`store order ${order}`);
    await waitFor(pages, (v) => !v.prompt, "store done");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "stagecoach") });
    await waitFor(pages, (v) => v.players.find((p) => p.name === "가람").cards?.includes("missed:spades:2"), "stagecoach");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "wells") });
    await waitFor(pages, (v) => v.players.find((p) => p.name === "가람").cards?.includes("beer:hearts:J"), "wells");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "saloon") });
    await waitFor(pages, (v) => v.players.every((p) => p.hp === p.hp && p.hp >= 3) && v.players.find((p) => p.name === "나래").hp === 4, "saloon");
    for (const weapon of ["schofield", "remington", "carbine", "winchester", "volcanic"]) {
      await act(sheriff, { type: "play", cardId: await handId(sheriff, weapon) });
      await waitFor(pages, (v) => v.players.find((p) => p.name === "가람").eq.includes(`weapon:${weapon}`), weapon);
    }
    const scopeBang = await handId(sheriff, "bang", "diamonds", "6");
    await act(sheriff, { type: "play", cardId: scopeBang, targetId: neighbor });
    await waitFor(pages, (v) => v.prompt?.kind === "miss", "volcanic bang");
    await act(await pageOf(pages, (await read(pages[0])).prompt.playerId), { type: "respond", choice: "take" });
    const again = await handId(sheriff, "bang", "diamonds", "7");
    await act(sheriff, { type: "play", cardId: again, targetId: neighbor });
    await waitFor(pages, (v) => v.prompt?.kind === "miss", "second volcanic bang");
    await act(await byName(pages, "나래"), { type: "respond", choice: "take" });
    await sync(pages, "weapons");
  });

  await run(browser, "Kit, Pedro, Lucky, Sid, Black Jack, Jesse", {
    roles: ["sheriff", "deputy", "outlaw", "outlaw", "renegade"],
    characters: ["blackjack", "kit", "pedro", "lucky", "jesse"],
    hands: [[], [], [], [], []],
    equipment: [null, null, null, { jail: C("jail", "spades", "10") }, null],
    discard: [C("beer", "hearts", "8")],
    deck: [
      C("missed", "clubs", "4"), C("bang", "hearts", "A"), C("beer", "hearts", "6"),
      C("bang", "spades", "A"), C("missed", "clubs", "5"), C("wells", "hearts", "3"),
      C("missed", "hearts", "Q"), C("bang", "spades", "9"),
      ...PAD, ...PAD,
    ],
    hp: [4, 4, 4, 3, 4],
  }, async (pages) => {
    await waitFor(pages, (v) => v.turnPhase === "draw" && !v.prompt, "blackjack draw");
    if ((await only(pages, ".draw-prompt")).join() !== "가람") throw new Error("draw prompt leaked");
    await act(await byName(pages, "가람"), { type: "draw" });
    const reveal = await watchReveal(pages, "블랙 잭");
    if (reveal?.screenshot) await reveal.screenshot({ path: "/opt/cursor/artifacts/v24_blackjack.png" }).catch(() => {});
    await waitFor(pages, (v) => v.players.find((p) => p.name === "가람").cards?.includes("bang:hearts:A") && v.players.find((p) => p.name === "가람").cards?.includes("beer:hearts:6"), "red second card drew a third");
    await endTurn(pages);
    await waitFor(pages, (v) => v.prompt?.kind === "kit", "kit");
    if ((await only(pages, "[data-ability=kit]")).join() !== "나래") throw new Error("kit panel leaked");
    await shot(await byName(pages, "나래"), "v24_kit");
    const kit = await byName(pages, "나래");
    const cards = kit.locator("[data-kit-card]");
    await cards.nth(0).click();
    await cards.nth(1).click();
    await kit.locator("[data-action=kit-keep]").click();
    await waitFor(pages, (v) => v.turnPhase === "play" && v.players.find((p) => p.name === "나래").cards?.includes("bang:spades:A") && !v.players.find((p) => p.name === "나래").cards?.includes("wells:hearts:3"), "kit kept two");
    await endTurn(pages);
    await waitFor(pages, (v) => v.prompt?.kind === "pedro", "pedro");
    if ((await only(pages, "[data-ability=pedro]")).join() !== "다온") throw new Error("pedro panel leaked");
    await shot(await byName(pages, "다온"), "v24_pedro");
    await (await byName(pages, "다온")).locator("[data-draw=discard]").click();
    await waitFor(pages, (v) => {
      const pedro = v.players.find((p) => p.name === "다온");
      return pedro.cards?.includes("beer:hearts:8") && pedro.cards?.includes("wells:hearts:3");
    }, "pedro took discard and the returned card");
    await endTurn(pages);
    await waitFor(pages, (v) => v.prompt?.kind === "lucky", "lucky");
    if ((await only(pages, "[data-ability=lucky]")).join() !== "라온") throw new Error("lucky panel leaked");
    await shot(await byName(pages, "라온"), "v24_lucky");
    await watchReveal(pages, "럭키 듀크");
    await (await byName(pages, "라온")).locator("[data-pick-card]").filter({ hasText: "♥" }).first().click();
    await waitFor(pages, (v) => v.players.find((p) => p.name === "라온").id === v.currentId && v.turnPhase === "draw", "lucky escaped");
    await draw(pages);
    await endTurn(pages);
    await waitFor(pages, (v) => v.prompt?.kind === "jesse", "jesse");
    if ((await only(pages, "[data-ability=jesse]")).join() !== "마루") throw new Error("jesse panel leaked");
    await shot(await byName(pages, "마루"), "v24_jesse");
    const before = (await read(pages[0])).players.find((p) => p.name === "가람").hand;
    await (await byName(pages, "마루")).locator("[data-draw=player]").filter({ hasText: "가람" }).click();
    await waitFor(pages, (v) => v.players.find((p) => p.name === "가람").hand === before - 1 && v.turnPhase === "play", "jesse stole");
    await endTurn(pages);
    const sidView = await read(pages[0]);
    if (sidView.players.find((p) => p.name === "라온").hp >= 4) {
      /* lucky was healed by nothing; hp stays 3 until sid. Sid is jesse's seat. Use jesse as the healer by skipping. */
    }
  });

  await run(browser, "Sid heal and passive abilities", {
    roles,
    characters: ["slab", "sid", "elgringo", "bart", "vulture"],
    hands: [
      [C("bang", "spades", "A"), C("bang", "diamonds", "2"), C("bang", "diamonds", "3"), C("beer", "hearts", "9")],
      [C("bang", "clubs", "4"), C("missed", "clubs", "5")],
      [C("beer", "hearts", "6")],
      [],
      [],
    ],
    deck: [...PAD, C("missed", "spades", "4"), C("missed", "spades", "5"), C("missed", "spades", "6"), C("bang", "hearts", "K")],
    hp: [4, 3, 3, 4, 4],
  }, async (pages) => {
    await draw(pages);
    const sheriff = await byName(pages, "가람");
    const gringo = await idOf(pages, "다온");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "bang", "spades", "A"), targetId: gringo });
    await waitFor(pages, (v) => v.prompt?.kind === "miss" && v.prompt.need === 2, "slab needs two");
    await act(await byName(pages, "다온"), { type: "respond", choice: "take" });
    await waitFor(pages, (v) => {
      const shot = v.players.find((p) => p.name === "가람");
      const hit = v.players.find((p) => p.name === "다온");
      return hit.hp === 2 && hit.hand === 2 && shot.hand < 4;
    }, "el gringo stole");
    await endTurn(pages);
    await waitFor(pages, (v) => v.currentId === v.players.find((p) => p.name === "나래").id && v.turnPhase === "play", "sid turn");
    if ((await only(pages, "[data-action=sid-mode]")).join() !== "나래") throw new Error("sid button leaked");
    await shot(await byName(pages, "나래"), "v24_sid");
    const sid = await byName(pages, "나래");
    const ids = await sid.evaluate(() => {
      const me = document.querySelector("#app").__ctx.view.players.find((p) => p.id === document.querySelector("#app").__ctx.view.yourId);
      return me.hand.slice(0, 2).map((c) => c.id);
    });
    await act(sid, { type: "sid", cardIds: ids });
    await watchReveal(pages, "시드 케첨");
    await waitFor(pages, (v) => v.players.find((p) => p.name === "나래").hp === 4, "sid healed");
    await endTurn(pages);
    await draw(pages);
    await endTurn(pages);
    await draw(pages);
    const bart = await byName(pages, "라온");
    const beforeBart = (await read(pages[0])).players.find((p) => p.name === "라온").hand;
    const shooter = await current(pages);
    if (shooter.view.players.find((p) => p.name === "라온").id === shooter.view.currentId) {
      await endTurn(pages);
    }
    const attacker = await pageOf(pages, (await read(pages[0])).currentId);
    if ((await read(pages[0])).turnPhase === "draw") await draw(pages);
    const bang = await handId(attacker, "bang");
    if (bang) {
      await act(attacker, { type: "play", cardId: bang, targetId: await idOf(pages, "라온") });
      if ((await read(pages[0])).prompt?.kind === "miss") {
        await act(bart, { type: "respond", choice: "take" });
        await waitFor(pages, (v) => v.players.find((p) => p.name === "라온").hand > beforeBart, "bart drew");
      }
    }
    const victim = await idOf(pages, "다온");
    const killerPage = await pageOf(pages, (await read(pages[0])).currentId);
    const killerBang = await handId(killerPage, "bang");
    if (killerBang && (await read(pages[0])).players.find((p) => p.name === "다온").hp === 1) {
      await act(killerPage, { type: "play", cardId: killerBang, targetId: victim });
      if ((await read(pages[0])).prompt) await act(await byName(pages, "다온"), { type: "respond", choice: "take" });
      await waitFor(pages, (v) => v.players.find((p) => p.name === "마루").cards?.some((c) => c.includes("beer")) || v.players.find((p) => p.name === "다온").alive === false, "vulture");
    }
    await sync(pages, "passives");
  });

  await run(browser, "Sheriff team wins", {
    roles,
    characters: ["bart", "calamity", "suzy", "rose", "willy"],
    hands: [[C("gatling", "hearts", "10")], [], [], [], []],
    deck: [...PAD],
    hp: [5, 4, 1, 1, 1],
  }, async (pages) => {
    await draw(pages);
    const sheriff = await byName(pages, "가람");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "gatling") });
    for (let i = 0; i < 4; i += 1) {
      const view = await read(pages[0]);
      if (view.phase === "end" || !view.prompt) break;
      await act(await pageOf(pages, view.prompt.playerId), { type: "respond", choice: "take" });
      await pages[0].waitForTimeout(250);
    }
    await waitFor(pages, (v) => v.phase === "end" && v.winner === "sheriff", "sheriff win", 15000);
    await shot(pages[0], "v24_win_sheriff");
  });

  await run(browser, "Outlaws win", {
    roles,
    characters: ["bart", "calamity", "suzy", "rose", "willy"],
    hands: [[], [C("bang", "spades", "A")], [], [], []],
    deck: [...PAD, ...PAD],
    hp: [1, 4, 4, 4, 4],
  }, async (pages) => {
    await draw(pages);
    await endTurn(pages);
    await draw(pages);
    const outlaw = await byName(pages, "나래");
    await act(outlaw, { type: "play", cardId: await handId(outlaw, "bang"), targetId: await idOf(pages, "가람") });
    await waitFor(pages, (v) => v.prompt?.kind === "miss", "sheriff shot");
    await act(await byName(pages, "가람"), { type: "respond", choice: "take" });
    await waitFor(pages, (v) => v.phase === "end" && v.winner === "outlaw", "outlaw win");
    await shot(pages[0], "v24_win_outlaw");
  });

  await run(browser, "Renegade wins", {
    roles,
    characters: ["bart", "calamity", "suzy", "rose", "willy"],
    hands: [[], [], [], [], [C("gatling", "hearts", "10"), C("remington", "clubs", "A"), C("bang", "spades", "A"), C("beer", "hearts", "6")]],
    deck: [...PAD, ...PAD, ...PAD, ...PAD, ...PAD],
    hp: [2, 1, 1, 1, 3],
  }, async (pages) => {
    for (let i = 0; i < 4; i += 1) {
      const view = await read(pages[0]);
      if (view.players.find((p) => p.name === "마루").id === view.currentId) break;
      if (view.turnPhase === "draw") await draw(pages);
      else await endTurn(pages);
    }
    await draw(pages);
    const renegade = await byName(pages, "마루");
    await act(renegade, { type: "play", cardId: await handId(renegade, "remington") });
    await act(renegade, { type: "play", cardId: await handId(renegade, "gatling") });
    for (let i = 0; i < 4; i += 1) {
      const view = await read(pages[0]);
      if (!view.prompt) break;
      await act(await pageOf(pages, view.prompt.playerId), { type: "respond", choice: "take" });
      await pages[0].waitForTimeout(200);
    }
    await waitFor(pages, (v) => v.players.filter((p) => p.alive).map((p) => p.name).sort().join() === "가람,마루", "only sheriff and renegade");
    await act(renegade, { type: "play", cardId: await handId(renegade, "beer") });
    await waitFor(pages, (v) => v.players.find((p) => p.name === "마루").hp === 3, "beer does nothing with two left");
    await act(renegade, { type: "play", cardId: await handId(renegade, "bang"), targetId: await idOf(pages, "가람") });
    await waitFor(pages, (v) => v.prompt?.kind === "miss", "final bang");
    await act(await byName(pages, "가람"), { type: "respond", choice: "take" });
    await waitFor(pages, (v) => v.phase === "end" && v.winner === "renegade", "renegade win");
    await shot(pages[0], "v24_win_renegade");
  });

  await run(browser, "Rejoin, timeout, pause, host migration, end", {
    roles,
    characters: ["bart", "calamity", "suzy", "rose", "willy"],
    hands: [[C("bang", "spades", "A")], [C("beer", "hearts", "6")], [], [], []],
    deck: [...PAD, C("missed", "spades", "2")],
    hp: [4, 4, 4, 4, 4],
  }, async (pages) => {
    await sync(pages, "network start");
    const snapshot = await read(pages[0]);
    const leaving = await byName(pages, "라온");
    const hand = snapshot.players.find((p) => p.name === "라온").hand;
    await leaving.context().close();
    pages.splice(pages.indexOf(leaving), 1);
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript((id) => {
      globalThis.__BANG_ROOM_ID = id;
      globalThis.__BANG_TEST = true;
    }, await pages[0].evaluate(() => globalThis.__BANG_ROOM_ID));
    const rejoined = await context.newPage();
    await rejoined.goto(base, { waitUntil: "domcontentloaded" });
    await rejoined.locator("[data-field=nickname]").fill("라온");
    await rejoined.locator("[data-field=code]").fill("3913");
    await rejoined.locator("[data-action=enter]").click();
    await rejoined.waitForFunction(() => document.querySelector("#app")?.dataset.phase === "play", null, { timeout: 20000 });
    pages.push(rejoined);
    await waitFor(pages, (v) => v.players.find((p) => p.name === "라온").hand === hand, "rejoined hand", 20000);
    await draw(pages);
    const sheriff = await byName(pages, "가람");
    await act(sheriff, { type: "play", cardId: await handId(sheriff, "bang"), targetId: await idOf(pages, "나래") });
    await waitFor(pages, (v) => v.prompt?.kind === "miss", "timeout prompt");
    const defender = await byName(pages, "나래");
    await defender.context().close();
    pages.splice(pages.indexOf(defender), 1);
    await waitFor(pages, (v) => v.players.find((p) => p.name === "나래").hp === 3, "disconnect auto-took the hit", 12000);
    const host = await byName(pages, "가람");
    await act(host, { type: "pause", pass: "secret" });
    await waitFor(pages, (v) => v.phase === "play", "still paused in play");
    await pages[0].waitForSelector(".pause-overlay", { timeout: 8000 });
    await shot(pages[0], "v24_pause");
    await act(host, { type: "fresh", pass: "nope" });
    await host.waitForTimeout(600);
    if ((await read(host)).phase !== "play") throw new Error("wrong password ended the game");
    await act(host, { type: "resume", pass: "secret" });
    await waitFor(pages, (v) => v.phase === "play", "resumed");
    await host.waitForSelector(".pause-overlay", { state: "detached", timeout: 8000 }).catch(() => {});
    const hpBefore = (await read(pages[0])).players.map((p) => [p.name, p.hp]);
    await host.context().close();
    pages.splice(pages.indexOf(host), 1);
    const start = Date.now();
    let migrated = null;
    while (Date.now() - start < 15000) {
      for (const page of pages) {
        if (await page.locator("#app").getAttribute("data-host") === "1" && await page.locator("#app").getAttribute("data-phase") === "play") migrated = page;
      }
      if (migrated) break;
      await pages[0].waitForTimeout(300);
    }
    if (!migrated) throw new Error("no new host");
    const hpAfter = (await read(migrated)).players.map((p) => [p.name, p.hp]);
    if (JSON.stringify(hpBefore) !== JSON.stringify(hpAfter)) throw new Error(`hp changed across migration ${hpAfter}`);
    await act(migrated, { type: "fresh", pass: "secret" });
    await waitFor(pages, (v) => v.phase === "lobby", "host ended the game");
  });
} finally {
  await browser.close();
}

console.log("\nSCENARIOS");
for (const row of results) console.log(`${row.ok ? "PASS" : "FAIL"}\t${row.name}${row.error ? `\t${row.error}` : ""}`);
if (results.some((row) => !row.ok)) process.exitCode = 1;
