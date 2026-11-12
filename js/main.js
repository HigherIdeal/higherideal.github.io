import { ENTRY_CODE } from "./config.js";

const app = document.querySelector("#app");
const savedName = localStorage.getItem("bang-nickname") || "";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function render(error = "", shake = false) {
  app.dataset.screen = "entry";
  app.innerHTML = `
    <main class="entry">
      <form class="poster ${shake ? "is-shake" : ""}" data-form="entry" autocomplete="off">
        <div class="brand">
          <h1 class="bang">BANG!</h1>
          <p class="ko">뱅!</p>
        </div>
        <p class="tagline">서부 살롱 · 베이스 게임 · 최대 7명</p>
        <label class="field">
          <span>닉네임</span>
          <input data-field="nickname" name="nickname" maxlength="12" required placeholder="이름을 적어 주세요" value="${esc(savedName)}" />
        </label>
        <label class="field">
          <span>오늘의 암호</span>
          <input data-field="code" name="code" inputmode="numeric" maxlength="12" required placeholder="암호" autocomplete="off" />
        </label>
        <button class="enter-btn" type="submit" data-action="enter">입장</button>
        <p class="form-error" role="alert">${esc(error)}</p>
        <p class="footnote">같은 링크로 들어온 사람들만 한 테이블에 앉습니다.</p>
      </form>
    </main>
  `;
  const form = app.querySelector("[data-form=entry]");
  const nick = app.querySelector("[data-field=nickname]");
  const code = app.querySelector("[data-field=code]");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nickname = nick.value.trim();
    const entered = code.value.trim();
    if (!nickname) {
      render("닉네임을 입력하세요.", true);
      return;
    }
    if (entered !== ENTRY_CODE) {
      render("암호가 올바르지 않습니다.", true);
      app.querySelector("[data-field=nickname]").value = nickname;
      return;
    }
    localStorage.setItem("bang-nickname", nickname);
    if (!localStorage.getItem("bang-player-id")) {
      localStorage.setItem("bang-player-id", crypto.randomUUID());
    }
    sessionStorage.setItem("bang-admitted", "1");
    renderAdmitted(nickname);
  });
  if (!savedName) nick.focus();
  else code.focus();
}

function renderAdmitted(nickname) {
  app.dataset.screen = "admitted";
  app.innerHTML = `
    <main class="entry">
      <section class="poster">
        <div class="brand">
          <h1 class="bang">BANG!</h1>
          <p class="ko">뱅!</p>
        </div>
        <p class="tagline">${esc(nickname)} 님, 암호가 확인되었습니다.</p>
        <p class="footnote">살롱 문을 열고 있습니다. 잠시 후 로비가 열립니다.</p>
      </section>
    </main>
  `;
}

render();
