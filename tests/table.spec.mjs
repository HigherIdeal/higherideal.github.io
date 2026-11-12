import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/lab/";
const room = `hibang${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
mkdirSync("/opt/cursor/artifacts", { recursive: true });

async function enter(browser, name, viewport) {
  const context = await browser.newContext({
    viewport,
    hasTouch: viewport.width < 500,
    isMobile: viewport.width < 500,
  });
  await context.addInitScript((id) => { globalThis.__BANG_ROOM_ID = id; }, room);
  const page = await context.newPage();
  page.on("pageerror", (err) => page.__errors.push(String(err)));
  page.__errors = [];
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator("[data-field=nickname]").fill(name);
  await page.locator("[data-field=code]").fill("3913");
  await page.locator("[data-action=enter]").click();
  return { context, page };
}

const browser = await chromium.launch({ headless: true });
try {
  const desk = await enter(browser, "가람", { width: 1280, height: 800 });
  const phone = await enter(browser, "나래", { width: 412, height: 915 });
  await desk.page.waitForFunction(() => document.querySelector("[data-count]")?.dataset.count === "2", null, { timeout: 30000 });
  const host = (await desk.page.locator("#app").getAttribute("data-host")) === "1" ? desk.page : phone.page;
  await host.locator("[data-action=start]").click();
  for (const page of [desk.page, phone.page]) {
    await page.waitForSelector("[data-char]", { timeout: 25000 });
    await page.locator("[data-char]").first().click();
  }
  await desk.page.waitForSelector("[data-screen=play] .life", { timeout: 25000 });
  await phone.page.waitForSelector("[data-screen=play] .life", { timeout: 25000 });
  const read = (page) => page.evaluate(() => [...document.querySelectorAll(".life")].map((el) => ({
    name: el.closest("article, .self-tray")?.querySelector("strong")?.textContent || "",
    hp: el.dataset.hp,
    max: el.dataset.maxHp,
  })));
  const left = await read(desk.page);
  const right = await read(phone.page);
  for (const row of left) {
    const other = right.find((item) => item.name === row.name);
    if (!other || other.hp !== row.hp || other.max !== row.max) {
      throw new Error(`HP mismatch ${JSON.stringify({ left, right })}`);
    }
  }
  const note = await desk.page.locator("body").innerText();
  if (note.includes("(으)로") || note.includes("을(를)")) throw new Error("placeholder particle still visible");
  const canvas = await desk.page.locator("#table-gl").evaluate((el) => ({ w: el.width, h: el.height, webgl: el.parentElement.classList.contains("is-webgl") }));
  if (!canvas.webgl || canvas.w < 100) throw new Error(`webgl table missing ${JSON.stringify(canvas)}`);
  await desk.page.screenshot({ path: "/opt/cursor/artifacts/table_desktop.png" });
  await phone.page.screenshot({ path: "/opt/cursor/artifacts/table_phone.png" });
  const hand = desk.page.locator(".stack.hand");
  const box = await hand.boundingBox();
  await desk.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await desk.page.mouse.down();
  await desk.page.mouse.move(box.x + box.width / 2 + 80, box.y + 10, { steps: 6 });
  await desk.page.waitForSelector("#hand-fan .fan-card.is-focus");
  await desk.page.mouse.up();
  const open = await desk.page.locator("#hand-fan").getAttribute("hidden");
  if (open !== null) throw new Error("fan closed on release");
  const actions = await desk.page.locator(".fan-actions").innerText();
  if (actions && !/사용|대상 선택|버리기|내기|낼 수 없습니다/.test(actions)) throw new Error(actions);
  if (desk.page.__errors.length || phone.page.__errors.length) {
    throw new Error([...(desk.page.__errors || []), ...(phone.page.__errors || [])].join("\n"));
  }
  console.log("TABLE_OK", room, canvas);
} finally {
  await browser.close();
}
