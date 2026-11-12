import { chromium } from "playwright";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/lab/";
const room = `hibang${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function enter(browser, name) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript((id) => {
    globalThis.__BANG_ROOM_ID = id;
  }, room);
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator("[data-field=nickname]").fill(name);
  await page.locator("[data-field=code]").fill("3913");
  await page.locator("[data-action=enter]").tap();
  return { context, page };
}

const browser = await chromium.launch({ headless: true });
try {
  const a = await enter(browser, "가람");
  const b = await enter(browser, "나래");
  await a.page.waitForFunction(() => document.querySelector("[data-count]")?.dataset.count === "2", null, { timeout: 30000 });
  let host = a.page;
  if (await b.page.locator("#app").getAttribute("data-host") === "1") host = b.page;
  const guest = host === a.page ? b.page : a.page;
  await host.locator("[data-action=start]").tap();
  for (const page of [host, guest]) {
    await page.waitForSelector("[data-char]", { timeout: 25000 });
    await page.locator("[data-char]").first().tap();
  }
  await host.waitForSelector("[data-hand-card]", { timeout: 25000 });
  const handBox = await host.locator(".stack.hand").boundingBox();
  await host.mouse.move(handBox.x + handBox.width / 2, handBox.y + handBox.height / 2);
  await host.mouse.down();
  await host.mouse.up();
  await host.waitForSelector("#hand-fan:not([hidden]) .fan-card.is-focus", { timeout: 5000 });
  const count = await host.locator("#hand-fan .fan-card").count();
  if (count < 1) throw new Error("fan has no cards");
  const wide = await host.locator("#hand-fan .fan-card.is-focus").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { card: r.width, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  const view = host.viewportSize();
  if (wide.left < -1 || wide.right > view.width + 1 || wide.bottom > view.height + 1) {
    throw new Error(`fan left the phone viewport ${JSON.stringify(wide)}`);
  }
  const buttons = await host.locator("#hand-fan [data-spread-act]").allTextContents();
  const labels = buttons.join(" ");
  if (labels && !/내기|사용|버리기|대상 선택|낼 수 없습니다/.test(labels)) throw new Error(`unexpected actions: ${labels}`);
  await host.locator("#hand-fan").click({ position: { x: 8, y: 8 } });
  await host.waitForFunction(() => document.querySelector("#hand-fan")?.hidden !== false);
  await guest.locator(".seat-btn").first().tap();
  await guest.waitForSelector("[data-spread-kind=seat] .spread-card");
  const foreignActs = await guest.locator("[data-spread-act]").count();
  if (foreignActs) throw new Error("another player's cards offered an action");
  await guest.screenshot({ path: "/opt/cursor/artifacts/spread_mobile_view.png" });
  await guest.locator("[data-spread-close]").tap();
  await host.mouse.click(handBox.x + 20, handBox.y + 20);
  await host.waitForSelector("#hand-fan .fan-card");
  await host.screenshot({ path: "/opt/cursor/artifacts/spread_mobile_hand.png" });
  console.log("SPREAD_TOUCH", room, "cards", count, "cardW", Math.round(wide.card));
} finally {
  await browser.close();
}
