import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/";
const out = "/tmp/bang-shots";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pages = [];
const names = ["한별", "코요테", "이슬", "흑표"];

function logPage(page, name) {
  page.on("pageerror", (err) => console.log("PAGEERROR", name, err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE", name, msg.text());
  });
}

async function enter(page, name, code) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator("[data-field=nickname]").fill(name);
  await page.locator("[data-field=code]").fill(code);
  await page.locator("[data-action=enter]").click();
}

const gate = await context.newPage();
logPage(gate, "gate");
await enter(gate, "한별", "0000");
await gate.waitForSelector("text=암호가 올바르지 않습니다");
await gate.screenshot({ path: `${out}/01-wrong-code.png` });
await gate.close();

for (let i = 0; i < 4; i += 1) {
  const page = await context.newPage();
  logPage(page, names[i]);
  pages.push(page);
  await enter(page, names[i], "3913");
}

await pages[0].waitForSelector("[data-screen=lobby]", { timeout: 20000 });
await pages[0].waitForFunction(() => document.querySelectorAll(".roster li").length >= 4, null, { timeout: 20000 });
await pages[0].screenshot({ path: `${out}/02-lobby.png` });
const host = pages.find(async () => false) || pages[0];
let hostPage = pages[0];
for (const page of pages) {
  if (await page.locator("#app").getAttribute("data-host") === "1") hostPage = page;
}
await hostPage.locator("[data-action=start]").click();
for (const page of pages) await page.waitForSelector("[data-char]", { timeout: 15000 });
await pages[1].screenshot({ path: `${out}/03-choose.png` });
for (const page of pages) await page.locator("[data-char]").first().click();
await pages[0].waitForSelector("[data-screen=play]", { timeout: 15000 });
await pages[0].screenshot({ path: `${out}/04-table.png` });
for (const page of pages) {
  if (await page.locator("[data-self-role]").count()) {
    await page.locator("[data-self-role]").click();
    await page.screenshot({ path: `${out}/04b-role-flip.png` });
    break;
  }
}
const zoomCard = pages[0].locator("[data-hand-card]").first();
const box = await zoomCard.boundingBox();
if (box) {
  await pages[0].mouse.move(box.x + box.width / 2, box.y + 30);
  await pages[0].mouse.down();
  await pages[0].waitForTimeout(450);
  await pages[0].screenshot({ path: `${out}/04c-card-zoom.png` });
  await pages[0].mouse.up();
  await pages[0].waitForTimeout(300);
}
await pages[1].setViewportSize({ width: 390, height: 844 });
await pages[1].screenshot({ path: `${out}/05-mobile-table.png` });
await pages[1].setViewportSize({ width: 1280, height: 800 });

const phone = await context.newPage();
logPage(phone, "late");
await phone.setViewportSize({ width: 390, height: 844 });
await enter(phone, "늦손님", "3913");
await phone.waitForTimeout(1200);
await phone.screenshot({ path: `${out}/06-rejected.png` });
await phone.close();

async function step(page) {
  const info = await page.evaluate(() => {
    const root = document.querySelector("#app");
    return {
      screen: root?.dataset.screen || "",
      prompt: root?.dataset.prompt || "",
      yourTurn: root?.dataset.yourTurn || "",
      winner: root?.dataset.winner || "",
    };
  });
  if (info.screen === "end" || info.winner) return "end";
  if (info.prompt === "miss" || info.prompt === "discard-bang" || info.prompt === "save") {
    const card = page.locator("[data-response-card]");
    if (info.prompt !== "save" && await card.count()) await card.first().click();
    else await page.locator("[data-action=pass]").click();
    return "act";
  }
  if (info.prompt === "discard") {
    const cards = page.locator("[data-hand-card]");
    const n = await cards.count();
    for (let i = 0; i < n; i += 1) {
      if (await page.locator("[data-action=discard]:not([disabled])").count()) break;
      await cards.nth(i).click();
    }
    await page.locator("[data-action=discard]").click();
    return "act";
  }
  if (await page.locator("[data-pick-card]").count()) {
    await page.locator("[data-pick-card]").first().click();
    return "act";
  }
  if (await page.locator("[data-store-card]").count()) {
    await page.locator("[data-store-card]").first().click();
    return "act";
  }
  if (await page.locator('[data-draw="deck"]').count()) {
    await page.locator('[data-draw="deck"]').first().click();
    return "act";
  }
  if (info.yourTurn === "1") {
    for (const type of ["gatling", "indians", "duel", "bang"]) {
      const card = page.locator(`[data-hand-card][data-type="${type}"]`).first();
      if (!(await card.count())) continue;
      await card.click();
      const target = page.locator("[data-legal-target]");
      if (await target.count()) {
        const sheriff = page.locator('[data-legal-target] .plate strong', { hasText: /.+/ });
        await target.first().click();
        return "act";
      }
      if (type === "gatling" || type === "indians") return "act";
      break;
    }
    const end = page.locator("[data-action=end]");
    if (await end.count()) await end.click();
    return "act";
  }
  return "wait";
}

let winner = "";
for (let turn = 0; turn < 400 && !winner; turn += 1) {
  let acted = false;
  for (const page of pages) {
    const result = await step(page);
    if (result === "end") {
      winner = await page.locator("#app").getAttribute("data-winner");
      await page.screenshot({ path: `${out}/07-victory.png` });
      break;
    }
    if (result === "act") acted = true;
  }
  if (!acted) await pages[0].waitForTimeout(80);
}
if (!winner) {
  await pages[0].screenshot({ path: `${out}/05-stuck.png` });
  const debug = await pages[0].evaluate(() => ({
    screen: document.querySelector("#app")?.dataset.screen,
    prompt: document.querySelector("#app")?.dataset.prompt,
    turn: document.querySelector("#app")?.dataset.yourTurn,
    text: document.querySelector(".turn-flag")?.textContent,
    log: document.querySelector("#log")?.innerText?.slice(-500),
  }));
  await writeFile(`${out}/stuck.json`, JSON.stringify(debug, null, 2));
  throw new Error(`game did not finish: ${JSON.stringify(debug)}`);
}

console.log("WIN", winner);
await browser.close();
