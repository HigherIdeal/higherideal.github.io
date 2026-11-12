import { chromium } from "playwright";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/lab/";
const code = "3913";

function roomId() {
  return `hibang${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function openPages(browser, room, count) {
  const contexts = [];
  const pages = [];
  for (let i = 0; i < count; i += 1) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await context.addInitScript((id) => {
      globalThis.__BANG_ROOM_ID = id;
    }, room);
    const page = await context.newPage();
    page.__errors = [];
    page.on("pageerror", (err) => page.__errors.push(String(err)));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    contexts.push(context);
    pages.push(page);
  }
  return { contexts, pages };
}

async function fill(page, name) {
  await page.locator("[data-field=nickname]").fill(name);
  await page.locator("[data-field=code]").fill(code);
}

async function enterAll(pages, names) {
  await Promise.all(pages.map((page, i) => fill(page, names[i])));
  await Promise.all(pages.map((page) => page.locator("[data-action=enter]").click()));
}

async function enterOne(page, name) {
  await fill(page, name);
  await page.locator("[data-action=enter]").click();
}

async function snapshot(pages) {
  const rows = [];
  for (const page of pages) {
    rows.push(await page.evaluate(() => {
      const app = document.querySelector("#app");
      const roster = [...document.querySelectorAll(".roster li")].map((li) => li.textContent.replace(/\s+/g, " ").trim());
      const status = document.querySelector(".tagline, .topbar p")?.textContent?.trim() || "";
      return {
        screen: app?.dataset.screen || "",
        statusMode: app?.dataset.status || "",
        host: app?.dataset.host || "",
        roster,
        status,
      };
    }));
  }
  return rows;
}

function sameRoom(rows, names) {
  if (rows.length !== names.length) return false;
  const hosts = rows.filter((row) => row.host === "1").length;
  if (hosts !== 1) return false;
  return rows.every((row) => row.screen === "lobby"
    && row.roster.length === names.length
    && names.every((name) => row.roster.some((line) => line.includes(name))));
}

async function waitForRoom(pages, names, timeout = 50000) {
  const deadline = Date.now() + timeout;
  let last = [];
  while (Date.now() < deadline) {
    last = await snapshot(pages);
    if (sameRoom(last, names)) return last;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`room did not converge for ${names.join(",")}\n${JSON.stringify(last, null, 2)}`);
}

async function closeAll(contexts) {
  for (const context of contexts) await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  const pairRoom = roomId();
  const pairNames = ["하나", "두리"];
  const pair = await openPages(browser, pairRoom, 2);
  await enterAll(pair.pages, pairNames);
  const paired = await waitForRoom(pair.pages, pairNames);
  const hostIndex = paired.findIndex((row) => row.host === "1");
  console.log("SIMULTANEOUS_2", pairRoom, "host", pairNames[hostIndex]);
  await pair.pages[hostIndex].reload({ waitUntil: "domcontentloaded" });
  await enterOne(pair.pages[hostIndex], pairNames[hostIndex]);
  const afterHostRefresh = await waitForRoom(pair.pages, pairNames);
  const hostAgain = afterHostRefresh.findIndex((row) => row.host === "1");
  if (hostAgain !== hostIndex) {
    throw new Error(`host changed after refresh: ${pairNames[hostIndex]} -> ${pairNames[hostAgain]}`);
  }
  console.log("HOST_REFRESH", pairNames[hostAgain]);
  await closeAll(pair.contexts);

  const crowdRoom = roomId();
  const crowdNames = ["가람", "나래", "다온", "라온"];
  const crowd = await openPages(browser, crowdRoom, 4);
  await enterAll(crowd.pages.slice(0, 2), crowdNames.slice(0, 2));
  await waitForRoom(crowd.pages.slice(0, 2), crowdNames.slice(0, 2));
  await new Promise((resolve) => setTimeout(resolve, 800));
  await enterOne(crowd.pages[2], crowdNames[2]);
  await waitForRoom(crowd.pages.slice(0, 3), crowdNames.slice(0, 3));
  await new Promise((resolve) => setTimeout(resolve, 800));
  await enterOne(crowd.pages[3], crowdNames[3]);
  const crowded = await waitForRoom(crowd.pages, crowdNames);
  console.log("STAGGERED_4", crowdRoom, crowded.map((row) => row.roster.length).join(","));
  const guestIndex = crowded.findIndex((row) => row.host !== "1");
  await crowd.pages[guestIndex].reload({ waitUntil: "domcontentloaded" });
  await enterOne(crowd.pages[guestIndex], crowdNames[guestIndex]);
  await waitForRoom(crowd.pages, crowdNames);
  console.log("GUEST_REFRESH", crowdNames[guestIndex]);
  await closeAll(crowd.contexts);

  const fourRoom = roomId();
  const fourNames = ["가람", "나래", "다온", "라온"];
  const four = await openPages(browser, fourRoom, 4);
  await enterAll(four.pages, fourNames);
  await waitForRoom(four.pages, fourNames);
  console.log("SIMULTANEOUS_4", fourRoom);
  await closeAll(four.contexts);

  const burstRoom = roomId();
  const burstNames = ["봄", "여름", "가을"];
  const burst = await openPages(browser, burstRoom, 3);
  await enterAll(burst.pages, burstNames);
  await waitForRoom(burst.pages, burstNames);
  console.log("SIMULTANEOUS_3", burstRoom);
  await closeAll(burst.contexts);
  console.log("ROOM_OK");
} finally {
  await browser.close();
}
