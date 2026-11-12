import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/lab/";
mkdirSync("/opt/cursor/artifacts", { recursive: true });

async function shoot(count, file) {
  const room = `hibang${Date.now().toString(36)}${count}`;
  const browser = await chromium.launch({ headless: true });
  const pages = [];
  try {
    for (let i = 0; i < count; i += 1) {
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
    await pages[0].waitForFunction((n) => document.querySelector("[data-count]")?.dataset.count === String(n), count, { timeout: 40000 });
    let host = pages[0];
    for (const page of pages) {
      if (await page.locator("#app").getAttribute("data-host") === "1") host = page;
    }
    await host.locator("[data-action=start]").click();
    for (const page of pages) {
      await page.waitForSelector("[data-char]", { timeout: 25000 });
      await page.locator("[data-char]").first().click();
    }
    await host.waitForSelector("[data-screen=play] .life", { timeout: 25000 });
    await host.waitForTimeout(600);
    await host.screenshot({ path: file });
    const renderer = await host.locator("#app").getAttribute("data-renderer");
    console.log("CROWD", count, renderer, file);
  } finally {
    await browser.close();
  }
}

await shoot(4, "/opt/cursor/artifacts/table_four.png");
await shoot(7, "/opt/cursor/artifacts/table_seven.png");
