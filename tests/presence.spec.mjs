import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.BANG_URL || "http://127.0.0.1:8765/lab/";
const code = "3913";
const shots = "/opt/cursor/artifacts";
mkdirSync(shots, { recursive: true });

function roomId() {
  return `hibang${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function trackPeer(page, bag) {
  page.on("websocket", (socket) => {
    bag.urls.add(socket.url());
  });
  page.on("pageerror", (err) => bag.errors.push(String(err)));
}

async function openSameBrowser(browser, room, count, bag) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.addInitScript((id) => {
    globalThis.__BANG_ROOM_ID = id;
    const block = function RTCPeerConnection() {
      throw new Error("webrtc blocked");
    };
    globalThis.RTCPeerConnection = block;
    globalThis.webkitRTCPeerConnection = block;
  }, room);
  const pages = [];
  for (let i = 0; i < count; i += 1) {
    const page = await context.newPage();
    trackPeer(page, bag);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    pages.push(page);
  }
  return { context, pages };
}

async function openSeparate(browser, room, bag) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.addInitScript((id) => {
    globalThis.__BANG_ROOM_ID = id;
    const block = function RTCPeerConnection() {
      throw new Error("webrtc blocked");
    };
    globalThis.RTCPeerConnection = block;
    globalThis.webkitRTCPeerConnection = block;
  }, room);
  const page = await context.newPage();
  trackPeer(page, bag);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  return { context, page };
}

async function fill(page, name) {
  await page.locator("[data-field=nickname]").fill(name);
  await page.locator("[data-field=code]").fill(code);
}

async function enterOne(page, name) {
  await fill(page, name);
  await page.locator("[data-action=enter]").click();
}

async function roster(page) {
  return page.evaluate(() => {
    const count = document.querySelector("[data-count]")?.dataset.count || "";
    const line = document.querySelector("[data-count]")?.textContent || "";
    const people = [...document.querySelectorAll(".roster li")].map((li) => ({
      name: li.querySelector("span")?.textContent?.trim() || "",
      presence: li.dataset.presence || "",
    }));
    return {
      count,
      line,
      people,
      host: document.querySelector("#app")?.dataset.host || "",
      status: document.querySelector("#app")?.dataset.status || "",
      screen: document.querySelector("#app")?.dataset.screen || "",
    };
  });
}

async function waitForNames(pages, names, timeout = 50000) {
  const deadline = Date.now() + timeout;
  let last = [];
  while (Date.now() < deadline) {
    last = [];
    for (const page of pages) last.push(await roster(page));
    const ready = last.length === pages.length && last.every((row) => {
      const got = row.people.map((p) => p.name);
      return row.screen === "lobby"
        && row.count === String(names.length)
        && row.line.includes(`${names.length}/7`)
        && names.every((name) => got.includes(name))
        && got.length === names.length;
    });
    const hosts = last.filter((row) => row.host === "1").length;
    if (ready && hosts === 1) return last;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`roster did not converge\n${JSON.stringify(last, null, 2)}`);
}

async function identity(page) {
  return page.evaluate(() => {
    const tray = document.querySelector(".self-tray");
    const hand = [...document.querySelectorAll("[data-hand-card]")].map((el) => el.getAttribute("data-card-id")).sort();
    const equips = [...(tray?.querySelectorAll("[data-equip]") || [])].map((el) => el.getAttribute("data-equip")).sort();
    return {
      name: tray?.querySelector("strong")?.textContent || "",
      role: tray?.querySelector(".role-card img")?.getAttribute("alt") || "",
      character: tray?.querySelector(".char-card img")?.getAttribute("alt") || "",
      hp: tray?.querySelectorAll(".bullets i.on").length || 0,
      hand,
      equips,
      screen: document.querySelector("#app")?.dataset.screen || "",
    };
  });
}

function sameIdentity(before, after) {
  return before.name === after.name
    && before.role === after.role
    && before.character === after.character
    && before.hp === after.hp
    && before.hand.join() === after.hand.join()
    && before.equips.join() === after.equips.join()
    && after.screen === "play";
}

const browser = await chromium.launch({
  headless: true,
  args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--disable-features=WebRtc"],
});
const peer = { urls: new Set(), errors: [] };
try {
  const room = roomId();
  const names = ["가람", "나래", "다온", "라온"];
  const same = await openSameBrowser(browser, room, 4, peer);
  const firstScreen = await same.pages[0].locator("#app").getAttribute("data-screen");
  const firstLine = await same.pages[0].locator(".tagline").innerText();
  const nicknameFields = await same.pages[0].locator("[data-field=nickname]").count();
  if (firstScreen !== "entry" || nicknameFields !== 1 || firstLine.includes("중계") || firstLine.includes("찾는")) {
    throw new Error(`entry screen did not show first: ${firstScreen} ${firstLine} fields=${nicknameFields}`);
  }
  await Promise.all(same.pages.map((page, i) => fill(page, names[i])));
  await Promise.all(same.pages.map((page) => page.locator("[data-action=enter]").click()));
  await waitForNames(same.pages, names);

  const ids = await Promise.all(same.pages.map((page) => page.evaluate(() => sessionStorage.getItem("bang-player-id"))));
  if (new Set(ids).size !== 4) throw new Error(`tabs shared a playerId: ${ids.join(",")}`);
  const leaked = await same.pages[0].evaluate(() => localStorage.getItem("bang-player-id"));
  if (leaked) throw new Error("playerId was written to shared localStorage");

  const other = await openSeparate(browser, room, peer);
  await enterOne(other.page, "가람");
  const five = [...names.slice(0, 1), "가람(2)", ...names.slice(1)];
  const joined = await waitForNames([...same.pages, other.page], five);
  if (joined.some((row) => row.status === "replaced")) throw new Error("a distinct tab was treated as a duplicate");
  const sockets = [...peer.urls];
  if (sockets.some((url) => url.includes("peerjs") || url.includes("stun:") || url.includes("turn:"))) {
    throw new Error(`still using a peer-to-peer path: ${sockets.join(" ")}`);
  }
  if (!sockets.some((url) => url.includes("relay.open-rooms.dev") || url.includes("itty.ws"))) {
    throw new Error(`no public relay socket: ${sockets.join(" ") || "none"}`);
  }
  if (peer.errors.some((err) => err.includes("webrtc blocked"))) {
    throw new Error(`game tried to open WebRTC: ${peer.errors.join(" | ")}`);
  }
  console.log("FIVE_TOGETHER", room, "relay", sockets.find((url) => url.includes("relay.open-rooms.dev") || url.includes("itty.ws")));
  await same.pages[0].screenshot({ path: `${shots}/roster_relay_five.png` });

  const fifthId = await other.page.evaluate(() => sessionStorage.getItem("bang-player-id"));
  await other.page.close();
  const offlineDeadline = Date.now() + 20000;
  let offline = null;
  while (Date.now() < offlineDeadline) {
    offline = await roster(same.pages[0]);
    const ghost = offline.people.find((p) => p.name === "가람(2)");
    if (ghost?.presence === "off" && offline.count === "5") break;
    offline = null;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (!offline) throw new Error("offline mark did not appear on the roster");
  await same.pages[0].screenshot({ path: `${shots}/roster_relay_offline.png` });
  console.log("OFFLINE_MARK", offline.people.map((p) => `${p.name}:${p.presence}`).join(" "));

  const returned = await other.context.newPage();
  trackPeer(returned, peer);
  await returned.addInitScript((id) => {
    sessionStorage.setItem("bang-player-id", id);
  }, fifthId);
  await returned.goto(base, { waitUntil: "domcontentloaded" });
  await enterOne(returned, "가람");
  await waitForNames([...same.pages, returned], five);

  let host = same.pages[0];
  for (const page of same.pages) {
    if (await page.locator("#app").getAttribute("data-host") === "1") host = page;
  }
  const hostName = names[same.pages.indexOf(host)];
  await host.locator("[data-action=start]").click();
  const playing = [...same.pages, returned];
  for (const page of playing) {
    await page.waitForSelector("[data-char]", { timeout: 25000 });
    await page.locator("[data-char]").first().click();
  }
  try {
    for (const page of playing) await page.waitForSelector("[data-screen=play]", { timeout: 25000 });
  } catch (err) {
    const stuck = [];
    for (const page of playing) {
      stuck.push(await page.evaluate(() => ({
        screen: document.querySelector("#app")?.dataset.screen,
        status: document.querySelector("#app")?.dataset.status,
        text: document.querySelector(".topbar p, .tagline")?.textContent || "",
        chars: document.querySelectorAll("[data-char]").length,
      })));
    }
    throw new Error(`${err.message}\n${JSON.stringify(stuck, null, 2)}`);
  }

  const guest = same.pages.find((page) => page !== host);
  const guestName = names[same.pages.indexOf(guest)];
  const before = await identity(guest);
  const guestId = await guest.evaluate(() => sessionStorage.getItem("bang-player-id"));
  if (!before.hand.length || !before.role || !before.character) throw new Error(`seat was not dealt: ${JSON.stringify(before)}`);
  await guest.reload({ waitUntil: "domcontentloaded" });
  await enterOne(guest, guestName);
  await guest.waitForSelector("[data-screen=play]", { timeout: 30000 });
  const afterId = await guest.evaluate(() => sessionStorage.getItem("bang-player-id"));
  if (afterId !== guestId) throw new Error("refresh minted a new playerId");
  const after = await identity(guest);
  if (!sameIdentity(before, after)) throw new Error(`seat changed on refresh\n${JSON.stringify({ before, after })}`);
  console.log("GUEST_REFRESH", guestName, before.character, before.hand.length);

  const witness = playing.find((page) => page !== host && page !== guest);
  const witnessBefore = await identity(witness);
  await host.reload({ waitUntil: "domcontentloaded" });
  await enterOne(host, hostName);
  await host.waitForSelector("[data-screen=play]", { timeout: 30000 });
  const hostBack = Date.now() + 30000;
  let witnessAfter = null;
  while (Date.now() < hostBack) {
    witnessAfter = await identity(witness);
    const hostScreen = await host.locator("#app").getAttribute("data-screen");
    const hostFlag = await host.locator("#app").getAttribute("data-host");
    if (hostScreen === "play" && hostFlag === "1" && sameIdentity(witnessBefore, witnessAfter)) break;
    witnessAfter = null;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (!witnessAfter) throw new Error("host refresh did not keep the game");
  console.log("HOST_REFRESH", hostName);

  const duplicateTarget = playing.find((page) => page !== host && page !== guest && page !== witness);
  const duplicateName = names[same.pages.indexOf(duplicateTarget)];
  const duplicateId = await duplicateTarget.evaluate(() => sessionStorage.getItem("bang-player-id"));
  const seatBefore = await identity(duplicateTarget);
  const dup = await same.context.newPage();
  trackPeer(dup, peer);
  await dup.addInitScript((id) => {
    sessionStorage.setItem("bang-player-id", id);
  }, duplicateId);
  await dup.goto(base, { waitUntil: "domcontentloaded" });
  await enterOne(dup, duplicateName);
  await duplicateTarget.waitForFunction(() => document.querySelector("#app")?.dataset.status === "replaced", null, { timeout: 25000 });
  try {
    await dup.waitForSelector("[data-screen=play]", { timeout: 30000 });
  } catch (err) {
    const snap = await dup.evaluate(() => ({
      status: document.querySelector("#app")?.dataset.status,
      screen: document.querySelector("#app")?.dataset.screen,
      text: document.querySelector(".tagline, .topbar p")?.textContent || "",
      id: sessionStorage.getItem("bang-player-id"),
    }));
    throw new Error(`${err.message} dup=${JSON.stringify(snap)}`);
  }
  const taken = await identity(dup);
  if (!sameIdentity(seatBefore, taken)) throw new Error(`duplicate tab did not take the seat\n${JSON.stringify({ seatBefore, taken })}`);
  const namesNow = await witness.evaluate(() => [...document.querySelectorAll(".seat strong, .self-tray strong")].map((el) => el.textContent));
  if (namesNow.filter((name) => name === duplicateName).length !== 1) {
    throw new Error(`duplicate id became a second player: ${namesNow.join(",")}`);
  }
  console.log("DUPLICATE_TAB", duplicateName);
  console.log("PRESENCE_OK");
} finally {
  await browser.close();
}
