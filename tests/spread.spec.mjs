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
  await host.locator(".stack.hand").tap();
  await host.waitForSelector("#zoom-layer:not([hidden]) .spread-card", { timeout: 5000 });
  await host.waitForTimeout(450);
  const still = await host.locator("#zoom-layer").getAttribute("hidden");
  if (still !== null) throw new Error("spread closed after the finger lifted");
  const count = await host.locator(".spread-card").count();
  if (count < 1) throw new Error("spread has no cards");
  const wide = await host.locator(".spread-scroller").evaluate((el) => ({
    scroll: el.scrollWidth,
    view: el.clientWidth,
    card: el.querySelector(".spread-card")?.getBoundingClientRect().width || 0,
  }));
  if (wide.card < 140) throw new Error(`card too small on phone: ${wide.card}`);
  let acted = false;
  for (let i = 0; i < count; i += 1) {
    await host.locator(".spread-card").nth(i).tap();
    const open = await host.locator("#zoom-layer").getAttribute("hidden");
    if (open !== null) throw new Error("selecting a card closed the spread");
    const picked = await host.locator(".spread-card.is-current").count();
    if (!picked) throw new Error("selected card did not lift");
    const buttons = await host.locator("[data-spread-act]").allTextContents();
    if (buttons.length) {
      acted = true;
      const labels = buttons.join(" ");
      if (!/내기|사용|버리기|대상 선택/.test(labels)) throw new Error(`unexpected actions: ${labels}`);
      break;
    }
  }
  if (!acted) {
    const note = await host.locator(".spread-note").count();
    if (!note) throw new Error("no action and no explanation");
  }
  const closed = () => host.waitForFunction(() => document.querySelector("#zoom-layer")?.hidden === true);
  await host.locator("[data-spread-close]").tap();
  await closed();
  await host.locator(".stack.hand").tap();
  await host.waitForSelector(".spread-card");
  await host.keyboard.press("Escape");
  await closed();
  await host.locator(".stack.hand").tap();
  await host.waitForSelector(".spread-card");
  await host.locator("#zoom-layer").click({ position: { x: 8, y: 8 } });
  await closed();
  await guest.locator(".seat .stack").first().tap();
  await guest.waitForSelector("[data-spread-kind=seat] .spread-card");
  const foreignActs = await guest.locator("[data-spread-act]").count();
  if (foreignActs) throw new Error("another player's cards offered an action");
  await guest.screenshot({ path: "/opt/cursor/artifacts/spread_mobile_view.png" });
  await guest.locator("[data-spread-close]").tap();
  await host.locator(".stack.hand").tap();
  await host.waitForSelector(".spread-card.is-current, .spread-card");
  await host.locator(".spread-card").first().tap();
  await host.screenshot({ path: "/opt/cursor/artifacts/spread_mobile_hand.png" });
  console.log("SPREAD_TOUCH", room, "cards", count, "cardW", Math.round(wide.card), "scroll", wide.scroll > wide.view);
} finally {
  await browser.close();
}
