const DOC_PATH = "./doc.yaml";
const YAML_CDN = "https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js";

const LEVEL_META = {
  native: { label: "Native", width: 100 },
  expert: { label: "Expert", width: 92 },
  advanced: { label: "Advanced", width: 82 },
  intermediate: { label: "Intermediate", width: 64 },
  beginner: { label: "Beginner", width: 45 },
};
let navScrollRafId = null;
let navFrameBound = false;
let navDragBound = false;
const AVATAR_MORPH_MS = 920;
const SIDEBAR_SITE_LABELS = ["HIGHERIDEAL", "HigherIdeal", "HIGHER__IDEAL", "더높은이상을향해"];
const SIDEBAR_TYPING_HOLD_MS = 10000;
const SIDEBAR_TYPING_TOTAL_MS = 1000;
const SIDEBAR_DELETE_TOTAL_MS = 500;
const SIDEBAR_PHRASE_GAP_MS = 260;
let sidebarTypingTimerId = null;
let sidebarTypingRunId = 0;
let viewportResetBound = false;
let viewportResetBlocked = false;
const viewportResetTimeoutIds = new Set();
const viewportResetRafIds = new Set();
const NAV_CONTENT_ORDER = [
  { id: "publications", label: "Publications" },
  { id: "patents", label: "Patents" },
  { id: "projects", label: "Projects" },
  { id: "cv", label: "CV" },
];
const NAV_INITIAL_Y_NUDGE = -8;

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function isFilled(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function pick(...values) {
  for (const value of values) {
    if (isFilled(value)) return String(value).trim();
  }
  return "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function joinWithDot(parts) {
  return parts.filter(isFilled).map((v) => String(v).trim()).join(" · ");
}

function formatPeriod(start, end) {
  const s = pick(start);
  const e = pick(end);
  if (!s && !e) return "";
  if (!e) return `${s} - Present`;
  return `${s} - ${e}`;
}

function formatLevel(levelText) {
  const key = String(levelText || "").toLowerCase().trim();
  const info = LEVEL_META[key] || { label: pick(levelText, "Intermediate"), width: 60 };
  return info;
}

function summarizeText(text, max = 180) {
  const clean = pick(text).replace(/\s+/g, " ");
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}...`;
}

function normalizeNameKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9\uac00-\ud7a3]/g, "");
}

function formatAuthorsHtml(authorsText, personal = {}) {
  const raw = pick(authorsText);
  if (!raw) return "";

  const myKeys = [personal.name_en, personal.name_ko]
    .map((name) => normalizeNameKey(name))
    .filter(Boolean);

  const parts = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length === 0) return escapeHtml(raw);

  return parts
    .map((part) => {
      const key = normalizeNameKey(part);
      const mine = myKeys.some((myKey) => key.includes(myKey));
      const safe = escapeHtml(part);
      return mine ? `<strong>${safe}</strong>` : safe;
    })
    .join(", ");
}

function publicationIndexLabel(pub = {}) {
  const haystack = [
    pick(pub.type),
    pick(pub.journal),
    pick(pub.journal_abbr),
    pick(pub.conference),
    pick(pub.conference_abbr),
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("kci")) return "KCI";
  if (haystack.includes("sci")) return "SCI";
  return "";
}

function patentStatusLabel(status) {
  const s = String(status || "").toLowerCase().trim();
  if (s.includes("registered")) return "Registered";
  if (s.includes("filed")) return "Filed";
  if (s.includes("pending")) return "Pending";
  if (s.includes("abandoned")) return "Abandoned";
  return pick(status);
}

function publicationStatusLabel(status) {
  const s = String(status || "").toLowerCase().trim();
  if (s.includes("under_review") || s.includes("under review")) return "Under Review";
  if (s.includes("published")) return "Published";
  if (s.includes("accepted")) return "Accepted";
  if (s.includes("in_preparation") || s.includes("in preparation")) return "In Preparation";
  return pick(status);
}

function clearPendingViewportResetJobs() {
  viewportResetTimeoutIds.forEach((id) => clearTimeout(id));
  viewportResetTimeoutIds.clear();
  viewportResetRafIds.forEach((id) => cancelAnimationFrame(id));
  viewportResetRafIds.clear();
}

function bindViewportResetCancelOnUserInput() {
  if (viewportResetBound) return;
  viewportResetBound = true;

  const stopReset = () => {
    viewportResetBlocked = true;
    clearPendingViewportResetJobs();
  };

  ["pointerdown", "wheel", "touchstart", "keydown"].forEach((type) => {
    window.addEventListener(type, stopReset, { capture: true, passive: true });
  });
}

function resetInitialViewport() {
  bindViewportResetCancelOnUserInput();
  if (viewportResetBlocked) return;
  clearPendingViewportResetJobs();

  if (window.location.hash) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  const root = document.documentElement;
  const prevBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";

  const reset = () => {
    if (viewportResetBlocked) return;
    window.scrollTo(0, 0);
    root.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  };

  reset();
  const rafId = requestAnimationFrame(() => {
    viewportResetRafIds.delete(rafId);
    reset();
    root.style.scrollBehavior = prevBehavior;
  });
  viewportResetRafIds.add(rafId);
  const timeout0 = setTimeout(() => {
    viewportResetTimeoutIds.delete(timeout0);
    reset();
  }, 0);
  const timeout90 = setTimeout(() => {
    viewportResetTimeoutIds.delete(timeout90);
    reset();
    root.style.scrollBehavior = prevBehavior;
  }, 90);
  viewportResetTimeoutIds.add(timeout0);
  viewportResetTimeoutIds.add(timeout90);
}

function applyFonts(doc = {}) {
  const fonts = doc.fonts || {};
  const korean = pick(fonts.korean, "Pretendard");
  const englishBody = pick(fonts.english_body, "IBM Plex Sans");
  const englishHeading = pick(fonts.english_heading, "Lora");
  const englishMono = pick(fonts.english_mono, "IBM Plex Mono");

  if (document.body) {
    document.body.style.fontFamily = `'${korean}', '${englishBody}', sans-serif`;
  }

  qsa(".sb-name, .hero h1, .sec-head h2").forEach((el) => {
    el.style.fontFamily = `'${englishHeading}', '${korean}', serif`;
  });

  qsa(
    ".sb-title, .sb-label, .skill-tag, .hero-eyebrow, .exp-company, .exp-period, .exp-loc, .exp-tag, .edu-school, .edu-year, .pub-venue, .pub-year, .pub-link, .pub-doi, .pub-doi-link, .top-nav-title",
  ).forEach((el) => {
    el.style.fontFamily = `'${englishMono}', '${korean}', monospace`;
  });
}

function getDomainPath(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return String(url);
  }
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&amp;|&/g, " and ")
    .replace(/[^a-z0-9\uac00-\ud7a3\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function findSectionByKeywords(keywords = [], exclude = new Set()) {
  const lowered = keywords.map((k) => String(k || "").toLowerCase().trim()).filter(Boolean);
  if (lowered.length === 0) return null;

  return qsa("main section").find((section) => {
    if (!section || exclude.has(section)) return false;
    const heading = pick(qs(".sec-head h2", section)?.textContent).toLowerCase();
    return lowered.some((key) => heading.includes(key));
  }) || null;
}

function ensureSectionHeader(section, title) {
  if (!section) return;

  let head = qs(".sec-head", section);
  if (!head) {
    head = document.createElement("div");
    head.className = "sec-head";
    section.insertAdjacentElement("afterbegin", head);
  }

  let h2 = qs("h2", head);
  if (!h2) {
    h2 = document.createElement("h2");
    head.appendChild(h2);
  }
  h2.textContent = title;

  let line = qs(".sec-line", head);
  if (!line) {
    line = document.createElement("div");
    line.className = "sec-line";
    head.appendChild(line);
  }
}

function ensureSectionList(section, listClass, extraClasses = []) {
  if (!section) return null;
  let list = qs(`.${listClass}`, section);

  if (!list) {
    const candidates = qsa(":scope > div", section).filter((el) => !el.classList.contains("sec-head"));
    if (candidates.length > 0) {
      list = candidates[0];
    } else {
      list = document.createElement("div");
      section.appendChild(list);
    }
  }

  list.classList.add(listClass);
  extraClasses.forEach((className) => {
    if (isFilled(className)) list.classList.add(className);
  });
  return list;
}

function createSection(main, id, title, listClass, extraListClasses = []) {
  const section = document.createElement("section");
  section.id = id;
  ensureSectionHeader(section, title);
  ensureSectionList(section, listClass, extraListClasses);
  main.appendChild(section);
  return section;
}

function ensureOverviewStructure(main) {
  const hero = qs(".hero", main);
  if (!hero) return null;
  hero.id = "overview";

  let head = qs(".overview-head", hero);
  if (!head) {
    head = document.createElement("div");
    head.className = "sec-head overview-head";
    hero.insertAdjacentElement("afterbegin", head);
  }

  let h2 = qs("h2", head);
  if (!h2) {
    h2 = document.createElement("h2");
    head.appendChild(h2);
  }
  h2.textContent = "Overview";

  let line = qs(".sec-line", head);
  if (!line) {
    line = document.createElement("div");
    line.className = "sec-line";
    head.appendChild(line);
  }

  let subsection = qs("#educations.overview-subsection", hero);
  if (!subsection) {
    subsection = document.createElement("section");
    subsection.id = "educations";
    subsection.className = "overview-subsection";
    subsection.innerHTML = `
      <div class="overview-subtitle">Educations</div>
      <div class="overview-edu-list"></div>
    `;
    hero.appendChild(subsection);
  } else {
    let title = qs(".overview-subtitle", subsection);
    if (!title) {
      title = document.createElement("div");
      title.className = "overview-subtitle";
      subsection.insertAdjacentElement("afterbegin", title);
    }
    title.textContent = "Educations";

    if (!qs(".overview-edu-list", subsection)) {
      const list = document.createElement("div");
      list.className = "overview-edu-list";
      subsection.appendChild(list);
    }
  }

  return subsection;
}

function ensureMainSectionStructure() {
  const main = qs("main.main");
  if (!main) return [];

  const legacyEducationSection = qsa("main > section").find((section) => {
    if (section.id === "educations") return true;
    const heading = pick(qs(".sec-head h2", section)?.textContent).toLowerCase();
    return heading.includes("education");
  });
  if (legacyEducationSection) {
    legacyEducationSection.id = "educations-legacy";
    legacyEducationSection.style.display = "none";
  }

  ensureOverviewStructure(main);

  const used = new Set();
  const educationSubsection = qs("#educations");
  if (educationSubsection) used.add(educationSubsection);

  const publicationSection =
    qs("#publications", main) ||
    findSectionByKeywords(["publication", "paper"], used) ||
    createSection(main, "publications", "Publications", "pub-list");
  used.add(publicationSection);
  publicationSection.id = "publications";
  ensureSectionHeader(publicationSection, "Publications");
  ensureSectionList(publicationSection, "pub-list");

  const patentsSection =
    qs("#patents", main) ||
    findSectionByKeywords(["patent"], used) ||
    createSection(main, "patents", "Patents", "patent-list", ["pub-list"]);
  used.add(patentsSection);
  patentsSection.id = "patents";
  ensureSectionHeader(patentsSection, "Patents");
  ensureSectionList(patentsSection, "patent-list", ["pub-list"]);

  const projectsSection =
    qs("#projects", main) ||
    findSectionByKeywords(["project"], used) ||
    createSection(main, "projects", "Projects", "project-list", ["pub-list"]);
  used.add(projectsSection);
  projectsSection.id = "projects";
  ensureSectionHeader(projectsSection, "Projects");
  ensureSectionList(projectsSection, "project-list", ["pub-list"]);

  const cvSection =
    qs("#cv", main) ||
    findSectionByKeywords(["cv", "curriculum vitae", "resume"], used) ||
    createSection(main, "cv", "CV", "cv-list", ["pub-list"]);
  used.add(cvSection);
  cvSection.id = "cv";
  ensureSectionHeader(cvSection, "CV");
  ensureSectionList(cvSection, "cv-list", ["pub-list"]);

  const experienceSection = findSectionByKeywords(["experience"], used);
  if (experienceSection) experienceSection.style.display = "none";

  [publicationSection, patentsSection, projectsSection, cvSection].forEach((section) => {
    if (section && section.parentElement === main) main.appendChild(section);
  });

  return NAV_CONTENT_ORDER.filter((item) => document.getElementById(item.id));
}

function ensureNavigatorSection() {
  const main = qs(".main");
  if (!main) return null;
  main.classList.add("top-nav-enabled");
  document.body.classList.add("layout-centered");

  let navSection = qs(".top-nav-wrap", main);
  if (!navSection) {
    navSection = document.createElement("nav");
    navSection.className = "top-nav-wrap";
    navSection.setAttribute("aria-label", "Section navigation");
    main.insertAdjacentElement("afterbegin", navSection);
  }

  let styleTag = qs("#top-nav-style");
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = "top-nav-style";
    styleTag.textContent = `
      .main.top-nav-enabled {
        --scroll-tail: 0px;
        padding-top: 0;
      }
      .main.top-nav-enabled::after {
        content: "";
        display: block;
        height: var(--scroll-tail);
      }
      .main.top-nav-enabled .hero,
      .main.top-nav-enabled section {
        scroll-margin-top: 8px;
      }
      @media (min-width: 861px) {
        body.layout-centered {
          justify-content: center;
          padding-left: 20px;
          padding-right: 20px;
        }
        body.layout-centered .main {
          flex: 0 1 auto;
          width: min(980px, calc(100vw - var(--sidebar-w) - 96px));
        }
      }
      .top-nav-wrap {
        position: fixed;
        z-index: 320;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: fit-content;
        max-width: min(96vw, 1200px);
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid var(--border);
        border-radius: 12px;
        backdrop-filter: blur(6px);
        padding: 13px 12px;
        cursor: grab;
        touch-action: none;
        user-select: none;
        -webkit-user-drag: none;
      }
      .top-nav-wrap * {
        -webkit-user-drag: none;
      }
      .top-nav-wrap.is-dragging {
        cursor: grabbing;
      }
      .top-nav-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        justify-content: center;
        align-items: center;
      }
      .top-nav-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        text-decoration: none;
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--white);
        padding: 6px 10px;
        font-size: 11px;
        line-height: 1.2;
        transition: background 0.18s, color 0.18s, border-color 0.18s;
        user-select: none;
        -webkit-user-drag: none;
      }
      .top-nav-link:hover {
        background: var(--accent-lt);
        color: var(--accent);
        border-color: #b6caef;
      }
      .top-nav-link .c-icon {
        width: 18px;
        height: 18px;
        font-size: 9px;
      }
      .top-nav-title {
        font-size: 9.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
        margin: 0 0 8px;
        text-align: center;
      }
      .hero .overview-head {
        margin-top: 18px;
        margin-bottom: 16px;
      }
      .hero h1 .hero-name-line {
        display: inline-block;
      }
      #educations.overview-subsection {
        margin-top: 26px;
      }
      #educations .overview-subtitle {
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.02em;
        margin-bottom: 10px;
      }
      #educations .overview-edu-list {
        position: relative;
        margin-left: 2px;
        padding-left: 24px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      #educations .overview-edu-list::before {
        content: "";
        position: absolute;
        left: 7px;
        top: 4px;
        bottom: 4px;
        width: 1.5px;
        background: #cfcfcf;
      }
      #educations .overview-edu-item {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      #educations .overview-edu-item::before {
        content: "";
        position: absolute;
        left: -20px;
        top: 6px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #b4b4b4;
      }
      #educations .overview-edu-period {
        font-family: 'IBM Plex Mono', 'Pretendard', monospace;
        font-size: 10.8px;
        color: #8b8b8b;
        letter-spacing: 0.02em;
      }
      #educations .overview-edu-main {
        font-size: 14px;
        color: #3d3d3d;
        font-weight: 500;
      }
      #educations .overview-edu-detail {
        font-size: 12.8px;
        color: var(--muted);
        line-height: 1.65;
      }
      .pub-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }
      .pub-venue {
        background: #9fa5af;
        border-color: #959ca7;
        color: #fff;
      }
      .pub-venue-under-review {
        background: #9fa5af;
        border-color: #959ca7;
        color: #fff;
      }
      .pub-index {
        margin-left: auto;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8b8b8b;
      }
      .pub-index-sci {
        color: #2f61c6;
        font-weight: 600;
      }
      .pub-index-kci {
        color: #7a7a7a;
      }
      .pub-authors {
        font-size: 12.5px;
        color: #6f6f6f;
        line-height: 1.62;
        margin-bottom: 8px;
      }
      .pub-authors strong {
        font-weight: 700;
        color: #3a3a3a;
      }
      .pub-card.pub-card-indexed {
        position: relative;
        overflow: visible;
      }
      .pub-card.pub-card-sci {
        background: #f3f7ff;
        border-color: #d3def3;
      }
      .pub-card.pub-card-sci:hover {
        border-color: #c0d0ee;
      }
      .pub-serial-mark {
        position: absolute;
        top: -11px;
        left: 14px;
        padding: 1px 10px 2px;
        border: 1px solid #d2d0cb;
        border-radius: 999px;
        background: #f2f1ee;
        color: #8f8f8f;
        font-family: 'IBM Plex Mono', 'Pretendard', monospace;
        font-size: 10px;
        font-weight: 500;
        line-height: 1.2;
        letter-spacing: 0.08em;
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
        pointer-events: none;
        user-select: none;
      }
      .pub-card.pub-card-indexed .pub-meta {
        margin-top: 2px;
      }
      .pub-doi {
        font-size: 11.6px;
        color: #b3b3b3;
        line-height: 1.45;
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
      }
      .pub-doi-label {
        color: #b7b7b7;
        letter-spacing: 0.03em;
        flex: 0 0 auto;
      }
      .pub-doi-sep {
        color: #c3c3c3;
        flex: 0 0 auto;
      }
      .pub-doi-link,
      .pub-doi-link:visited,
      .pub-doi-link:hover,
      .pub-doi-link:active {
        color: inherit;
        text-decoration: none;
        display: inline-block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pub-foot-meta {
        margin-top: 4px;
        margin-bottom: 2px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        min-height: 18px;
        gap: 10px;
      }
      .pub-foot-meta .pub-doi {
        grid-column: 1;
      }
      .pub-foot-meta .pub-status {
        grid-column: 2;
      }
      .pub-foot {
        margin-top: 8px;
        display: flex;
        align-items: center;
      }
      .pub-foot .pub-link {
        margin-top: 0;
      }
      .pub-status {
        font-size: 10.5px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #aaaaaa;
        white-space: nowrap;
        justify-self: end;
      }
      @media (max-width: 860px) {
        .main.top-nav-enabled {
          padding-top: 0;
        }
        .top-nav-wrap {
          padding: 11px 10px;
        }
      }
    `;
    document.head.appendChild(styleTag);
  }

  return navSection;
}

function syncNavigatorFrame() {
  const nav = qs(".top-nav-wrap");
  const main = qs(".main");
  if (!nav || !main) return;

  const isMobile = window.innerWidth <= 860;
  const edgePad = 8;
  const mainRect = main.getBoundingClientRect();
  const computed = window.getComputedStyle(main);
  const padLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const padRight = Number.parseFloat(computed.paddingRight) || 0;
  const innerLeft = Math.max(edgePad, mainRect.left + padLeft);
  const innerRight = Math.min(window.innerWidth - edgePad, mainRect.right - padRight);
  const innerWidth = Math.max(220, innerRight - innerLeft);
  const maxWidth = Math.min(Math.floor(innerWidth), isMobile ? window.innerWidth - 16 : 560);

  nav.style.maxWidth = `${maxWidth}px`;
  nav.style.right = "auto";
  nav.style.transform = "none";

  if (nav.dataset.dragged === "1") {
    // Keep user drag position as-is.
  } else if (nav.dataset.initialPlaced !== "1") {
    const anchor = getNavigatorOverviewAnchorRect();
    nav.style.top = `${Math.round(anchor.top)}px`;
    nav.style.left = `${Math.round(anchor.left)}px`;
    nav.dataset.initialPlaced = "1";
  }

  clampNavigatorToViewport(nav);
  updateScrollTailAllowance();
}

function bindNavigatorFrameSync() {
  if (navFrameBound) return;
  navFrameBound = true;

  window.addEventListener("resize", syncNavigatorFrame);
  window.addEventListener("orientationchange", syncNavigatorFrame);
  window.addEventListener(
    "load",
    () => {
      const nav = qs(".top-nav-wrap");
      if (nav && nav.dataset.dragged !== "1") {
        nav.dataset.initialPlaced = "0";
      }
      syncNavigatorFrame();
      requestAnimationFrame(syncNavigatorFrame);
    },
    { once: true },
  );

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      const nav = qs(".top-nav-wrap");
      if (nav && nav.dataset.dragged !== "1") {
        nav.dataset.initialPlaced = "0";
      }
      syncNavigatorFrame();
    });
  }
}

function getNavigatorOverviewAnchorRect() {
  const main = qs(".main");
  const nav = qs(".top-nav-wrap");
  const hero = qs(".hero");
  const overviewHead = qs(".hero .overview-head");
  const overviewName = qs(".hero h1 .hero-name-line") || qs(".hero h1");
  if (!main || !nav || !hero) {
    return { top: 0, left: 16 };
  }

  const edgePad = 8;
  const mainRect = main.getBoundingClientRect();
  const computed = window.getComputedStyle(main);
  const padRight = Number.parseFloat(computed.paddingRight) || 0;
  const fallbackRight = Math.min(window.innerWidth - edgePad, mainRect.right - padRight);

  const rightCandidates = qsa(".pub-card, .exp-card, .edu-card")
    .filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
    })
    .map((el) => el.getBoundingClientRect().right);
  const rightEdge = rightCandidates.length > 0 ? Math.max(...rightCandidates) : fallbackRight;

  const anchorRect = (overviewName || overviewHead || hero).getBoundingClientRect();
  const navRect = nav.getBoundingClientRect();
  // Align vertical center of navigator with the Overview name block.
  const proposedTop = anchorRect.top + anchorRect.height / 2 - navRect.height / 2 + NAV_INITIAL_Y_NUDGE;
  // Align navigator to the right edge of section cards.
  const proposedLeft = rightEdge - navRect.width;

  const minLeft = edgePad;
  const maxLeft = Math.max(edgePad, window.innerWidth - navRect.width - edgePad);
  const top = Math.max(0, proposedTop);
  const left = Math.min(Math.max(proposedLeft, minLeft), maxLeft);
  return { top, left };
}

function clampNavigatorToViewport(nav) {
  if (!nav) return;
  const edgePad = 8;
  const rect = nav.getBoundingClientRect();
  const rawTop = Number.parseFloat(nav.style.top);
  const rawLeft = Number.parseFloat(nav.style.left);
  const currentTop = Number.isFinite(rawTop) ? rawTop : rect.top;
  const currentLeft = Number.isFinite(rawLeft) ? rawLeft : rect.left;
  const minTop = 0;
  const maxTop = Math.max(minTop, window.innerHeight - rect.height - edgePad);
  const maxLeft = Math.max(edgePad, window.innerWidth - rect.width - edgePad);

  nav.style.top = `${Math.round(Math.min(Math.max(currentTop, minTop), maxTop))}px`;
  nav.style.left = `${Math.round(Math.min(Math.max(currentLeft, edgePad), maxLeft))}px`;
}

function bindNavigatorDrag() {
  const nav = qs(".top-nav-wrap");
  if (!nav || navDragBound) return;
  navDragBound = true;

  nav.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });

  let dragStarted = false;
  let pointerStartedOnLink = false;
  let suppressClick = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  const dragThreshold = 7;

  const finishDrag = (didDrag = false) => {
    if (pointerId !== null) {
      try {
        nav.releasePointerCapture(pointerId);
      } catch {}
    }
    pointerId = null;
    dragStarted = false;
    pointerStartedOnLink = false;
    nav.classList.remove("is-dragging");
    if (didDrag) {
      nav.dataset.lastDragTs = String(Date.now());
    }
    suppressClick = didDrag;
    if (didDrag) {
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
  };

  const stopDrag = (event) => {
    if (pointerId === null) return;
    if (event && Number.isInteger(event.pointerId) && event.pointerId !== pointerId) return;
    finishDrag(dragStarted);
  };

  nav.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const downOnLink = Boolean(event.target && event.target.closest(".top-nav-link"));
    pointerStartedOnLink = downOnLink;

    const rect = nav.getBoundingClientRect();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    dragStarted = false;
    suppressClick = false;
    try {
      nav.setPointerCapture(pointerId);
    } catch {}
    if (!downOnLink) {
      event.preventDefault();
    }
  });

  nav.addEventListener("pointermove", (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    if (event.pointerType === "mouse" && (event.buttons & 1) === 0) {
      finishDrag(false);
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const activeThreshold = pointerStartedOnLink ? 2 : dragThreshold;
    if (!dragStarted && Math.hypot(deltaX, deltaY) < activeThreshold) return;

    if (!dragStarted) {
      dragStarted = true;
      nav.classList.add("is-dragging");
    }

    event.preventDefault();
    nav.dataset.dragged = "1";
    nav.style.left = `${Math.round(startLeft + deltaX)}px`;
    nav.style.top = `${Math.round(startTop + deltaY)}px`;
    clampNavigatorToViewport(nav);
  });

  nav.addEventListener(
    "click",
    (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    },
    true,
  );

  nav.addEventListener("lostpointercapture", stopDrag);
  nav.addEventListener("pointerup", stopDrag);
  nav.addEventListener("pointercancel", stopDrag);
  window.addEventListener("pointerup", stopDrag, true);
  window.addEventListener("pointercancel", stopDrag, true);
  window.addEventListener(
    "blur",
    () => {
      finishDrag(false);
    },
    true,
  );
}

function updateScrollTailAllowance() {
  const main = qs(".main");
  if (!main) return;

  const ids = ["overview", ...NAV_CONTENT_ORDER.map((item) => item.id)];
  const targets = ids
    .map((id) => document.getElementById(id))
    .filter((el) => el && window.getComputedStyle(el).display !== "none");

  if (targets.length === 0) {
    main.style.setProperty("--scroll-tail", "0px");
    return;
  }

  const offset = getNavigatorOffset();
  let maxTargetY = 0;
  targets.forEach((target) => {
    const y = Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset);
    if (y > maxTargetY) maxTargetY = y;
  });

  const currentMaxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const needed = Math.max(0, Math.ceil(maxTargetY - currentMaxScroll + 24));
  main.style.setProperty("--scroll-tail", `${needed}px`);
}

function bindNavigatorActiveState() {
  const links = qsa(".top-nav-link");
  if (links.length === 0) return;

  const linkMap = new Map();
  links.forEach((link) => {
    const id = link.getAttribute("href")?.replace("#", "");
    if (id) linkMap.set(id, link);
  });

  function setActive(id) {
    linkMap.forEach((link, key) => {
      const isActive = key === id;
      link.style.background = isActive ? "var(--accent-lt)" : "";
      link.style.color = isActive ? "var(--accent)" : "";
      link.style.fontWeight = isActive ? "500" : "";
    });
  }

  const targets = Array.from(linkMap.entries())
    .map(([id]) => {
      const el = document.getElementById(id);
      return el ? { id, el } : null;
    })
    .filter(Boolean);
  if (targets.length === 0) return;

  const update = () => {
    if (window.scrollY <= 8) {
      setActive(targets[0].id);
      return;
    }

    const anchorY = window.scrollY + getNavigatorOffset() + 8;
    let current = targets[0].id;
    targets.forEach((target) => {
      const targetY = window.scrollY + target.el.getBoundingClientRect().top;
      if (targetY <= anchorY) current = target.id;
    });
    setActive(current);
  };

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

function getNavigatorOffset() {
  return 8;
}

function easeInOutCubic(t) {
  if (t < 0.5) return 4 * t * t * t;
  return 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function animateScrollTo(targetY, duration = 560) {
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 2) {
    window.scrollTo(0, targetY);
    return;
  }

  if (navScrollRafId) cancelAnimationFrame(navScrollRafId);
  const startTime = performance.now();

  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = easeInOutCubic(progress);
    window.scrollTo(0, startY + delta * eased);

    if (progress < 1) {
      navScrollRafId = requestAnimationFrame(step);
      return;
    }
    navScrollRafId = null;
  };

  navScrollRafId = requestAnimationFrame(step);
}

function bindNavigatorSmoothScroll() {
  const links = qsa(".top-nav-link");
  if (links.length === 0) return;
  const dragThreshold = 2;

  const hasRecentNavDrag = () => {
    const nav = qs(".top-nav-wrap");
    const ts = Number.parseInt(nav?.dataset.lastDragTs || "0", 10);
    return Number.isFinite(ts) && ts > 0 && Date.now() - ts < 420;
  };

  const navigateToHref = (href) => {
    if (!href.startsWith("#")) return false;
    const id = href.slice(1);
    const target = document.getElementById(id);
    if (!target) return false;

    updateScrollTailAllowance();

    const offset = getNavigatorOffset();
    let targetY = Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset);
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (targetY > maxScroll) {
      const main = qs(".main");
      if (main) {
        const currentTail = Number.parseFloat(main.style.getPropertyValue("--scroll-tail")) || 0;
        const extra = Math.ceil(targetY - maxScroll + 24);
        main.style.setProperty("--scroll-tail", `${Math.max(0, currentTail + extra)}px`);
        targetY = Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset);
      }
    }

    const distance = Math.abs(targetY - window.scrollY);
    const duration = Math.min(980, Math.max(420, 300 + distance * 0.38));
    animateScrollTo(targetY, duration);
    return true;
  };

  links.forEach((link) => {
    if (link.dataset.smoothBound === "1") return;
    link.dataset.smoothBound = "1";
    link.setAttribute("draggable", "false");

    let pointerStart = null;

    link.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerStart = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    });

    link.addEventListener("pointercancel", () => {
      pointerStart = null;
    });

    link.addEventListener("pointerup", (event) => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      const move = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      pointerStart = null;
      const nav = qs(".top-nav-wrap");
      const navDraggingNow = Boolean(nav && nav.classList.contains("is-dragging"));
      if (navDraggingNow) return;
      if (move > dragThreshold || hasRecentNavDrag()) return;

      const href = link.getAttribute("href") || "";
      const moved = navigateToHref(href);
      if (!moved) return;

      event.preventDefault();
      link.dataset.navPointerTs = String(Date.now());
    });

    link.addEventListener("click", (event) => {
      if (hasRecentNavDrag()) {
        event.preventDefault();
        return;
      }

      const lastPointerTs = Number.parseInt(link.dataset.navPointerTs || "0", 10);
      if (lastPointerTs && Date.now() - lastPointerTs < 360) {
        event.preventDefault();
        return;
      }

      const href = link.getAttribute("href") || "";
      const moved = navigateToHref(href);
      if (!moved) return;
      event.preventDefault();
    });
  });
}

function renderNavigator(orderedSections = []) {
  const navSection = ensureNavigatorSection();
  if (!navSection) return;
  navSection.dataset.dragged = "0";
  navSection.dataset.initialPlaced = "0";

  const sections = orderedSections.length > 0 ? orderedSections : ensureMainSectionStructure();
  const navItems = [{ id: "overview", label: "Overview" }, ...sections];
  if (navItems.length <= 1) return;

  navSection.innerHTML = `
    <ul class="top-nav-list">
      ${navItems
        .map(
          (item, index) => `
            <li>
              <a class="top-nav-link" href="#${escapeHtml(item.id)}">
                <span class="c-icon">${index === 0 ? "TOP" : index}</span>
                <span class="c-text">${escapeHtml(item.label)}</span>
              </a>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;

  bindNavigatorFrameSync();
  bindNavigatorDrag();
  syncNavigatorFrame();
  requestAnimationFrame(syncNavigatorFrame);
  setTimeout(updateScrollTailAllowance, 0);
  bindNavigatorSmoothScroll();
  bindNavigatorActiveState();
}

function ensureYamlLib() {
  if (window.jsyaml && typeof window.jsyaml.load === "function") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = qsa("script").find((s) => s.src && s.src.includes("js-yaml"));
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load js-yaml.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = YAML_CDN;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load js-yaml from CDN."));
    document.head.appendChild(script);
  });
}

async function loadDoc() {
  const response = await fetch(DOC_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${DOC_PATH}: ${response.status}`);
  }
  const raw = await response.text();
  return window.jsyaml.load(raw) || {};
}

