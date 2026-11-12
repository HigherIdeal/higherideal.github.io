import { ENTRY_CODE } from "./config.js?v=12";
import { connect } from "./net.js?v=12";
import { mount } from "./ui.js?v=12";

const app = document.querySelector("#app");
let link = null;
let view = null;
let status = { mode: "entry", text: "" };
let toast = "";
let entryError = "";
let savedName = "";
let toastTimer = 0;

function draw() {
  mount(app, {
    view,
    status,
    toast,
    entryError,
    savedName,
    onEnter: enter,
    onAction: (action) => link?.send(action),
    onToast: showToast,
    onTakeOver: () => link?.takeOver(),
    onLeave: () => location.reload(),
  });
}

function showToast(text) {
  toast = text || "";
  draw();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = "";
    draw();
  }, 2600);
}

function enter(nickname, code) {
  if (!nickname) {
    entryError = "닉네임을 입력하세요.";
    draw();
    return;
  }
  if (code !== ENTRY_CODE) {
    savedName = nickname;
    entryError = "암호가 올바르지 않습니다.";
    draw();
    return;
  }
  if (link) return;
  savedName = nickname;
  entryError = "";
  localStorage.setItem("bang-nickname", nickname);
  // This tab's id. sessionStorage survives a refresh of this tab and is not shared with other tabs.
  let playerId = sessionStorage.getItem("bang-player-id");
  if (!playerId) {
    playerId = crypto.randomUUID();
    sessionStorage.setItem("bang-player-id", playerId);
  }
  status = { mode: "search", text: "중계에 연결하는 중…" };
  link = connect({
    playerId,
    nickname,
    onView(next) {
      view = next;
      draw();
    },
    onStatus(next) {
      status = next;
      draw();
    },
    onToast: showToast,
  });
  draw();
}

draw();
