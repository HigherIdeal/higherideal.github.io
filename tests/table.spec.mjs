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
  const desk = await enter(browser, "가람", { width: 1888, height: 1000 });
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
    name: el.closest(".seat, .self-tray")?.querySelector("strong")?.textContent || "",
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
  const canvas = await desk.page.evaluate(() => {
    const el = document.querySelector("#table-gl");
    const app = document.querySelector("#app");
    const seat = document.querySelector(".seat-btn");
    const gl = el?.getContext("webgl2") || el?.getContext("webgl");
    let varied = false;
    if (gl) {
      const pixels = new Uint8Array(16);
      gl.readPixels(Math.floor(el.width / 2), Math.floor(el.height / 3), 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      varied = pixels.some((v, i) => i % 4 !== 3 && v > 8);
    }
    return {
      renderer: app?.dataset.renderer || "",
      w: el?.width || 0,
      h: el?.height || 0,
      webgl: document.querySelector(".board")?.classList.contains("is-webgl") || false,
      seatTag: seat?.tagName || "",
      seatW: document.querySelector(".self-tray")?.getBoundingClientRect().width || 0,
      varied,
    };
  });
  if (!canvas.renderer) throw new Error("renderer was not marked");
  if (canvas.seatTag !== "BUTTON") throw new Error(`seat is ${canvas.seatTag}`);
  if (canvas.renderer === "webgl" && (!canvas.webgl || canvas.w < 800)) {
    throw new Error(`webgl table missing ${JSON.stringify(canvas)}`);
  }
  if (canvas.seatW < 140) throw new Error(`seat too small ${canvas.seatW}`);
  await desk.page.screenshot({ path: "/opt/cursor/artifacts/table_desktop.png" });
  await phone.page.screenshot({ path: "/opt/cursor/artifacts/table_phone.png" });
  const hand = desk.page.locator(".stack.hand");
  const box = await hand.boundingBox();
  await desk.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await desk.page.mouse.down();
  await desk.page.mouse.move(box.x + box.width / 2 + 80, box.y + 10, { steps: 6 });
  await desk.page.waitForSelector("#hand-fan .fan-card.is-focus");
  await desk.page.mouse.move(box.x + box.width / 2 + 420, box.y + 20, { steps: 8 });
  const boxes = await desk.page.locator("#hand-fan .fan-card").evaluateAll((nodes) => nodes.map((node) => {
    const r = node.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width };
  }));
  const view = desk.page.viewportSize();
  for (const card of boxes) {
    if (card.left < -1 || card.right > view.width + 1 || card.top < -1 || card.bottom > view.height + 1) {
      throw new Error(`fan left the viewport ${JSON.stringify(card)} ${view.width}x${view.height}`);
    }
    if (card.w > 220) throw new Error(`fan card too wide ${card.w}`);
  }
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