function findSectionByTitle(keyword) {
  const lower = keyword.toLowerCase();
  return qsa("section").find((section) => {
    const h2 = qs(".sec-head h2", section);
    return h2 && h2.textContent.toLowerCase().includes(lower);
  });
}

function getSidebarProfile(doc = {}, personal = {}) {
  const sidebar = doc.sidebar_profile || {};
  return {
    name: pick(
      sidebar.name,
      sidebar.name_ko,
      sidebar.name_en,
      personal.name_ko,
      personal.name_en,
      "Your Name",
    ),
    title: pick(sidebar.title, personal.title, "AI & Hardware Engineer"),
    photo: pick(sidebar.photo, personal.photo),
    photo_life: pick(sidebar.photo_life, sidebar.photo_alt, "assets/bio/life.jpg"),
  };
}

function renderIdentity(doc = {}, personal = {}) {
  const sidebarProfile = getSidebarProfile(doc, personal);
  const displayName = pick(personal.name_ko, personal.name_en, sidebarProfile.name, "Your Name");
  const title = pick(personal.title, sidebarProfile.title, "AI & Hardware Engineer");
  const affiliationLine = pick(joinWithDot([personal.affiliation, personal.department]), title);

  document.title = `${displayName} | ${title}`;

  const sbName = qs(".sb-name");
  if (sbName) sbName.textContent = sidebarProfile.name;

  const sbTitle = qs(".sb-title");
  if (sbTitle) sbTitle.textContent = sidebarProfile.title;

  const heroEyebrow = qs(".hero-eyebrow");
  if (heroEyebrow) heroEyebrow.textContent = affiliationLine;

  const heroTitle = qs(".hero h1");
  if (heroTitle) {
    heroTitle.innerHTML = `<span class="hero-name-line">${escapeHtml(displayName)}</span><br><em>${escapeHtml(title)}</em>`;
  }

  const heroSummary = qs(".hero-summary");
  if (heroSummary && isFilled(personal.bio)) {
    heroSummary.textContent = pick(personal.bio);
    heroSummary.style.whiteSpace = "pre-line";
  }
}

