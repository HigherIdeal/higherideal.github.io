import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/lab/";
mkdirSync("/opt/cursor/artifacts", { recursive: true });
const room = `hibang${Date.now().toString(36)}seven`;
const browser = await chromium.launch({ headless: true });
const pages = [];
try {
  for (let i = 0; i < 7; i += 1) {
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
  await pages[0].waitForFunction(() => document.querySelector("[data-count]")?.dataset.count === "7", null, { timeout: 50000 });
  let host = pages[0];
  for (const page of pages) {
    if (await page.locator("#app").getAttribute("data-host") === "1") host = page;
  }
  await host.locator("[data-action=start]").click();
  for (const page of pages) {
    await page.waitForSelector("[data-char]", { timeout: 30000 });
    await page.locator("[data-char]").first().click();
  }
  let turn = null;
  for (const page of pages) {
    await page.waitForSelector("[data-screen=play]", { timeout: 30000 });
    if (await page.locator("#app").getAttribute("data-your-turn") === "1") turn = page;
  }
  if (!turn) throw new Error("nobody is in their play phase");
  await turn.waitForTimeout(400);
  const aimInfo = await turn.evaluate(() => {
    const app = document.querySelector("#app");
    const seat = document.querySelector(".seat[data-player]");
    const targetId = seat?.dataset.player || "";
    const fromId = document.querySelector(".self-tray")?.dataset.player || "";
    globalThis.__bangLocalArc = { fromId, toId: targetId, phase: "preview", at: Date.now() };
    app.__ctx.onAction({ type: "aim", targetId });
    return { host: app.dataset.host, arc: app.dataset.arc, seat: Boolean(seat), phase: app.dataset.phase, prompt: app.dataset.prompt };
  });
  console.log("AIM", JSON.stringify(aimInfo));
  await turn.waitForTimeout(1200);
  const text = await turn.locator("body").innerText();
  if (/기록|대화|보내기|접속/.test(text)) throw new Error(`banned chrome still visible: ${text.slice(0, 180)}`);
  const chips = await turn.locator(".who").evaluateAll((nodes) => nodes.map((node) => ({
    name: node.querySelector("strong")?.textContent || "",
    bullets: node.querySelectorAll(".bullets i.on").length,
    text: node.textContent || "",
  })));
  if (!chips.length || chips.some((chip) => !chip.bullets || /접속|생명|\//.test(chip.text))) {
    throw new Error(`chips ${JSON.stringify(chips)}`);
  }
  await turn.screenshot({ path: "/opt/cursor/artifacts/table_seven_desktop.png" });
  await turn.setViewportSize({ width: 412, height: 915 });
  await turn.waitForTimeout(600);
  await turn.screenshot({ path: "/opt/cursor/artifacts/table_seven_phone.png" });
  console.log("SEVEN_OK", chips.length, await turn.locator("#app").getAttribute("data-renderer"));
} finally {
  await browser.close();
}
