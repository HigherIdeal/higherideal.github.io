import { chromium } from "playwright";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/lab/";
const room = `hibang${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function enter(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.addInitScript((id) => {
    globalThis.__BANG_ROOM_ID = id;
  }, room);
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator("[data-field=nickname]").fill(name);
  await page.locator("[data-field=code]").fill("3913");
  await page.locator("[data-action=enter]").click();
  return { context, page };
}

const browser = await chromium.launch({ headless: true });
try {
  const host = await enter(browser, "가람");
  const phone = await enter(browser, "나래");
  const pages = [host.page, phone.page];
  await host.page.waitForFunction(() => document.querySelector("[data-count]")?.dataset.count === "2", null, { timeout: 30000 });
  const line = await host.page.locator("[data-count]").innerText();
  if (!line.includes("2명이면 시작할 수 있습니다")) throw new Error(line);
  await host.page.locator("[data-action=start]").click();
  for (const page of pages) {
    await page.waitForSelector("[data-char]", { timeout: 25000 });
    await page.locator("[data-char]").first().click();
  }
  for (const page of pages) await page.waitForSelector("[data-screen=play]", { timeout: 25000 });
  console.log("TWO_PLAYER_START", room);
} finally {
  await browser.close();
}