function setImageWithFallback(img, candidates = []) {
  const uniq = Array.from(
    new Set(
      candidates
        .filter((v) => isFilled(v))
        .map((v) => String(v).trim()),
    ),
  );
  if (!img || uniq.length === 0) return;

  let idx = 0;
  img.style.display = "block";
  img.onerror = null;
  img.src = uniq[idx];
  img.onerror = () => {
    idx += 1;
    if (idx < uniq.length) {
      img.src = uniq[idx];
    }
  };
}

function withImageExtensionVariants(path) {
  const p = pick(path);
  if (!p) return [];

  const variants = [p];
  if (/\.png$/i.test(p)) {
    variants.push(p.replace(/\.png$/i, ".jpg"));
    variants.push(p.replace(/\.png$/i, ".jpeg"));
  } else if (/\.jpe?g$/i.test(p)) {
    variants.push(p.replace(/\.jpe?g$/i, ".png"));
  }
  return Array.from(new Set(variants));
}

function ensureSidebarTypingStyle() {
  if (qs("#sidebar-typing-style")) return;
  const style = document.createElement("style");
  style.id = "sidebar-typing-style";
  style.textContent = `
    .sidebar-site-link.is-typing::after {
      content: "";
      display: inline-block;
      width: 1px;
      height: 0.95em;
      margin-left: 5px;
      vertical-align: -0.08em;
      background: rgba(125, 125, 125, 0.85);
      animation: sidebar-caret-blink 1.35s steps(1, end) infinite;
    }
    @keyframes sidebar-caret-blink {
      0%, 48% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

function startSidebarTyping(link, labels = SIDEBAR_SITE_LABELS) {
  if (!link) return;
  const sources = (Array.isArray(labels) ? labels : [labels]).map((item) => pick(item));
  const targets = sources.filter(Boolean);

  if (targets.length === 0) {
    link.textContent = "";
    return;
  }

  if (sidebarTypingTimerId) {
    clearTimeout(sidebarTypingTimerId);
    sidebarTypingTimerId = null;
  }
  const runId = ++sidebarTypingRunId;
  link.classList.add("is-typing");

  let phraseIndex = 0;
  let index = 0;
  let deleting = false;

  const getChars = () => Array.from(targets[phraseIndex]);

  const tick = () => {
    if (runId !== sidebarTypingRunId) return;
    const chars = getChars();
    if (!deleting) {
      index = Math.min(chars.length, index + 1);
      link.textContent = chars.slice(0, index).join("");
      if (index >= chars.length) {
        sidebarTypingTimerId = setTimeout(() => {
          deleting = true;
          tick();
        }, SIDEBAR_TYPING_HOLD_MS);
        return;
      }
      const typeStepMs = Math.max(16, Math.round(SIDEBAR_TYPING_TOTAL_MS / Math.max(chars.length, 1)));
      sidebarTypingTimerId = setTimeout(tick, typeStepMs);
      return;
    }

    index = Math.max(0, index - 1);
    link.textContent = chars.slice(0, index).join("");
    if (index <= 0) {
      deleting = false;
      phraseIndex = (phraseIndex + 1) % targets.length;
      sidebarTypingTimerId = setTimeout(tick, SIDEBAR_PHRASE_GAP_MS);
      return;
    }
    const deleteStepMs = Math.max(14, Math.round(SIDEBAR_DELETE_TOTAL_MS / Math.max(chars.length, 1)));
    sidebarTypingTimerId = setTimeout(tick, deleteStepMs);
  };

  link.textContent = "";
  tick();
}

function renderSidebarTopLink() {
  const link = qs("#sidebar-site-link");
  if (!link) return;
  ensureSidebarTypingStyle();
  link.href = window.location.href.split("#")[0];
  startSidebarTyping(link, SIDEBAR_SITE_LABELS);
}

function renderAvatar(personal = {}, sidebarProfile = {}) {
  const avatarWrap = qs(".avatar-wrap");
  const photo = pick(sidebarProfile.photo, personal.photo);
  if (!avatarWrap || !isFilled(photo)) return;

  const isFlipped = avatarWrap.classList.contains("is-flipped");
  avatarWrap.innerHTML = `
    <button type="button" class="avatar-flip" aria-label="Flip profile photo">
      <span class="avatar-flip-inner">
        <img class="avatar avatar-front-img" alt="Profile front" />
        <img class="avatar avatar-back-img" alt="Profile daily life" />
      </span>
    </button>
  `;
  if (isFlipped) avatarWrap.classList.add("is-flipped");

  const flip = qs(".avatar-flip", avatarWrap);
  if (flip) {
    const inner = qs(".avatar-flip-inner", avatarWrap);
    if (inner) inner.style.setProperty("--morph-ms", `${AVATAR_MORPH_MS}ms`);

    flip.addEventListener("click", () => {
      if (avatarWrap.dataset.morphing === "1") return;
      avatarWrap.dataset.morphing = "1";
      avatarWrap.classList.add("is-morphing");
      avatarWrap.classList.toggle("is-flipped");

      window.setTimeout(() => {
        avatarWrap.classList.remove("is-morphing");
        avatarWrap.dataset.morphing = "0";
      }, AVATAR_MORPH_MS);
    });
  }

  const frontImg = qs(".avatar-front-img", avatarWrap);
  const backImg = qs(".avatar-back-img", avatarWrap);
  const lifePhoto = pick(sidebarProfile.photo_life, "assets/bio/life.jpg", "assets/bio/life.png");

  if (frontImg) {
    frontImg.alt = pick(sidebarProfile.name, personal.name_ko, personal.name_en, "Profile photo");
    setImageWithFallback(frontImg, [photo, personal.photo, "assets/bio/photo.png", "assets/bio/photo.jpg"]);
  }

  if (backImg) {
    backImg.alt = "Daily life photo";
    setImageWithFallback(backImg, [
      ...withImageExtensionVariants(lifePhoto),
      "assets/bio/life.jpg",
      "assets/bio/life.png",
      photo,
    ]);
  }
}

function contactItem({ icon, text, href }) {
  if (!isFilled(text)) return "";
  if (isFilled(href)) {
    return `
      <li>
        <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
          <span class="c-icon">${icon}</span>
          <span class="c-text">${escapeHtml(text)}</span>
        </a>
      </li>
    `;
  }
  return `
    <li>
      <div class="nolink">
        <span class="c-icon">${icon}</span>
        <span class="c-text">${escapeHtml(text)}</span>
      </div>
    </li>
  `;
}

function renderContact(personal = {}) {
  const list = qs(".contact-list");
  if (!list) return;

  const email = pick(personal.email);
  const github = pick(personal.github);
  const linkedin = pick(personal.linkedin);
  const scholar = pick(personal.google_scholar);
  const orcid = pick(personal.orcid);
  const location = pick(personal.location);

  const items = [
    contactItem({ icon: "@", text: email, href: isFilled(email) ? `mailto:${email}` : "" }),
    contactItem({ icon: "GH", text: isFilled(github) ? getDomainPath(github) : "", href: github }),
    contactItem({ icon: "in", text: isFilled(linkedin) ? getDomainPath(linkedin) : "", href: linkedin }),
    contactItem({ icon: "GS", text: isFilled(scholar) ? "Google Scholar" : "", href: scholar }),
    contactItem({ icon: "ID", text: isFilled(orcid) ? "ORCID" : "", href: orcid }),
    contactItem({ icon: "LOC", text: location, href: "" }),
  ].filter(Boolean);

  if (items.length > 0) {
    list.innerHTML = items.join("\n");
  }
}

function extractCoreSkills(doc = {}) {
  const names = [];
  if (Array.isArray(doc.skills)) {
    doc.skills.forEach((group) => {
      const category = String(group?.category || "").toLowerCase();
      if (category.includes("language")) return;
      const items = Array.isArray(group?.items) ? group.items : [];
      items.forEach((item) => {
        const name = typeof item === "string" ? item : item?.name;
        if (isFilled(name)) names.push(String(name).trim());
      });
    });
  }
  if (names.length === 0 && Array.isArray(doc.research_interests)) {
    doc.research_interests.forEach((interest) => {
      if (isFilled(interest)) names.push(String(interest).trim());
    });
  }

  return Array.from(new Set(names)).slice(0, 14);
}

function renderSkills(doc = {}) {
  const skillBox = qs(".skill-tags");
  if (!skillBox) return;
  const skills = extractCoreSkills(doc);
  if (skills.length === 0) return;

  skillBox.innerHTML = skills
    .map((skill) => `<span class="skill-tag">${escapeHtml(skill)}</span>`)
    .join("");
}

function renderLanguages(doc = {}) {
  const list = qs(".lang-list");
  if (!list) return;

  const langCategory = (Array.isArray(doc.skills) ? doc.skills : []).find((group) =>
    String(group?.category || "").toLowerCase().includes("language"),
  );
  const items = Array.isArray(langCategory?.items) ? langCategory.items : [];
  if (items.length === 0) return;

  const html = items
    .map((item) => {
      const name = typeof item === "string" ? item : pick(item.name);
      const levelRaw = typeof item === "string" ? "intermediate" : pick(item.level, "intermediate");
      if (!isFilled(name)) return "";
      const level = formatLevel(levelRaw);
      return `
        <li class="lang-item">
          <div class="lang-row">
            <span class="lang-name">${escapeHtml(name)}</span>
            <span class="lang-level">${escapeHtml(level.label)}</span>
          </div>
          <div class="lang-track"><div class="lang-fill" style="width:${level.width}%"></div></div>
        </li>
      `;
    })
    .filter(Boolean)
    .join("\n");

  if (html) list.innerHTML = html;
}

function renderExperience(doc = {}) {
  const section = findSectionByTitle("experience");
  if (!section) return;
  const list = qs(".exp-list", section);
  if (!list) return;

  const experiences = Array.isArray(doc.experience) ? doc.experience : [];
  if (experiences.length === 0) return;

  const typeMap = {
    industry: "Full-time",
    internship: "Internship",
    research: "Research",
    academic: "Academic",
  };

  const html = experiences
    .map((exp) => {
      const company = pick(exp.company, exp.company_full, "Organization");
      const type = pick(typeMap[String(exp.type || "").toLowerCase()], exp.type);
      const period = formatPeriod(exp.period_start, exp.period_end);
      const loc = pick(exp.location, doc.personal?.location);

      const description = pick(
        exp.description,
        Array.isArray(exp.highlights) ? exp.highlights.join(" ") : "",
      );

      const tags = Array.isArray(exp.tech_stack) ? exp.tech_stack.filter(isFilled) : [];
      const tagsHtml = tags
        .map((tag) => `<span class="exp-tag">${escapeHtml(String(tag).trim())}</span>`)
        .join("");

      return `
        <div class="exp-card">
          <div>
            <div class="exp-role">${escapeHtml(pick(exp.role, "Role"))}</div>
            <div class="exp-company">${escapeHtml(joinWithDot([company, type]))}</div>
          </div>
          <div>
            <div class="exp-period">${escapeHtml(period)}</div>
            <div class="exp-loc">${escapeHtml(loc)}</div>
          </div>
          <p class="exp-desc">${escapeHtml(summarizeText(description, 280))}</p>
          <div class="exp-tags">${tagsHtml}</div>
        </div>
      `;
    })
    .join("\n");

  list.innerHTML = html;
}

function renderEducation(doc = {}) {
  const section = qs("#educations");
  if (!section) return;
  const list = qs(".overview-edu-list", section);
  if (!list) return;

  const educations = Array.isArray(doc.education) ? doc.education : [];
  if (educations.length === 0) {
    list.innerHTML = `<div class="overview-edu-item"><div class="overview-edu-detail">Education details will be added soon.</div></div>`;
    return;
  }

  const html = educations
    .map((ed) => {
      const degree = pick(ed.degree);
      const major = pick(ed.major);
      const degreeLine = major ? `${degree} in ${major}` : degree || "Degree";
      const institution = pick(ed.institution, ed.institution_full, "Institution");
      const period = formatPeriod(ed.period_start, ed.period_end);

      const detail = pick(
        isFilled(ed.thesis_title) ? `Thesis: "${ed.thesis_title}"` : "",
        isFilled(ed.gpa) ? `GPA ${ed.gpa} / ${pick(ed.gpa_scale)}` : "",
        ed.description,
      );

      return `
        <div class="overview-edu-item">
          <div class="overview-edu-period">${escapeHtml(period)}</div>
          <div class="overview-edu-main">${escapeHtml(`${degreeLine} · ${institution}`)}</div>
          ${isFilled(detail) ? `<div class="overview-edu-detail">${escapeHtml(detail)}</div>` : ""}
        </div>
      `;
    })
    .join("\n");

  list.innerHTML = html;
}

function buildPublicationCards(doc = {}) {
  const publications = Array.isArray(doc.publications) ? doc.publications : [];
  const personal = doc.personal || {};
  const total = publications.length;

  return publications.map((pub, index) => {
    const venue = pick(pub.conference, pub.journal, pub.conference_abbr, pub.journal_abbr, "Publication");
    const year = pick(pub.year);
    const title = pick(pub.title, "Untitled");
    const link = pick(pub.project_page, pub.pdf, pub.arxiv, pub.code, pub.video, pub.slides);
    const linkLabel = pub.code && link === pub.code ? "GitHub" : "Read more";
    const authorsHtml = formatAuthorsHtml(pick(pub.authors, pub.author), personal);
    const statusRaw = String(pub.status || "").toLowerCase().trim();
    const isUnderReview = statusRaw.includes("under_review") || statusRaw.includes("under review");
    const venueClass = `pub-venue${isUnderReview ? " pub-venue-under-review" : ""}`;
    const indexLabel = publicationIndexLabel(pub);
    const indexClass = indexLabel === "SCI" ? "pub-index pub-index-sci" : "pub-index pub-index-kci";
    const statusLabel = publicationStatusLabel(pub.status);
    const noteText = pick(pub.note);
    const noteKey = normalizeNameKey(noteText);
    const statusKey = normalizeNameKey(statusLabel);
    const statusLikeNoteKeys = new Set(["underreview", "published", "accepted", "inpreparation"]);
    const isStatusOnlyNote = noteKey && (noteKey === statusKey || statusLikeNoteKeys.has(noteKey));
    const description = isStatusOnlyNote
      ? pick(summarizeText(pub.abstract, 220))
      : pick(noteText, summarizeText(pub.abstract, 220));
    const linkHtml = isFilled(link)
      ? `<a class="pub-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkLabel)}</a>`
      : "";
    const doiRaw = pick(pub.doi);
    const doiDisplay = doiRaw
      ? doiRaw.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").trim()
      : "";
    const doiHref = isFilled(doiDisplay) ? `https://doi.org/${doiDisplay}` : "";
    const doiHtml = isFilled(doiDisplay)
      ? `<div class="pub-doi"><span class="pub-doi-label">DOI</span><span class="pub-doi-sep" aria-hidden="true">|</span><a class="pub-doi-link" href="${escapeHtml(doiHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(doiDisplay)}</a></div>`
      : "";
    const statusHtml = isFilled(statusLabel) ? `<span class="pub-status">${escapeHtml(statusLabel)}</span>` : "";
    const metaFootHtml = isFilled(doiHtml) || isFilled(statusHtml)
      ? `<div class="pub-foot-meta">${doiHtml}${statusHtml}</div>`
      : "";
    const footHtml = isFilled(linkHtml) ? `<div class="pub-foot">${linkHtml}</div>` : "";
    const serialLabel = String(total - index).padStart(2, "0");
    const sciCardClass = indexLabel === "SCI" ? " pub-card-sci" : "";

    return `
      <div class="pub-card pub-card-indexed${sciCardClass}">
        <span class="pub-serial-mark" aria-hidden="true">${escapeHtml(serialLabel)}</span>
        <div class="pub-meta">
          <span class="${venueClass}">${escapeHtml(venue)}</span>
          <span class="pub-year">${escapeHtml(year)}</span>
          ${isFilled(indexLabel) ? `<span class="${indexClass}">${escapeHtml(indexLabel)}</span>` : ""}
        </div>
        <div class="pub-title">${escapeHtml(title)}</div>
        ${isFilled(authorsHtml) ? `<div class="pub-authors">${authorsHtml}</div>` : ""}
        ${metaFootHtml}
        ${isFilled(description) ? `<p class="pub-desc">${escapeHtml(summarizeText(description, 240))}</p>` : ""}
        ${footHtml}
      </div>
    `;
  });
}

