import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/lab/";
mkdirSync("/opt/cursor/artifacts", { recursive: true });

const room = `hibang${Date.now().toString(36)}turn`;
const browser = await chromium.launch({ headless: true });
const pages = [];
try {
  for (let i = 0; i < 4; i += 1) {
    const context = await browser.newContext({ viewport: { width: 1888, height: 1000 } });
    await context.addInitScript((id) => { globalThis.__BANG_ROOM_ID = id; }, room);
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("pageerror", String(err)));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator("[data-field=nickname]").fill(`손님${i + 1}`);
    await page.locator("[data-field=code]").fill("3913");
    await page.locator("[data-action=enter]").click();
    pages.push(page);
  }
  await pages[0].waitForFunction(() => document.querySelector("[data-count]")?.dataset.count === "4", null, { timeout: 40000 });
  let host = pages[0];
  for (const page of pages) {
    if (await page.locator("#app").getAttribute("data-host") === "1") host = page;
  }
  await host.locator("[data-action=start]").click();
  for (const page of pages) {
    await page.waitForSelector("[data-char]", { timeout: 25000 });
    await page.locator("[data-char]").first().click();
  }
  let turn = null;
  for (const page of pages) {
    await page.waitForSelector("[data-screen=play]", { timeout: 25000 });
    if (await page.locator("#app").getAttribute("data-your-turn") === "1") turn = page;
  }
  if (!turn) throw new Error("nobody is in their play phase");
  await turn.waitForTimeout(700);
  await turn.screenshot({ path: "/opt/cursor/artifacts/table_four_desktop.png" });
  await turn.setViewportSize({ width: 412, height: 915 });
  await turn.waitForTimeout(500);
  await turn.screenshot({ path: "/opt/cursor/artifacts/table_four_phone.png" });
  console.log("TURN_SHOTS", await turn.locator("#app").getAttribute("data-renderer"));
} finally {
  await browser.close();
}
