import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = "http://127.0.0.1:8765/lab/?v=26";
const names = ["가람", "나래", "다온", "라온", "마루"];
mkdirSync("/opt/cursor/artifacts", { recursive: true });
const C = (type, suit, rank) => ({ type, suit, rank });

async function openTable(browser, setup) {
  const room = `hibang${Date.now().toString(36)}cards`;
  const pages = [];
  for (let i = 0; i < names.length; i += 1) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript((id) => {
      globalThis.__BANG_ROOM_ID = id;
      globalThis.__BANG_TEST = true;
    }, room);
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("pageerror", names[i], String(err)));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator("[data-field=nickname]").fill(names[i]);
    await page.locator("[data-field=code]").fill("3913");
    await page.locator("[data-action=enter]").click();
    if (i === 0) await page.waitForFunction(() => document.querySelector("#app")?.dataset.host === "1" && document.querySelector("[data-count]")?.dataset.count === "1", null, { timeout: 30000 });
    else await pages[0].waitForFunction((n) => document.querySelector("[data-count]")?.dataset.count === String(n), i + 1, { timeout: 30000 });
    pages.push(page);
  }
  await pages[0].waitForFunction(() => document.querySelector("[data-count]")?.dataset.count === "5", null, { timeout: 20000 });
  await pages[0].waitForTimeout(1200);
  let host = pages[0];
  for (const page of pages) {
    if (await page.locator("#app").getAttribute("data-host") === "1") host = page;
  }
  await host.evaluate((payload) => document.querySelector("#app").__ctx.onAction({ type: "start", pass: "secret", setup: payload }), setup);
  for (const page of pages) {
    try {
      await page.waitForFunction(() => document.querySelector("#app")?.dataset.phase === "play", null, { timeout: 25000 });
    } catch (error) {
      const text = await page.locator("body").innerText().catch(() => "");
      throw new Error(`not in play: ${text.slice(0, 180)}`);
    }
  }
  await pages[0].waitForTimeout(700);
  return pages;
}

async function viewOf(page) {
  return page.evaluate(() => document.querySelector("#app").__ctx.view);
}

async function byName(pages, name) {
  for (const page of pages) {
    if ((await viewOf(page)).yourName === name) return page;
  }
  throw new Error(name);
}

function hiddenLeak(view) {
  if (view.deck || view.deckOrder) return "deck order";
  for (const player of view.players) {
    const self = player.id === view.yourId;
    if (!self && player.hand && player.hand.length) return `${view.yourName} sees ${player.nickname}'s hand`;
    if (!self && player.alive && player.role && player.role !== "sheriff") return `${view.yourName} sees ${player.nickname}'s role`;
  }
  return "";
}