function buildProjectCards(doc = {}) {
  const projects = Array.isArray(doc.projects) ? doc.projects : [];

  return projects.map((project) => {
    const year = pick(project.period_start).slice(0, 4);
    const title = pick(project.title, "Project");
    const description = pick(project.description, summarizeText((project.highlights || []).join(" "), 220));
    const link = pick(project.link, project.github);
    const linkLabel = project.github && link === project.github ? "GitHub" : "Project page";

    return `
      <div class="pub-card">
        <div class="pub-meta">
          <span class="pub-venue">Project</span>
          <span class="pub-year">${escapeHtml(year)}</span>
        </div>
        <div class="pub-title">${escapeHtml(title)}</div>
        <p class="pub-desc">${escapeHtml(summarizeText(description, 240))}</p>
        ${
          isFilled(link)
            ? `<a class="pub-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkLabel)}</a>`
            : ""
        }
      </div>
    `;
  });
}

function buildPatentCards(doc = {}) {
  const patents = Array.isArray(doc.patents) ? doc.patents : [];
  const typeMap = { domestic: "Korea", international: "International", pct: "PCT" };

  return patents.map((patent) => {
    const typeRaw = String(patent.type || "").toLowerCase();
    const venue = pick(typeMap[typeRaw], patent.country, "Patent");
    const yearSource = pick(patent.registration_date, patent.filing_date);
    const year = pick(String(yearSource).slice(0, 4));
    const title = pick(patent.title_en, patent.title, "Patent");
    const description = pick(
      patent.description,
      Array.isArray(patent.inventors) ? `Inventors: ${patent.inventors.join(", ")}` : "",
      patent.application_number,
    );
    const statusLabel = patentStatusLabel(patent.status);

    return `
      <div class="pub-card">
        <div class="pub-meta">
          <span class="pub-venue">${escapeHtml(venue)}</span>
          <span class="pub-year">${escapeHtml(year)}</span>
          ${isFilled(statusLabel) ? `<span class="pub-index pub-index-kci">${escapeHtml(statusLabel)}</span>` : ""}
        </div>
        <div class="pub-title">${escapeHtml(title)}</div>
        <p class="pub-desc">${escapeHtml(summarizeText(description, 240))}</p>
      </div>
    `;
  });
}

function placeholderCard(message) {
  return `
    <div class="pub-card">
      <p class="pub-desc">${escapeHtml(message)}</p>
    </div>
  `;
}

function renderPublications(doc = {}) {
  const section = qs("#publications") || findSectionByTitle("publication");
  if (!section) return;
  const list = qs(".pub-list", section);
  if (!list) return;
  const heading = qs(".sec-head h2", section);

  const cards = buildPublicationCards(doc);
  if (heading) {
    heading.textContent = `Publications (${cards.length})`;
  }
  list.innerHTML =
    cards.length > 0 ? cards.join("\n") : placeholderCard("Publications will be added soon.");
}

function renderPatents(doc = {}) {
  const section = qs("#patents") || findSectionByTitle("patent");
  if (!section) return;
  const list = qs(".patent-list", section);
  if (!list) return;

  const cards = buildPatentCards(doc);
  list.innerHTML = cards.length > 0 ? cards.join("\n") : placeholderCard("No patents listed yet.");
}

function renderProjects(doc = {}) {
  const section = qs("#projects") || findSectionByTitle("project");
  if (!section) return;
  const list = qs(".project-list", section);
  if (!list) return;

  const cards = buildProjectCards(doc);
  list.innerHTML = cards.length > 0 ? cards.join("\n") : placeholderCard("Projects will be added soon.");
}

function renderCV(doc = {}, personal = {}) {
  const section = qs("#cv") || findSectionByTitle("cv");
  if (!section) return;
  const list = qs(".cv-list", section);
  if (!list) return;

  const cvLink = pick(personal.cv, doc.cv);
  if (!isFilled(cvLink)) {
    list.innerHTML = placeholderCard("CV link is not set yet.");
    return;
  }

  list.innerHTML = `
    <div class="pub-card">
      <div class="pub-meta">
        <span class="pub-venue">Resume</span>
      </div>
      <div class="pub-title">Curriculum Vitae</div>
      <p class="pub-desc">Open the latest CV document.</p>
      <a class="pub-link" href="${escapeHtml(cvLink)}" target="_blank" rel="noopener noreferrer">Open CV</a>
    </div>
  `;
}

function render(doc = {}) {
  const orderedSections = ensureMainSectionStructure();
  applyFonts(doc);

  const personal = doc.personal || {};
  const sidebarProfile = getSidebarProfile(doc, personal);
  renderIdentity(doc, personal);
  renderSidebarTopLink();
  renderAvatar(personal, sidebarProfile);
  renderContact(personal);
  renderSkills(doc);
  renderLanguages(doc);
  renderEducation(doc);
  renderPublications(doc);
  renderPatents(doc);
  renderProjects(doc);
  renderCV(doc, personal);
  renderNavigator(orderedSections);
}

async function boot() {
  try {
    resetInitialViewport();
    await ensureYamlLib();
    const doc = await loadDoc();
    render(doc);
    resetInitialViewport();
  } catch (error) {
    console.error("[portfolio] YAML binding failed:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

window.addEventListener("pageshow", () => {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  resetInitialViewport();
});


