import { chromium } from "playwright";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const names = ["한별", "코요테", "이슬", "흑표"];
const pages = [];
for (const name of names) {
  const page = await context.newPage();
  pages.push(page);
  await page.goto(base);
  await page.locator("[data-field=nickname]").fill(name);
  await page.locator("[data-field=code]").fill("3913");
  await page.locator("[data-action=enter]").click();
}
await pages[0].waitForFunction(() => document.querySelectorAll(".roster li").length >= 4, null, { timeout: 20000 });
let host = pages[0];
for (const page of pages) {
  if (await page.locator("#app").getAttribute("data-host") === "1") host = page;
}
await host.locator("[data-action=start]").click();
for (const page of pages) {
  await page.waitForSelector("[data-char]");
  await page.locator("[data-char]").first().click();
}
await pages[1].waitForSelector("[data-screen=play]");
const before = await pages[1].locator(".self-tray strong").innerText();
await pages[1].reload();
await pages[1].locator("[data-field=nickname]").fill("코요테");
await pages[1].locator("[data-field=code]").fill("3913");
await pages[1].locator("[data-action=enter]").click();
await pages[1].waitForSelector("[data-screen=play]", { timeout: 20000 });
const after = await pages[1].locator(".self-tray strong").innerText();
if (before !== after) throw new Error(`rejoin name ${before} -> ${after}`);
const hand = await pages[1].locator("[data-hand-card]").count();
if (hand < 1) throw new Error("rejoined without a hand");
console.log("REJOIN", after, "cards", hand);
await browser.close();