async function tapOnly(page, hit) {
  await page.evaluate((point) => {
    const canvas = document.querySelector("#table-gl");
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + point.cx;
    const y = rect.top + point.cy;
    const common = { pointerId: 6, bubbles: true, button: 0, pointerType: "mouse", isPrimary: true };
    canvas.dispatchEvent(new PointerEvent("pointerdown", { ...common, clientX: x, clientY: y, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { ...common, clientX: x, clientY: y, buttons: 0 }));
  }, hit);
}

async function tapHit(page, hit) {
  await page.evaluate((point) => {
    const canvas = document.querySelector("#table-gl");
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + point.cx;
    const y = rect.top + point.cy;
    const common = { pointerId: 5, bubbles: true, button: 0, pointerType: "mouse", isPrimary: true };
    canvas.dispatchEvent(new PointerEvent("pointerdown", { ...common, clientX: x, clientY: y, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { ...common, clientX: x, clientY: y, buttons: 0 }));
  }, hit);
  await page.waitForSelector("#card-zoom .zoom-fly.is-open, #card-zoom .zoom-backs.is-open", { timeout: 4000 });
  await page.waitForTimeout(450);
  const place = await page.evaluate(() => {
    const node = document.querySelector("#card-zoom .zoom-fly.is-open, #card-zoom .zoom-backs.is-open");
    const box = node.getBoundingClientRect();
    return { cx: Math.round(box.left + box.width / 2), text: node.textContent || "", vw: window.innerWidth };
  });
  if (Math.abs(place.cx - place.vw / 2) > 80) throw new Error(`zoom off center ${place.cx}`);
  return place;
}

async function closeZoom(page) {
  const state = await page.evaluate(() => {
    document.querySelector("#card-zoom")?.click();
    const layer = document.querySelector("#card-zoom");
    return { hidden: layer?.hidden, open: Boolean(layer?.querySelector(".is-open")), sample: (layer?.innerHTML || "").slice(0, 80) };
  });
  if (state.open) throw new Error(`zoom stayed open ${JSON.stringify(state)}`);
  await page.waitForFunction(() => document.querySelector("#card-zoom")?.hidden !== false, null, { timeout: 2000 });
}

const browser = await chromium.launch({ headless: true });
try {
  const pages = await openTable(browser, {
    roles: ["sheriff", "deputy", "outlaw", "outlaw", "renegade"],
    characters: ["bart", "calamity", "suzy", "rose", "willy"],
    hands: [
      [C("bang", "diamonds", "4"), C("panic", "hearts", "A")],
      [C("beer", "hearts", "6"), C("missed", "clubs", "2")],
      [C("bang", "spades", "A")],
      [],
      [],
    ],
    equipment: [{ scope: C("scope", "spades", "A") }, { mustang: C("mustang", "hearts", "8") }, null, null, null],
    deck: [C("missed", "clubs", "3"), C("missed", "clubs", "4")],
  });
  for (const page of pages) {
    const leak = hiddenLeak(await viewOf(page));
    if (leak) throw new Error(leak);
  }
  const sheriffPreview = await byName(pages, "가람");
  await sheriffPreview.screenshot({ path: "/opt/cursor/artifacts/v26_own_area.png" });
  if (process.env.SHOT_ONLY) {
    console.log("SHOT");
    await browser.close();
    process.exit(0);
  }
  const idle = await byName(pages, "나래");
  const samples = await idle.evaluate(() => new Promise((resolve) => {
    const node = document.querySelector(".seat .who, .self-tray .who");
    const tops = [];
    const step = () => {
      tops.push(node.getBoundingClientRect().top);
      if (tops.length >= 60) resolve(tops);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }));
  const drift = Math.max(...samples) - Math.min(...samples);
  if (drift > 2) throw new Error(`label drifted ${drift.toFixed(2)}px over 60 frames`);
  const hits = await idle.evaluate(() => globalThis.__bangHits || []);
  const me = (await viewOf(idle)).yourId;
  const otherGear = hits.find((hit) => hit.kind === "gear" && hit.playerId && hit.playerId !== me);
  const ownGear = hits.find((hit) => hit.kind === "gear" && hit.playerId === me);
  const otherHand = hits.find((hit) => hit.kind === "hand" && hit.secret);
  const character = hits.find((hit) => hit.kind === "character" && hit.playerId !== me);
  if (!otherGear || !ownGear || !otherHand || !character) throw new Error(`hits ${JSON.stringify(hits.map((hit) => hit.kind + hit.playerId.slice(0, 4)))}`);
  await tapHit(idle, otherGear);
  await idle.screenshot({ path: "/opt/cursor/artifacts/v25_zoom_table.png" });
  await closeZoom(idle);
  await idle.waitForTimeout(400);
  const backs = await tapHit(idle, otherHand);
  if (!backs.text.includes("장")) throw new Error(`hand zoom showed ${backs.text}`);
  await idle.screenshot({ path: "/opt/cursor/artifacts/v25_zoom_hand_backs.png" });
  await closeZoom(idle);
  await idle.waitForTimeout(400);
  await tapHit(idle, ownGear);
  await idle.screenshot({ path: "/opt/cursor/artifacts/v25_zoom_own_table.png" });
  await closeZoom(idle);
  await idle.waitForTimeout(400);
  await tapHit(idle, character);
  await idle.screenshot({ path: "/opt/cursor/artifacts/v25_zoom_character.png" });
  await closeZoom(idle);
  await idle.evaluate(() => {
    const card = document.querySelector(".stack.hand [data-card-id]");
    const box = card.getBoundingClientRect();
    const common = { bubbles: true, clientX: box.x + 16, clientY: box.y + 16, pointerId: 8, button: 0 };
    card.dispatchEvent(new PointerEvent("pointerdown", common));
    card.dispatchEvent(new PointerEvent("pointerup", common));
  });
  await idle.waitForSelector("#card-zoom .zoom-fly.is-open", { timeout: 4000 });
  await idle.waitForTimeout(700);
  await idle.screenshot({ path: "/opt/cursor/artifacts/v26_hand_zoom.png" });
  await closeZoom(idle);

  const sheriff = await byName(pages, "가람");
  await sheriff.evaluate(() => document.querySelector("#app").__ctx.onAction({ type: "draw" }));
  await sheriff.waitForFunction(() => document.querySelector("#app").__ctx.view.turnPhase === "play");
  await sheriff.evaluate(() => {
    const card = document.querySelector('.stack.hand [data-type="panic"]');
    const box = card.getBoundingClientRect();
    const common = { bubbles: true, clientX: box.x + 12, clientY: box.y + 12, pointerId: 9, button: 0 };
    card.dispatchEvent(new PointerEvent("pointerdown", common));
    card.dispatchEvent(new PointerEvent("pointerup", common));
  });
  await sheriff.waitForSelector("#card-zoom [data-zoom-act=aim]", { timeout: 4000 });
  const button = await sheriff.locator("#card-zoom .bar-btn").evaluate((node) => {
    const style = getComputedStyle(node);
    return { bg: style.backgroundColor, color: style.color, text: node.textContent };
  });
  if (button.text !== "내기") throw new Error(`play label ${button.text}`);
  if (!button.bg.includes("36") && !button.color.includes("255")) throw new Error(`button colors ${button.bg} ${button.color}`);
  await sheriff.waitForTimeout(700);
  await sheriff.screenshot({ path: "/opt/cursor/artifacts/v26_hand_zoom.png" });
  await sheriff.locator("#card-zoom [data-zoom-act=aim]").click();
  await sheriff.waitForFunction(() => document.querySelector("#app").dataset.aiming === "1");
  await sheriff.screenshot({ path: "/opt/cursor/artifacts/v25_aim.png" });
  const naraeId = (await viewOf(idle)).yourId;
  const naraeCard = (await sheriff.evaluate(() => globalThis.__bangHits || [])).find((hit) => hit.kind === "character" && hit.playerId === naraeId);
  await tapOnly(sheriff, naraeCard);
  try {
    await sheriff.waitForSelector("[data-hand-index], [data-hand-back]", { timeout: 5000 });
  } catch (error) {
    const toast = await sheriff.locator(".toast").textContent().catch(() => "");
    throw new Error(`no hand pick ${toast}`);
  }
  const choosers = [];
  for (const page of pages) {
    if (await page.locator("[data-hand-index], [data-hand-back]").count()) choosers.push((await viewOf(page)).yourName);
  }
  if (choosers.join() !== "가람") throw new Error(`hand choice shown to ${choosers}`);
  await sheriff.screenshot({ path: "/opt/cursor/artifacts/v26_picker.png" });
  const before = (await viewOf(idle)).players.find((p) => p.id === naraeId);
  await sheriff.locator("[data-hand-index='1'], [data-hand-back='1']").click();
  await idle.waitForFunction((count) => {
    const me = document.querySelector("#app").__ctx.view.players.find((p) => p.id === document.querySelector("#app").__ctx.view.yourId);
    return me.handCount < count;
  }, before.handCount);
  const thief = (await viewOf(sheriff)).players.find((p) => p.nickname === "가람");
  const owner = (await viewOf(idle)).players.find((p) => p.id === naraeId);
  if (!thief.hand?.some((card) => card.rank === "2" && card.suit === "clubs")) throw new Error(`panic took ${JSON.stringify(thief.hand)}`);
  if (owner.handCount !== before.handCount - 1) throw new Error("hand count did not drop");
  if ((owner.hand || []).some((card) => card.rank === "2" && card.suit === "clubs")) throw new Error("chosen card stayed");
  for (const page of pages) {
    const view = await viewOf(page);
    const leak = hiddenLeak(view);
    if (leak) throw new Error(leak);
    const event = view.events.at(-1);
    if (!event) continue;
    const faces = (event.cards || []).filter((card) => card.type && card.type !== "back");
    if (view.yourName !== "가람" && view.yourName !== "나래" && faces.length) throw new Error(`${view.yourName} saw a stolen face`);
  }
  await sheriff.evaluate(() => {
    const card = document.querySelector('.stack.hand [data-type="bang"]');
    const box = card.getBoundingClientRect();
    const common = { bubbles: true, clientX: box.x + 12, clientY: box.y + 20, pointerId: 11, button: 0 };
    card.dispatchEvent(new PointerEvent("pointerdown", common));
    card.dispatchEvent(new PointerEvent("pointerup", common));
  });
  await sheriff.locator("#card-zoom [data-zoom-act=aim]").click();
  const bangTarget = (await sheriff.evaluate(() => globalThis.__bangHits || [])).find((hit) => hit.kind === "character" && hit.playerId === naraeId);
  await sheriff.evaluate((point) => {
    const canvas = document.querySelector("#table-gl");
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + point.cx;
    const y = rect.top + point.cy;
    const common = { pointerId: 12, bubbles: true, button: 0, pointerType: "mouse", isPrimary: true };
    canvas.dispatchEvent(new PointerEvent("pointerdown", { ...common, clientX: x, clientY: y, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { ...common, clientX: x, clientY: y, buttons: 0 }));
  }, bangTarget);
  await sheriff.waitForFunction(() => document.querySelector("#app").__ctx.view.prompt?.kind === "miss", null, { timeout: 5000 });
  console.log("PASS card zoom, bang target, panic backs, hidden payload");
} catch (error) {
  console.error("FAIL", error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
