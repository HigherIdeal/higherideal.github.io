const DOC_PATHS = {
  en: "./doc.yaml",
  ko: "./doc_ko.yaml",
};
const DEFAULT_LOCALE = "en";
const LOCALE_STORAGE_KEY = "higherideal-locale";
const YAML_CDN = "https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js";

const LEVEL_META = {
  native: { width: 100 },
  expert: { width: 92 },
  advanced: { width: 82 },
  intermediate: { width: 64 },
  beginner: { width: 45 },
};
const UI_STRINGS = {
  en: {
    siteLabels: ["HIGHERIDEAL", "HigherIdeal", "더높은이상을향해"],
    defaults: {
      name: "Your Name",
      title: "AI & Hardware Engineer",
      institution: "Institution",
      degree: "Degree",
      publication: "Publication",
      project: "Project",
      patent: "Patent",
    },
    toggle: {
      switchToEnglish: "Switch to English",
      switchToKorean: "Switch to Korean",
    },
    sidebar: {
      contact: "Contact",
      languages: "Programming Languages",
      tools: "Tools",
    },
    nav: {
      top: "TOP",
      overview: "Overview",
      publications: "Publications",
      patents: "Patents",
      projects: "Projects",
      cv: "CV",
    },
    overview: {
      title: "Overview",
      educations: "Education",
      empty: "Education details will be added soon.",
      thesis: "Thesis",
      gpa: "GPA",
    },
    contact: {
      email: "Email",
      phone: "Phone",
      github: "GitHub",
      linkedin: "LinkedIn",
      googleScholar: "Google Scholar",
      orcid: "ORCID",
      cv: "Curriculum Vitae",
    },
    placeholders: {
      publications: "Publications will be added soon.",
      patents: "No patents listed yet.",
      projects: "Projects will be added soon.",
      cvMissing: "CV link is not set yet.",
      cvVenue: "Resume",
      cvTitle: "Curriculum Vitae",
      cvDescription: "Open the latest CV document.",
      openCv: "Open CV",
      readMore: "Read more",
      projectPage: "Project page",
      inventors: "Inventors",
    },
    status: {
      publication: {
        underReview: "Under Review",
        published: "Published",
        accepted: "Accepted",
        inPreparation: "In Preparation",
      },
      patent: {
        registered: "Registered",
        filed: "Filed",
        pending: "Pending",
        abandoned: "Abandoned",
      },
    },
    patentType: {
      domestic: "Korea",
      international: "International",
      pct: "PCT",
    },
    levels: {
      native: "Native",
      expert: "Expert",
      advanced: "Advanced",
      intermediate: "Intermediate",
      beginner: "Beginner",
    },
    present: "Present",
    locale: "en",
  },
  ko: {
    siteLabels: ["HIGHERIDEAL", "HigherIdeal", "더높은이상을향해"],
    defaults: {
      name: "Your Name",
      title: "AI & Hardware Engineer",
      institution: "Institution",
      degree: "Degree",
      publication: "Publication",
      project: "Project",
      patent: "Patent",
    },
    toggle: {
      switchToEnglish: "Switch to English",
      switchToKorean: "Switch to Korean",
    },
    sidebar: {
      contact: "Contact",
      languages: "Programming Languages",
      tools: "Tools",
    },
    nav: {
      top: "TOP",
      overview: "Overview",
      publications: "Publications",
      patents: "Patents",
      projects: "Projects",
      cv: "CV",
    },
    overview: {
      title: "Overview",
      educations: "Education",
      empty: "Education details will be added soon.",
      thesis: "Thesis",
      gpa: "GPA",
    },
    contact: {
      email: "Email",
      phone: "Phone",
      github: "GitHub",
      linkedin: "LinkedIn",
      googleScholar: "Google Scholar",
      orcid: "ORCID",
      cv: "Curriculum Vitae",
    },
    placeholders: {
      publications: "Publications will be added soon.",
      patents: "No patents listed yet.",
      projects: "Projects will be added soon.",
      cvMissing: "CV link is not set yet.",
      cvVenue: "Resume",
      cvTitle: "Curriculum Vitae",
      cvDescription: "Open the latest CV document.",
      openCv: "Open CV",
      readMore: "Read more",
      projectPage: "Project page",
      inventors: "Inventors",
    },
    status: {
      publication: {
        underReview: "Under Review",
        published: "Published",
        accepted: "Accepted",
        inPreparation: "In Preparation",
      },
      patent: {
        registered: "Registered",
        filed: "Filed",
        pending: "Pending",
        abandoned: "Abandoned",
      },
    },
    patentType: {
      domestic: "Korea",
      international: "International",
      pct: "PCT",
    },
    levels: {
      native: "Native",
      expert: "Expert",
      advanced: "Advanced",
      intermediate: "Intermediate",
      beginner: "Beginner",
    },
    present: "Present",
    locale: "ko",
  },
};
let navScrollRafId = null;
let navFrameBound = false;
let navDragBound = false;
let navLiquidRebuildTimerId = null;
let localeToggleLiquidRebuildTimerId = null;
let localeToggleFrameBound = false;
const AVATAR_MORPH_MS = 920;
const SIDEBAR_SITE_LABELS = ["HIGHERIDEAL", "HigherIdeal", "더높은이상을향해"];
const SIDEBAR_TYPING_HOLD_MS = 10000;
const SIDEBAR_TYPING_TOTAL_MS = 1000;
const SIDEBAR_DELETE_TOTAL_MS = 500;
const SIDEBAR_PHRASE_GAP_MS = 260;
let sidebarTypingTimerId = null;
let sidebarTypingRunId = 0;
let currentLocale = DEFAULT_LOCALE;
let localeRenderRunId = 0;
let viewportResetBound = false;
let viewportResetBlocked = false;
const viewportResetTimeoutIds = new Set();
const viewportResetRafIds = new Set();
const NAV_CONTENT_ORDER = [
  { id: "publications", key: "publications" },
  { id: "patents", key: "patents" },
  { id: "projects", key: "projects" },
  { id: "cv", key: "cv" },
];
const NAV_INITIAL_Y_NUDGE = -10;
const NAV_LIQUID_FILTER_ID = "top-nav-liquid-filter";
const NAV_LIQUID_DEFS_ID = "top-nav-liquid-defs";
const LOCALE_TOGGLE_LIQUID_FILTER_ID = "locale-toggle-liquid-filter";
const LOCALE_TOGGLE_LIQUID_DEFS_ID = "locale-toggle-liquid-defs";
const MOUNT_NAVIGATOR_ON_BODY = true;
const NAV_BOX_SETTINGS = {
  width: 500,
  minHeight: 70,
  radius: 20,
  padX: 4,
  padY: 4,
  gap: 7,
  fontSize: 11,
  pillPadX: 10,
  pillPadY: 6,
  iconSize: 17,
  pillBlur: 12,
};
const NAV_LIQUID_SETTINGS = {
  glassThickness: 60,
  bezelWidth: 80,
  refractiveIndex: 2.0,
  scaleRatio: 1.4,
  blurAmount: 0.0,
  specularOpacity: 0.4,
  specularSaturation: 4,
  borderOpacity: 0.07,
  shadowColor: "255, 255, 255",
  shadowOpacity: 0.4,
  shadowBlur: 0,
  shadowSpread: -9,
  tintColor: "255, 255, 255",
  tintOpacity: 0.0,
  outerShadowBlur: 15,
};
const LOCALE_TOGGLE_LIQUID_SETTINGS = {
  glassThickness: 12,
  bezelWidth: 7,
  refractiveIndex: 1.9,
  scaleRatio: 1.32,
  blurAmount: 0,
  specularOpacity: 0.24,
  specularSaturation: 3.2,
};
const CONTACT_ICON_BASE_PATH = "./assets/icons";
const CONTACT_ICON_SOURCES = {
  email: {
    label: "Email",
    iconUrl: `${CONTACT_ICON_BASE_PATH}/gmail.svg`,
  },
  github: {
    label: "GitHub",
    iconUrl: `${CONTACT_ICON_BASE_PATH}/github.svg`,
  },
  linkedin: {
    label: "LinkedIn",
    iconUrl: `${CONTACT_ICON_BASE_PATH}/linkedin.svg`,
  },
  google_scholar: {
    label: "Google Scholar",
    iconUrl: `${CONTACT_ICON_BASE_PATH}/google-scholar.svg`,
  },
  orcid: {
    label: "ORCID",
    iconUrl: `${CONTACT_ICON_BASE_PATH}/orcid.svg`,
  },
  phone: {
    label: "Phone",
    iconUrl: `${CONTACT_ICON_BASE_PATH}/phone.svg`,
  },
  cv: {
    label: "CV",
    iconUrl: `${CONTACT_ICON_BASE_PATH}/cv.svg`,
  },
};

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

function normalizeLocale(value) {
  return String(value || "").toLowerCase().trim() === "ko" ? "ko" : "en";
}

function getLocaleStrings(locale = currentLocale) {
  return UI_STRINGS[normalizeLocale(locale)] || UI_STRINGS.en;
}

function pickLocalized(locale, koValue, enValue, ...fallbacks) {
  return normalizeLocale(locale) === "ko"
    ? pick(koValue, enValue, ...fallbacks)
    : pick(enValue, koValue, ...fallbacks);
}

function detectInitialLocale() {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeLocale(params.get("lang"));
  } catch {}
  return DEFAULT_LOCALE;
}

function persistLocale(locale) {
  return normalizeLocale(locale);
}

function getNavItems(locale = currentLocale) {
  const strings = getLocaleStrings(locale);
  return NAV_CONTENT_ORDER.map((item) => ({
    id: item.id,
    label: strings.nav[item.key],
  }));
}

function sectionJumpAria(label, locale = currentLocale) {
  return normalizeLocale(locale) === "ko" ? `${label} ?뱀뀡?쇰줈 ?대룞` : `Go to ${label} section`;
}

function toNamedList(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") {
        return { name: pick(item) };
      }
      if (item && typeof item === "object") {
        return { ...item, name: pick(item.name, item.label) };
      }
      return null;
    })
    .filter((item) => item && isFilled(item.name));
}

function clampNumber(value, min, max, fallback = min) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function joinWithDot(parts) {
  return parts.filter(isFilled).map((v) => String(v).trim()).join(" / ");
}

function joinWithSpace(parts) {
  return parts.filter(isFilled).map((v) => String(v).trim()).join(" ");
}

function formatPeriod(start, end, locale = currentLocale) {
  const s = pick(start);
  const e = pick(end);
  const strings = getLocaleStrings(locale);
  if (!s && !e) return "";
  if (!e) return `${s} - ${strings.present}`;
  return `${s} - ${e}`;
}

function formatMonthValue(value, locale = currentLocale) {
  const raw = pick(value);
  const strings = getLocaleStrings(locale);
  if (!raw) return "";
  if (/^present$/i.test(raw)) return strings.present;
  const monthMatch = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (monthMatch) return `${monthMatch[1]}.${monthMatch[2]}`;
  return raw;
}

function formatMonthPeriod(start, end, locale = currentLocale) {
  const strings = getLocaleStrings(locale);
  const s = formatMonthValue(start, locale);
  const e = formatMonthValue(end, locale);
  if (!s && !e) return "";
  if (!e) return `${s} - ${strings.present}`;
  return `${s} - ${e}`;
}

function formatLevel(levelText, locale = currentLocale) {
  const key = String(levelText || "").toLowerCase().trim();
  const strings = getLocaleStrings(locale);
  const info = LEVEL_META[key] || { width: 60 };
  return {
    label: strings.levels[key] || pick(levelText, strings.levels.intermediate),
    width: info.width,
  };
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

function patentStatusLabel(status, locale = currentLocale) {
  const s = String(status || "").toLowerCase().trim();
  const strings = getLocaleStrings(locale);
  if (s.includes("registered")) return strings.status.patent.registered;
  if (s.includes("filed")) return strings.status.patent.filed;
  if (s.includes("pending")) return strings.status.patent.pending;
  if (s.includes("abandoned")) return strings.status.patent.abandoned;
  return pick(status);
}

function isForeignPatent(patent = {}) {
  const typeKey = normalizeNameKey(patent.type);
  const countryKey = normalizeNameKey(patent.country);
  if (typeKey) return typeKey !== "domestic";
  return Boolean(countryKey) && !["korea", "southkorea", "republicofkorea"].includes(countryKey);
}

const SEMICONDUCTOR_PROJECT_KEYWORDS = [
  "semiconductor",
  "chipdesign",
  "neurochip",
  "neuromorphic",
  "neurocomputing",
  "aihardware",
  "hardwaredesign",
  "npu",
  "accelerator",
  "memoryinterface",
  "memoryinterfaceip",
  "lpddr",
  "dram",
  "ddr",
  "hbm",
  "asic",
  "fpga",
  "rtl",
  "verilog",
  "systemverilog",
  "artificialintelligence",
  "machinelearning",
  "deeplearning",
  "generativeai",
  "ai",
  "llm",
  "largelanguagemodel",
  "transformer",
  "neuralnetwork",
  "computervision",
  "visionlanguage",
];

function isSemiconductorProject(project = {}) {
  const haystack = normalizeNameKey(
    [
      pick(project.title),
      pick(project.description),
      ...(Array.isArray(project.highlights) ? project.highlights.map((item) => pick(item)) : []),
      ...(Array.isArray(project.tech_stack) ? project.tech_stack.map((item) => pick(item)) : []),
    ].join(" "),
  );

  return SEMICONDUCTOR_PROJECT_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function publicationStatusLabel(status, locale = currentLocale) {
  const s = String(status || "").toLowerCase().trim();
  const strings = getLocaleStrings(locale);
  if (s.includes("under_review") || s.includes("under review")) return strings.status.publication.underReview;
  if (s.includes("published")) return strings.status.publication.published;
  if (s.includes("accepted")) return strings.status.publication.accepted;
  if (s.includes("in_preparation") || s.includes("in preparation")) return strings.status.publication.inPreparation;
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

function navLiquidSurfaceConvexSquircle(x) {
  return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
}

function calculateNavLiquidRefractionProfile(glassThickness, bezelWidth, heightFn, ior, samples = 128) {
  const eta = 1 / ior;

  function refract(nx, ny) {
    const dot = ny;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    const sq = Math.sqrt(k);
    return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
  }

  const profile = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const y = heightFn(x);
    const dx = x < 1 ? 0.0001 : -0.0001;
    const y2 = heightFn(x + dx);
    const deriv = (y2 - y) / dx;
    const mag = Math.sqrt(deriv * deriv + 1);
    const ref = refract(-deriv / mag, -1 / mag);
    if (!ref) {
      profile[i] = 0;
      continue;
    }
    profile[i] = ref[0] * ((y * bezelWidth + glassThickness) / ref[1]);
  }
  return profile;
}

function generateNavLiquidDisplacementMap(width, height, radius, bezelWidth, profile, maxDisp) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const img = ctx.createImageData(width, height);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }

  const r = radius;
  const rSq = r * r;
  const r1Sq = (r + 1) ** 2;
  const rBSq = Math.max(r - bezelWidth, 0) ** 2;
  const wBody = width - r * 2;
  const hBody = height - r * 2;
  const samples = profile.length;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = px < r ? px - r : px >= width - r ? px - r - wBody : 0;
      const y = py < r ? py - r : py >= height - r ? py - r - hBody : 0;
      const dSq = x * x + y * y;
      if (dSq > r1Sq || dSq < rBSq) continue;

      const dist = Math.sqrt(dSq);
      const fromSide = r - dist;
      const op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
      if (op <= 0 || dist === 0) continue;

      const cos = x / dist;
      const sin = y / dist;
      const idxProfile = Math.min(((fromSide / bezelWidth) * samples) | 0, samples - 1);
      const disp = profile[idxProfile] || 0;
      const dX = (-cos * disp) / maxDisp;
      const dY = (-sin * disp) / maxDisp;

      const idx = (py * width + px) * 4;
      data[idx] = (128 + dX * 127 * op + 0.5) | 0;
      data[idx + 1] = (128 + dY * 127 * op + 0.5) | 0;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function generateNavLiquidSpecularMap(width, height, radius, bezelWidth, angle = Math.PI / 3) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const img = ctx.createImageData(width, height);
  const data = img.data;
  data.fill(0);

  const r = radius;
  const rSq = r * r;
  const r1Sq = (r + 1) ** 2;
  const rBSq = Math.max(r - bezelWidth, 0) ** 2;
  const wBody = width - r * 2;
  const hBody = height - r * 2;
  const lightVec = [Math.cos(angle), Math.sin(angle)];

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = px < r ? px - r : px >= width - r ? px - r - wBody : 0;
      const y = py < r ? py - r : py >= height - r ? py - r - hBody : 0;
      const dSq = x * x + y * y;
      if (dSq > r1Sq || dSq < rBSq) continue;

      const dist = Math.sqrt(dSq);
      const fromSide = r - dist;
      const op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
      if (op <= 0 || dist === 0) continue;

      const cos = x / dist;
      const sin = -y / dist;
      const dot = Math.abs(cos * lightVec[0] + sin * lightVec[1]);
      const edge = Math.sqrt(Math.max(0, 1 - (1 - fromSide) ** 2));
      const coeff = dot * edge;
      const col = (255 * coeff) | 0;
      const alpha = (col * coeff * op) | 0;
      const idx = (py * width + px) * 4;
      data[idx] = col;
      data[idx + 1] = col;
      data[idx + 2] = col;
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function ensureLiquidDefs(svgId, defsId) {
  let svg = qs(`#${svgId}`);
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("id", svgId);
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("color-interpolation-filters", "sRGB");
    svg.style.position = "absolute";
    svg.style.overflow = "hidden";
    svg.style.pointerEvents = "none";
    document.body.appendChild(svg);
  }

  let defs = qs(`#${defsId}`, svg);
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.setAttribute("id", defsId);
    svg.appendChild(defs);
  }
  return defs;
}

function ensureNavigatorLiquidDefs() {
  return ensureLiquidDefs("top-nav-liquid-svg", NAV_LIQUID_DEFS_ID);
}

function ensureLocaleToggleLiquidDefs() {
  return ensureLiquidDefs("locale-toggle-liquid-svg", LOCALE_TOGGLE_LIQUID_DEFS_ID);
}

function rebuildLocaleToggleLiquidFilter() {
  const thumb = qs(".locale-toggle-thumb");
  if (!thumb) return;

  const rect = thumb.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (width <= 0 || height <= 0) return;

  const computed = window.getComputedStyle(thumb);
  const rawRadius = parseFloat(computed.borderTopLeftRadius) || Math.min(width, height) / 2;
  const maxRadius = Math.min(width, height) / 2;
  const radius = clampNumber(rawRadius, 2, maxRadius, maxRadius);
  const maxBezel = Math.max(2, radius - 1);
  const bezelWidth = clampNumber(
    LOCALE_TOGGLE_LIQUID_SETTINGS.bezelWidth,
    2,
    maxBezel,
    Math.min(LOCALE_TOGGLE_LIQUID_SETTINGS.bezelWidth, maxBezel),
  );
  const profile = calculateNavLiquidRefractionProfile(
    LOCALE_TOGGLE_LIQUID_SETTINGS.glassThickness,
    bezelWidth,
    navLiquidSurfaceConvexSquircle,
    LOCALE_TOGGLE_LIQUID_SETTINGS.refractiveIndex,
    96,
  );
  const maxDisp = Math.max(1, bezelWidth * LOCALE_TOGGLE_LIQUID_SETTINGS.scaleRatio);
  const dispMap = generateNavLiquidDisplacementMap(width, height, radius, bezelWidth, profile, maxDisp);
  const specMap = generateNavLiquidSpecularMap(width, height, radius, bezelWidth, Math.PI / 3);
  if (!dispMap || !specMap) return;

  const defs = ensureLocaleToggleLiquidDefs();
  defs.innerHTML = `
    <filter id="${LOCALE_TOGGLE_LIQUID_FILTER_ID}" x="0%" y="0%" width="100%" height="100%">
      <feImage href="${dispMap}" x="0%" y="0%" width="100%" height="100%" result="dispMap" />
      <feGaussianBlur in="SourceGraphic" stdDeviation="${Math.max(0, LOCALE_TOGGLE_LIQUID_SETTINGS.blurAmount)}" result="blur" />
      <feDisplacementMap
        in="blur"
        in2="dispMap"
        scale="${maxDisp}"
        xChannelSelector="R"
        yChannelSelector="G"
        result="glass"
      />
      <feImage href="${specMap}" x="0%" y="0%" width="100%" height="100%" result="specMap" />
      <feColorMatrix in="specMap" type="saturate" values="${LOCALE_TOGGLE_LIQUID_SETTINGS.specularSaturation}" result="specColor" />
      <feComposite in="specColor" in2="SourceAlpha" operator="in" result="specMasked" />
      <feComponentTransfer in="specMasked" result="specOut">
        <feFuncA type="linear" slope="${LOCALE_TOGGLE_LIQUID_SETTINGS.specularOpacity}" />
      </feComponentTransfer>
      <feBlend in="glass" in2="specOut" mode="screen" />
    </filter>
  `;
}

function scheduleLocaleToggleLiquidFilterRebuild(delay = 24) {
  if (localeToggleLiquidRebuildTimerId !== null) {
    window.clearTimeout(localeToggleLiquidRebuildTimerId);
  }
  localeToggleLiquidRebuildTimerId = window.setTimeout(() => {
    localeToggleLiquidRebuildTimerId = null;
    rebuildLocaleToggleLiquidFilter();
  }, delay);
}

function applyLiquidSurfaceVars(target, thinBoost = 1) {
  if (!target) return;

  const effectiveShadowBlur = Math.max(0, Number(NAV_LIQUID_SETTINGS.shadowBlur) || 0);
  const effectiveShadowColor =
    effectiveShadowBlur > 0
      ? `rgba(${NAV_LIQUID_SETTINGS.shadowColor}, ${clampNumber(NAV_LIQUID_SETTINGS.shadowOpacity, 0, 1, 0.48)})`
      : "rgba(255, 255, 255, 0)";
  const effectiveShadowSpread = effectiveShadowBlur > 0 ? NAV_LIQUID_SETTINGS.shadowSpread : 0;
  target.style.setProperty("--nav-liquid-shadow-color", effectiveShadowColor);
  target.style.setProperty("--nav-liquid-shadow-blur", `${effectiveShadowBlur}px`);
  target.style.setProperty("--nav-liquid-shadow-spread", `${effectiveShadowSpread}px`);
  target.style.setProperty("--nav-liquid-tint-color", NAV_LIQUID_SETTINGS.tintColor);
  target.style.setProperty("--nav-liquid-tint-opacity", String(NAV_LIQUID_SETTINGS.tintOpacity));
  target.style.setProperty("--nav-liquid-outer-shadow-blur", `${NAV_LIQUID_SETTINGS.outerShadowBlur}px`);
  target.style.setProperty("--nav-liquid-border-opacity", String(clampNumber(NAV_LIQUID_SETTINGS.borderOpacity, 0, 1, 0.42)));
  target.style.setProperty("--nav-liquid-boost", thinBoost.toFixed(3));
}

function applyNavigatorRuntimeSettings() {
  const nav = qs(".top-nav-wrap");
  const liquid = nav ? qs(".top-nav-liquid", nav) : null;
  const list = nav ? qs(".top-nav-list", nav) : null;
  if (!nav || !liquid || !list) return;

  nav.style.width = NAV_BOX_SETTINGS.width > 0 ? `${Math.round(NAV_BOX_SETTINGS.width)}px` : "fit-content";
  nav.style.borderRadius = `${Math.round(NAV_BOX_SETTINGS.radius)}px`;
  liquid.style.minHeight = NAV_BOX_SETTINGS.minHeight > 0 ? `${Math.round(NAV_BOX_SETTINGS.minHeight)}px` : "";
  liquid.style.padding = `${Math.round(NAV_BOX_SETTINGS.padY)}px ${Math.round(NAV_BOX_SETTINGS.padX)}px`;
  list.style.gap = `${Math.round(NAV_BOX_SETTINGS.gap)}px`;
  nav.style.setProperty("--nav-pill-blur", `${NAV_BOX_SETTINGS.pillBlur}px`);

  qsa(".top-nav-link", nav).forEach((link) => {
    link.style.fontSize = `${NAV_BOX_SETTINGS.fontSize}px`;
    link.style.padding = `${Math.round(NAV_BOX_SETTINGS.pillPadY)}px ${Math.round(NAV_BOX_SETTINGS.pillPadX)}px`;
  });

  qsa(".top-nav-link .c-icon", nav).forEach((icon) => {
    const iconSize = Math.round(NAV_BOX_SETTINGS.iconSize);
    icon.style.width = `${iconSize}px`;
    icon.style.height = `${iconSize}px`;
    icon.style.fontSize = `${Math.max(8, Math.round(iconSize * 0.5))}px`;
  });
}

function cleanupLegacyNavigatorControls() {
  qs("#top-nav-control-panel")?.remove();
  qs("#top-nav-control-style")?.remove();
}

function rebuildNavigatorLiquidFilter() {
  const nav = qs(".top-nav-wrap");
  const liquid = nav ? qs(".top-nav-liquid", nav) : null;
  if (!nav || !liquid) return;

  const width = Math.max(2, Math.round(liquid.offsetWidth));
  const height = Math.max(2, Math.round(liquid.offsetHeight));
  if (width < 2 || height < 2) return;

  const computed = window.getComputedStyle(liquid);
  const rawRadius = Math.max(2, Math.round(Number.parseFloat(computed.borderTopLeftRadius) || 18));
  const maxRadius = Math.max(2, Math.floor(Math.min(width, height) / 2) - 1);
  const radius = Math.min(rawRadius, maxRadius);
  if (Math.abs(rawRadius - radius) > 0.5) {
    nav.style.borderRadius = `${radius}px`;
  }
  const clampedBezel = Math.min(
    NAV_LIQUID_SETTINGS.bezelWidth,
    Math.max(1, radius - 1),
    Math.max(1, Math.min(width, height) / 2 - 1),
  );
  if (!(clampedBezel > 0)) return;

  const thinBoost = Math.max(1, Math.min(2.4, 96 / Math.max(height, 1)));
  const adaptiveBezel = Math.min(Math.max(1, clampedBezel), Math.max(1, Math.min(width, height) / 2 - 1));
  const adaptiveThickness = NAV_LIQUID_SETTINGS.glassThickness * Math.max(1, 0.58 * thinBoost);
  const adaptiveScaleRatio = NAV_LIQUID_SETTINGS.scaleRatio * Math.max(1.24, thinBoost * 1.06);
  const adaptiveBlur = Math.max(0, NAV_LIQUID_SETTINGS.blurAmount);
  const adaptiveSpecSat = Math.max(1, NAV_LIQUID_SETTINGS.specularSaturation);

  const profile = calculateNavLiquidRefractionProfile(
    adaptiveThickness,
    adaptiveBezel,
    navLiquidSurfaceConvexSquircle,
    NAV_LIQUID_SETTINGS.refractiveIndex,
    128,
  );
  const maxDisp = Math.max(...Array.from(profile).map((v) => Math.abs(v))) || 1;
  const dispUrl = generateNavLiquidDisplacementMap(width, height, radius, adaptiveBezel, profile, maxDisp);
  const specUrl = generateNavLiquidSpecularMap(width, height, radius, adaptiveBezel * 2.5);
  const scale = maxDisp * adaptiveScaleRatio;
  const defs = ensureNavigatorLiquidDefs();
  if (!defs) return;

  defs.innerHTML = `
    <filter id="${NAV_LIQUID_FILTER_ID}" x="0%" y="0%" width="100%" height="100%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${adaptiveBlur}" result="blurred_source" />
      <feImage href="${dispUrl}" x="0" y="0" width="${width}" height="${height}" result="disp_map" />
      <feDisplacementMap in="blurred_source" in2="disp_map"
        scale="${scale}" xChannelSelector="R" yChannelSelector="G"
        result="displaced" />
      <feColorMatrix in="displaced" type="saturate" values="${adaptiveSpecSat}" result="displaced_sat" />
      <feImage href="${specUrl}" x="0" y="0" width="${width}" height="${height}" result="spec_layer" />
      <feComposite in="displaced_sat" in2="spec_layer" operator="in" result="spec_masked" />
      <feComponentTransfer in="spec_layer" result="spec_faded">
        <feFuncA type="linear" slope="${NAV_LIQUID_SETTINGS.specularOpacity}" />
      </feComponentTransfer>
      <feBlend in="spec_masked" in2="displaced" mode="normal" result="with_sat" />
      <feBlend in="spec_faded" in2="with_sat" mode="normal" />
    </filter>
  `;

  applyLiquidSurfaceVars(liquid, thinBoost);
}

function scheduleNavigatorLiquidFilterRebuild(delay = 24) {
  if (navLiquidRebuildTimerId) {
    clearTimeout(navLiquidRebuildTimerId);
  }
  navLiquidRebuildTimerId = window.setTimeout(() => {
    navLiquidRebuildTimerId = null;
    requestAnimationFrame(rebuildNavigatorLiquidFilter);
  }, delay);
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

function ensureOverviewStructure(main, locale = currentLocale) {
  const strings = getLocaleStrings(locale);
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
  h2.textContent = strings.overview.title;

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
      <div class="overview-edu-layout">
        <div class="overview-edu-list"></div>
        <div class="overview-edu-stats"></div>
      </div>
    `;
    hero.appendChild(subsection);
  } else {
    let title = qs(".overview-subtitle", subsection);
    if (!title) {
      title = document.createElement("div");
      title.className = "overview-subtitle";
      subsection.insertAdjacentElement("afterbegin", title);
    }
    title.textContent = strings.overview.educations;

    let layout = qs(".overview-edu-layout", subsection);
    if (!layout) {
      layout = document.createElement("div");
      layout.className = "overview-edu-layout";
      subsection.appendChild(layout);
    }

    let list = qs(".overview-edu-list", subsection);
    if (!list) {
      const list = document.createElement("div");
      list.className = "overview-edu-list";
      layout.appendChild(list);
    } else if (list.parentElement !== layout) {
      layout.appendChild(list);
    }

    if (!qs(".overview-edu-stats", subsection)) {
      const stats = document.createElement("div");
      stats.className = "overview-edu-stats";
      layout.appendChild(stats);
    }
  }

  const subtitle = qs(".overview-subtitle", subsection);
  if (subtitle) subtitle.textContent = strings.overview.educations;

  return subsection;
}

function ensureMainSectionStructure(locale = currentLocale) {
  const strings = getLocaleStrings(locale);
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

  ensureOverviewStructure(main, locale);

  const used = new Set();
  const educationSubsection = qs("#educations");
  if (educationSubsection) used.add(educationSubsection);

  const publicationSection =
    qs("#publications", main) ||
    findSectionByKeywords(["publication", "paper"], used) ||
    createSection(main, "publications", strings.nav.publications, "pub-list");
  used.add(publicationSection);
  publicationSection.id = "publications";
  ensureSectionHeader(publicationSection, strings.nav.publications);
  ensureSectionList(publicationSection, "pub-list");

  const patentsSection =
    qs("#patents", main) ||
    findSectionByKeywords(["patent"], used) ||
    createSection(main, "patents", strings.nav.patents, "patent-list", ["pub-list"]);
  used.add(patentsSection);
  patentsSection.id = "patents";
  ensureSectionHeader(patentsSection, strings.nav.patents);
  ensureSectionList(patentsSection, "patent-list", ["pub-list"]);

  const projectsSection =
    qs("#projects", main) ||
    findSectionByKeywords(["project"], used) ||
    createSection(main, "projects", strings.nav.projects, "project-list", ["pub-list"]);
  used.add(projectsSection);
  projectsSection.id = "projects";
  ensureSectionHeader(projectsSection, strings.nav.projects);
  ensureSectionList(projectsSection, "project-list", ["pub-list"]);

  const cvSection =
    qs("#cv", main) ||
    findSectionByKeywords(["cv", "curriculum vitae", "resume"], used) ||
    createSection(main, "cv", strings.nav.cv, "cv-list", ["pub-list"]);
  used.add(cvSection);
  cvSection.id = "cv";
  ensureSectionHeader(cvSection, strings.nav.cv);
  ensureSectionList(cvSection, "cv-list", ["pub-list"]);

  const experienceSection = findSectionByKeywords(["experience"], used);
  if (experienceSection) experienceSection.style.display = "none";

  [publicationSection, patentsSection, projectsSection, cvSection].forEach((section) => {
    if (section && section.parentElement === main) main.appendChild(section);
  });

  return getNavItems(locale).filter((item) => document.getElementById(item.id));
}

function ensureNavigatorSection(locale = currentLocale) {
  const main = qs(".main");
  if (!main) return null;
  cleanupLegacyNavigatorControls();
  main.classList.add("top-nav-enabled");
  document.body.classList.add("layout-centered");
  const strings = getLocaleStrings(locale);

  const navHost = MOUNT_NAVIGATOR_ON_BODY ? document.body : main;
  let navSection = qs(".top-nav-wrap");
  if (!navSection) {
    navSection = document.createElement("nav");
    navSection.className = "top-nav-wrap";
  }
  navSection.setAttribute("aria-label", "Section navigation");
  if (navSection.parentElement !== navHost) {
    navHost.insertAdjacentElement("afterbegin", navSection);
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
        --top-nav-pill-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(248, 250, 255, 0.18));
        --top-nav-pill-bg-hover: linear-gradient(180deg, rgba(245, 245, 247, 0.6), rgba(229, 231, 235, 0.36));
        --top-nav-pill-bg-active: linear-gradient(180deg, rgba(236, 237, 240, 0.82), rgba(216, 219, 224, 0.58));
        --top-nav-pill-border: rgba(255, 255, 255, 0.42);
        --top-nav-pill-border-active: rgba(150, 156, 166, 0.84);
        --nav-pill-blur: 18px;
        position: fixed;
        z-index: 320;
        width: fit-content;
        max-width: min(96vw, 1200px);
        border: 0;
        border-radius: 75px;
        background: transparent;
        cursor: grab;
        touch-action: none;
        user-select: none;
        -webkit-user-drag: none;
      }
      .top-nav-wrap * {
        -webkit-user-drag: none;
      }
      .top-nav-liquid {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        max-width: inherit;
        border-radius: inherit;
        padding: 13px 12px;
        touch-action: none;
        isolation: isolate;
        box-shadow: 0 4px var(--nav-liquid-outer-shadow-blur, 24px) rgba(0, 0, 0, 0.18);
      }
      .top-nav-liquid::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 1;
        border-radius: inherit;
        border: 1px solid rgba(255, 255, 255, var(--nav-liquid-border-opacity, 0.42));
        box-shadow: inset 0 0 var(--nav-liquid-shadow-blur, 20px) var(--nav-liquid-shadow-spread, -5px)
          var(--nav-liquid-shadow-color, rgba(255, 255, 255, 0.45));
        background:
          radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.36) 0, rgba(255, 255, 255, 0.12) 20%, transparent 42%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.07) 46%, rgba(226, 234, 248, 0.18)),
          rgba(var(--nav-liquid-tint-color, 255, 255, 255), var(--nav-liquid-tint-opacity, 0.06));
        pointer-events: none;
      }
      .top-nav-liquid::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: inherit;
        backdrop-filter: url(#top-nav-liquid-filter);
        -webkit-backdrop-filter: url(#top-nav-liquid-filter);
        isolation: isolate;
        pointer-events: none;
      }
      .top-nav-wrap.is-dragging {
        cursor: grabbing;
      }
      .top-nav-wrap.is-dragging .top-nav-liquid {
        box-shadow: 0 6px calc(var(--nav-liquid-outer-shadow-blur, 24px) + 6px) rgba(0, 0, 0, 0.21);
      }
      .top-nav-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-wrap: wrap;
        max-width: 100%;
        gap: 7px;
        justify-content: center;
        align-items: center;
        position: relative;
        z-index: 2;
      }
      .top-nav-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        text-decoration: none;
        color: var(--text);
        border: 1px solid var(--top-nav-pill-border);
        border-radius: 999px;
        background: var(--top-nav-pill-bg);
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 500;
        line-height: 1.2;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.42),
          0 10px 24px rgba(118, 133, 158, 0.14);
        backdrop-filter: blur(var(--nav-pill-blur, 18px)) saturate(1.15);
        -webkit-backdrop-filter: blur(var(--nav-pill-blur, 18px)) saturate(1.15);
        transition:
          background 0.18s,
          color 0.18s,
          border-color 0.18s,
          box-shadow 0.18s,
          transform 0.18s;
        user-select: none;
        -webkit-user-drag: none;
      }
      .top-nav-link:hover {
        background: var(--top-nav-pill-bg-hover);
        color: #4f545d;
        border-color: rgba(170, 176, 185, 0.88);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.52),
          0 12px 28px rgba(86, 92, 104, 0.16);
        transform: translateY(-1px);
      }
      .top-nav-link.is-active {
        background: var(--top-nav-pill-bg-active);
        color: #4c5058;
        border-color: var(--top-nav-pill-border-active);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.58),
          0 14px 30px rgba(73, 80, 92, 0.18);
      }
      .top-nav-link .c-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 18px;
        height: 18px;
        font-size: 9px;
        line-height: 1;
        text-align: center;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.46);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.52);
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
      #educations .overview-edu-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(190px, 0.95fr);
        gap: 24px;
        align-items: start;
      }
      #educations .overview-edu-list {
        position: relative;
        margin-left: 2px;
        padding-left: 24px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-width: 0;
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
      #educations .overview-edu-stats {
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-self: stretch;
        justify-self: end;
        width: 100%;
        max-width: 230px;
        padding-top: 2px;
      }
      #educations .overview-edu-stat {
        --overview-stat-accent: var(--accent);
        appearance: none;
        -webkit-appearance: none;
        width: 100%;
        font: inherit;
        text-align: left;
        cursor: pointer;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        border-radius: 15px;
        border: 1px solid rgba(216, 221, 230, 0.92);
        background: rgba(255, 255, 255, 0.78);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.72),
          0 6px 18px rgba(30, 41, 62, 0.05);
        padding: 11px 13px;
        transition:
          transform 0.18s ease,
          border-color 0.18s ease,
          box-shadow 0.18s ease,
          background 0.18s ease;
      }
      #educations .overview-edu-stat:hover {
        transform: translateY(-1px);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.76),
          0 10px 20px rgba(30, 41, 62, 0.08);
      }
      #educations .overview-edu-stat:focus-visible {
        outline: 2px solid rgba(103, 117, 145, 0.34);
        outline-offset: 2px;
      }
      #educations .overview-edu-stat::before {
        content: "";
        position: absolute;
        left: 13px;
        top: 50%;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--overview-stat-accent);
        transform: translateY(-50%);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--overview-stat-accent) 12%, transparent);
      }
      #educations .overview-edu-stat-value {
        font-family: 'IBM Plex Sans', 'Pretendard', sans-serif;
        font-size: 22px;
        font-weight: 600;
        line-height: 1;
        letter-spacing: -0.04em;
        color: #202633;
        margin-bottom: 0;
        padding-left: 8px;
      }
      #educations .overview-edu-stat-label {
        display: inline-flex;
        align-items: center;
        font-family: 'IBM Plex Mono', 'Pretendard', monospace;
        font-size: 9.5px;
        letter-spacing: 0.13em;
        text-transform: uppercase;
        color: #6e7481;
        padding-left: 16px;
      }
      #educations .overview-edu-stat-publications {
        --overview-stat-accent: #4c83eb;
        border-color: rgba(191, 211, 252, 0.95);
        background: linear-gradient(180deg, rgba(240, 246, 255, 0.92), rgba(252, 253, 255, 0.78));
      }
      #educations .overview-edu-stat-patents {
        --overview-stat-accent: #49a36b;
        border-color: rgba(187, 225, 199, 0.96);
        background: linear-gradient(180deg, rgba(241, 251, 244, 0.92), rgba(255, 255, 255, 0.78));
      }
      #educations .overview-edu-stat-projects {
        --overview-stat-accent: #b08750;
        border-color: rgba(232, 217, 188, 0.96);
        background: linear-gradient(180deg, rgba(252, 248, 241, 0.92), rgba(255, 252, 248, 0.78));
      }
      @media (max-width: 760px) {
        #educations .overview-edu-layout {
          grid-template-columns: 1fr;
        }
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
      .pub-card.pub-card-sci .pub-venue,
      .pub-card.pub-card-sci .pub-venue-under-review {
        background: var(--accent);
        border-color: #2f61c6;
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
      .pub-card.pub-card-publication {
        background: var(--white);
        border-color: var(--border);
      }
      .pub-card.pub-card-publication:hover {
        border-color: #c5cfe8;
      }
      .pub-card.pub-card-patent {
        background: var(--white);
        border-color: var(--border);
      }
      .pub-card.pub-card-patent:hover {
        border-color: #c5cfe8;
      }
      .pub-card.pub-card-project {
        background: var(--white);
        border-color: var(--border);
      }
      .pub-card.pub-card-project:hover {
        border-color: #c5cfe8;
      }
      .pub-card.pub-card-project .pub-meta {
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .pub-card.pub-card-project .pub-venue {
        line-height: 1.45;
        white-space: normal;
        overflow-wrap: anywhere;
        max-width: min(100%, calc(100% - 118px));
      }
      .pub-card.pub-card-project .pub-year {
        margin-left: auto;
        white-space: nowrap;
      }
      .pub-card.pub-card-sci {
        background: #eef4ff;
        border-color: #c6d7f8;
      }
      .pub-card.pub-card-sci:hover {
        border-color: #b0c8f4;
      }
      .pub-card.pub-card-patent-foreign {
        background: #eef8f0;
        border-color: #c2dfca;
      }
      .pub-card.pub-card-patent-foreign:hover {
        border-color: #acd1b7;
      }
      .pub-card.pub-card-patent-foreign .pub-venue {
        background: #49a36b;
        border-color: #3f8e5b;
        color: #fff;
      }
      .pub-card.pub-card-patent-foreign .pub-index-kci {
        color: #3f8e5b;
        font-weight: 600;
      }
      .pub-card.pub-card-project-semiconductor {
        background: #fff4cf;
        border-color: #e6cf7a;
      }
      .pub-card.pub-card-project-semiconductor:hover {
        border-color: #d8bd60;
      }
      .pub-card.pub-card-project-semiconductor .pub-venue {
        background: #c59a2f;
        border-color: #ac841d;
        color: #fff;
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
        .top-nav-liquid {
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

  applyNavigatorRuntimeSettings();

  const isMobile = window.innerWidth <= 860;
  const edgePad = 8;
  const mainRect = main.getBoundingClientRect();
  const computed = window.getComputedStyle(main);
  const padLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const padRight = Number.parseFloat(computed.paddingRight) || 0;
  const innerLeft = Math.max(edgePad, mainRect.left + padLeft);
  const innerRight = Math.min(window.innerWidth - edgePad, mainRect.right - padRight);
  const innerWidth = Math.max(220, innerRight - innerLeft);
  const preferredDesktopWidth = NAV_BOX_SETTINGS.width > 0 ? NAV_BOX_SETTINGS.width : 560;
  const maxWidth = Math.min(
    Math.floor(innerWidth),
    isMobile ? window.innerWidth - 16 : Math.max(560, Math.round(preferredDesktopWidth)),
  );

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
  scheduleNavigatorLiquidFilterRebuild(0);
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
  let pointerCaptureEl = null;
  let suppressClick = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  const dragThreshold = 7;

  const finishDrag = (didDrag = false) => {
    if (pointerId !== null && pointerCaptureEl) {
      try {
        pointerCaptureEl.releasePointerCapture(pointerId);
      } catch {}
    }
    pointerId = null;
    pointerCaptureEl = null;
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
    const linkEl = event.target && event.target.closest(".top-nav-link");
    const downOnLink = Boolean(linkEl);
    pointerStartedOnLink = downOnLink;
    pointerCaptureEl = downOnLink ? linkEl : nav;

    const rect = nav.getBoundingClientRect();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    dragStarted = false;
    suppressClick = false;
    try {
      pointerCaptureEl.setPointerCapture(pointerId);
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
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
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

function navigateToSectionId(id) {
  const target = document.getElementById(pick(id));
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
}

function navigateToHref(href) {
  if (!String(href || "").startsWith("#")) return false;
  return navigateToSectionId(String(href).slice(1));
}

function hasRecentNavigatorDrag() {
  const nav = qs(".top-nav-wrap");
  const ts = Number.parseInt(nav?.dataset.lastDragTs || "0", 10);
  return Number.isFinite(ts) && ts > 0 && Date.now() - ts < 420;
}

function bindNavigatorSmoothScroll() {
  const links = qsa(".top-nav-link");
  if (links.length === 0) return;

  links.forEach((link) => {
    if (link.dataset.smoothBound === "1") return;
    link.dataset.smoothBound = "1";
    link.setAttribute("draggable", "false");

    link.addEventListener("click", (event) => {
      if (hasRecentNavigatorDrag()) {
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

function renderNavigator(orderedSections = [], locale = currentLocale) {
  const navSection = ensureNavigatorSection(locale);
  if (!navSection) return;
  const strings = getLocaleStrings(locale);
  const preserveDragPosition = navSection.dataset.dragged === "1";
  if (!preserveDragPosition) {
    navSection.dataset.dragged = "0";
    navSection.dataset.initialPlaced = "0";
  }

  const sections = orderedSections.length > 0 ? orderedSections : ensureMainSectionStructure(locale);
  const navItems = [{ id: "overview", label: strings.nav.overview }, ...sections];
  if (navItems.length <= 1) return;

  navSection.innerHTML = `
    <div class="top-nav-liquid">
      <ul class="top-nav-list">
        ${navItems
          .map(
            (item, index) => `
              <li>
                <a class="top-nav-link" href="#${escapeHtml(item.id)}">
                  <span class="c-icon">${index === 0 ? strings.nav.top : index}</span>
                  <span class="c-text">${escapeHtml(item.label)}</span>
                </a>
              </li>
            `,
          )
          .join("")}
      </ul>
    </div>
  `;

  applyNavigatorRuntimeSettings();
  bindNavigatorFrameSync();
  bindNavigatorDrag();
  syncNavigatorFrame();
  requestAnimationFrame(syncNavigatorFrame);
  setTimeout(() => scheduleNavigatorLiquidFilterRebuild(0), 80);
  setTimeout(() => scheduleNavigatorLiquidFilterRebuild(0), 260);
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

async function loadDoc(locale = currentLocale) {
  async function fetchDoc(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    const raw = await response.text();
    return window.jsyaml.load(raw) || {};
  }

  const path = DOC_PATHS[normalizeLocale(locale)] || DOC_PATHS.en;
  try {
    return await fetchDoc(path);
  } catch (error) {
    if (path !== DOC_PATHS.en) {
      console.warn(`[portfolio] Falling back to ${DOC_PATHS.en} after locale load failure:`, error);
      return fetchDoc(DOC_PATHS.en);
    }
    throw error;
  }
}

function renderLocaleToggle(locale = currentLocale) {
  const toggle = qs("#locale-toggle");
  if (!toggle) return;
  const strings = getLocaleStrings(locale);
  const isKo = normalizeLocale(locale) === "ko";
  toggle.classList.toggle("is-ko", isKo);
  toggle.classList.toggle("is-en", !isKo);
  toggle.setAttribute("aria-pressed", String(isKo));
  toggle.setAttribute("aria-label", isKo ? strings.toggle.switchToEnglish : strings.toggle.switchToKorean);
  toggle.title = isKo ? strings.toggle.switchToEnglish : strings.toggle.switchToKorean;
  if (toggle.dataset.dragging !== "1") {
    toggle.style.setProperty("--locale-pos", isKo ? "0" : "1");
  }
  scheduleLocaleToggleLiquidFilterRebuild(0);
}

function renderSidebarLabels(locale = currentLocale) {
  const strings = getLocaleStrings(locale);
  const labels = qsa(".sidebar .sb-section .sb-label");
  if (labels[0]) labels[0].textContent = strings.sidebar.contact;
  if (labels[1]) labels[1].textContent = strings.sidebar.languages;
  if (labels[2]) labels[2].textContent = strings.sidebar.tools;
}

async function applyLocale(locale, options = {}) {
  const { resetViewport = false, persist = true } = options;
  const nextLocale = normalizeLocale(locale);
  currentLocale = nextLocale;
  if (persist) persistLocale(nextLocale);
  renderLocaleToggle(nextLocale);
  document.documentElement.lang = getLocaleStrings(nextLocale).locale;

  const runId = ++localeRenderRunId;
  const doc = await loadDoc(nextLocale);
  if (runId !== localeRenderRunId) return;

  render(doc, nextLocale);
  if (resetViewport) resetInitialViewport();
}

function bindLocaleToggle() {
  const toggle = qs("#locale-toggle");
  if (!toggle || toggle.dataset.bound === "1") return;
  const track = qs(".locale-toggle-track", toggle);
  const thumb = qs(".locale-toggle-thumb", toggle);
  if (!track || !thumb) return;
  toggle.dataset.bound = "1";

  if (!localeToggleFrameBound) {
    localeToggleFrameBound = true;
    window.addEventListener("resize", () => scheduleLocaleToggleLiquidFilterRebuild(0));
    window.addEventListener(
      "load",
      () => {
        scheduleLocaleToggleLiquidFilterRebuild(0);
        requestAnimationFrame(() => scheduleLocaleToggleLiquidFilterRebuild(0));
      },
      { once: true },
    );
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => scheduleLocaleToggleLiquidFilterRebuild(0));
    }
  }

  let dragState = null;
  let windowPointerMove = null;
  let windowPointerUp = null;
  let windowPointerCancel = null;

  const getThumbWidth = () => thumb.getBoundingClientRect().width || 28;
  const getTrackRect = () => track.getBoundingClientRect();
  const getLocalePos = (locale) => (normalizeLocale(locale) === "ko" ? 0 : 1);
  const getTrackMetrics = (grabOffsetX = getThumbWidth() / 2) => {
    const rect = getTrackRect();
    const thumbWidth = getThumbWidth();
    const minLeft = 2;
    const maxLeft = Math.max(minLeft, rect.width - thumbWidth - 2);
    const clampedGrabOffset = clampNumber(grabOffsetX, 0, thumbWidth, thumbWidth / 2);
    return { rect, thumbWidth, minLeft, maxLeft, grabOffsetX: clampedGrabOffset };
  };
  const setLocalePos = (pos) => {
    const nextPos = clampNumber(pos, 0, 1, getLocalePos(currentLocale));
    toggle.style.setProperty("--locale-pos", String(nextPos));
    return nextPos;
  };
  const posFromClientX = (clientX, grabOffsetX = getThumbWidth() / 2) => {
    const { rect, minLeft, maxLeft, grabOffsetX: offset } = getTrackMetrics(grabOffsetX);
    const thumbLeft = clampNumber(clientX - rect.left - offset, minLeft, maxLeft, minLeft);
    if (maxLeft <= minLeft) return getLocalePos(currentLocale);
    return (thumbLeft - minLeft) / (maxLeft - minLeft);
  };
  const redirectToLocale = (locale) => {
    const nextUrl = new URL(window.location.href);
    if (locale === "ko") {
      nextUrl.searchParams.set("lang", "ko");
    } else {
      nextUrl.searchParams.delete("lang");
    }
    window.location.assign(nextUrl.toString());
  };
  const detachWindowDragListeners = () => {
    if (windowPointerMove) {
      window.removeEventListener("pointermove", windowPointerMove);
      windowPointerMove = null;
    }
    if (windowPointerUp) {
      window.removeEventListener("pointerup", windowPointerUp);
      windowPointerUp = null;
    }
    if (windowPointerCancel) {
      window.removeEventListener("pointercancel", windowPointerCancel);
      windowPointerCancel = null;
    }
  };
  const finalizeDrag = (clientX) => {
    if (!dragState) return;
    detachWindowDragListeners();
    const finalPos =
      typeof clientX === "number"
        ? posFromClientX(clientX, dragState.grabOffsetX)
        : dragState.lastPos;
    const didMove = dragState.didMove;
    dragState = null;
    toggle.dataset.dragging = "0";
    if (!didMove) {
      renderLocaleToggle(currentLocale);
      return;
    }
    const nextLocale = finalPos <= 0.5 ? "ko" : "en";
    setLocalePos(getLocalePos(nextLocale));
    if (nextLocale !== normalizeLocale(currentLocale)) {
      redirectToLocale(nextLocale);
      return;
    }
    renderLocaleToggle(currentLocale);
  };

  thumb.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const thumbRect = thumb.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      grabOffsetX: clampNumber(
        event.clientX - thumbRect.left,
        0,
        thumbRect.width || getThumbWidth(),
        (thumbRect.width || getThumbWidth()) / 2,
      ),
      lastPos: getLocalePos(currentLocale),
      didMove: false,
    };
    toggle.dataset.dragging = "1";
    setLocalePos(dragState.lastPos);
    if (typeof thumb.setPointerCapture === "function") {
      thumb.setPointerCapture(event.pointerId);
    }
    windowPointerMove = (moveEvent) => {
      if (!dragState || moveEvent.pointerId !== dragState.pointerId) return;
      if (Math.abs(moveEvent.clientX - dragState.startClientX) >= 3) {
        dragState.didMove = true;
      }
      dragState.lastPos = setLocalePos(posFromClientX(moveEvent.clientX, dragState.grabOffsetX));
    };
    windowPointerUp = (upEvent) => {
      if (!dragState || upEvent.pointerId !== dragState.pointerId) return;
      finalizeDrag(upEvent.clientX);
    };
    windowPointerCancel = (cancelEvent) => {
      if (!dragState || cancelEvent.pointerId !== dragState.pointerId) return;
      detachWindowDragListeners();
      dragState = null;
      toggle.dataset.dragging = "0";
      renderLocaleToggle(currentLocale);
    };
    window.addEventListener("pointermove", windowPointerMove);
    window.addEventListener("pointerup", windowPointerUp);
    window.addEventListener("pointercancel", windowPointerCancel);
  });

  thumb.addEventListener("lostpointercapture", () => {
    if (!dragState) return;
    detachWindowDragListeners();
    dragState = null;
    toggle.dataset.dragging = "0";
    renderLocaleToggle(currentLocale);
  });

  toggle.addEventListener("click", (event) => {
    event.preventDefault();
  });

  toggle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
    }
  });

  scheduleLocaleToggleLiquidFilterRebuild(0);
}

function findSectionByTitle(keyword) {
  const lower = keyword.toLowerCase();
  return qsa("section").find((section) => {
    const h2 = qs(".sec-head h2", section);
    return h2 && h2.textContent.toLowerCase().includes(lower);
  });
}

function getSidebarProfile(doc = {}, personal = {}, locale = currentLocale) {
  const sidebar = doc.sidebar_profile || {};
  const strings = getLocaleStrings(locale);
  return {
    name: pickLocalized(
      locale,
      sidebar.name_ko,
      sidebar.name_en,
      sidebar.name,
      sidebar.name_ko,
      sidebar.name_en,
      personal.name_ko,
      personal.name_en,
      strings.defaults.name,
    ),
    title: pick(sidebar.title, personal.title, strings.defaults.title),
    photo: pick(sidebar.photo, personal.photo),
    photo_life: pick(sidebar.photo_life, sidebar.photo_alt, "assets/bio/life.jpg"),
  };
}

function renderIdentity(doc = {}, personal = {}, locale = currentLocale) {
  const strings = getLocaleStrings(locale);
  const sidebarProfile = getSidebarProfile(doc, personal, locale);
  const displayName = pickLocalized(locale, personal.name_ko, personal.name_en, sidebarProfile.name, strings.defaults.name);
  const title = pick(personal.title, sidebarProfile.title, strings.defaults.title);
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

function renderSidebarTopLink(locale = currentLocale) {
  const link = qs("#sidebar-site-link");
  if (!link) return;
  const strings = getLocaleStrings(locale);
  ensureSidebarTypingStyle();
  link.href = window.location.href.split("#")[0];
  startSidebarTyping(link, strings.siteLabels);
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

function contactItem({ type, href, label, title = "" }) {
  const iconMeta = CONTACT_ICON_SOURCES[type];
  if (!iconMeta || !isFilled(href)) return "";

  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label || iconMeta.label);
  const safeTitle = escapeHtml(title || label || iconMeta.label);
  const externalAttrs =
    /^https?:/i.test(href) ? ` target="_blank" rel="noopener noreferrer"` : "";

  return `
    <li>
      <a class="contact-icon-link" href="${safeHref}" aria-label="${safeLabel}" title="${safeTitle}"${externalAttrs}>
        <span class="contact-icon-badge">
          <img class="contact-icon-svg" src="${iconMeta.iconUrl}" alt="" decoding="async" referrerpolicy="no-referrer" />
        </span>
      </a>
    </li>
  `;
}

function renderContact(personal = {}, locale = currentLocale) {
  const list = qs(".contact-list");
  if (!list) return;
  const section = list.closest(".sb-section");
  const strings = getLocaleStrings(locale);

  const email = pick(personal.email);
  const phone = pick(personal.phone);
  const github = pick(personal.github);
  const linkedin = pick(personal.linkedin);
  const scholar = pick(personal.google_scholar);
  const orcid = pick(personal.orcid);
  const cv = pick(personal.cv);

  const items = [
    contactItem({
      type: "email",
      href: isFilled(email) ? `mailto:${email}` : "",
      label: `${strings.contact.email}: ${email}`,
      title: email,
    }),
    contactItem({
      type: "phone",
      href: isFilled(phone) ? `tel:${phone.replace(/[^\d+]/g, "")}` : "",
      label: `${strings.contact.phone}: ${phone}`,
      title: phone,
    }),
    contactItem({
      type: "github",
      href: github,
      label: strings.contact.github,
      title: isFilled(github) ? getDomainPath(github) : strings.contact.github,
    }),
    contactItem({ type: "linkedin", href: linkedin, label: strings.contact.linkedin, title: strings.contact.linkedin }),
    contactItem({
      type: "google_scholar",
      href: scholar,
      label: strings.contact.googleScholar,
      title: strings.contact.googleScholar,
    }),
    contactItem({ type: "orcid", href: orcid, label: strings.contact.orcid, title: strings.contact.orcid }),
    contactItem({ type: "cv", href: cv, label: strings.contact.cv, title: strings.contact.cv }),
  ].filter(Boolean);

  list.innerHTML = items.join("\n");
  if (section) section.style.display = items.length > 0 ? "" : "none";
}

function extractCoreSkills(doc = {}) {
  const names = [];
  if (Array.isArray(doc.skills)) {
    doc.skills.forEach((group) => {
      const category = String(group?.category || "").toLowerCase();
      if (category.includes("language") || category.includes("tool")) return;
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

function renderLanguages(doc = {}, locale = currentLocale) {
  const list = qs(".lang-list");
  if (!list) return;
  const section = list.closest(".sb-section");
  const configured = toNamedList(doc.languages);
  const skillGroups = Array.isArray(doc.skills) ? doc.skills : [];
  const fallbackCategory =
    skillGroups.find((group) =>
      String(group?.category || "").toLowerCase().includes("programming language"),
    ) ??
    skillGroups.find((group) => String(group?.category || "").toLowerCase().includes("language"));
  const items = configured.length > 0 ? configured : toNamedList(fallbackCategory?.items);
  if (items.length === 0) {
    list.innerHTML = "";
    if (section) section.style.display = "none";
    return;
  }

  const html = items
    .map((item) => {
      const name = pick(item.name);
      const levelRaw = pick(item.level, "intermediate");
      const level = formatLevel(levelRaw, locale);
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

  list.innerHTML = html;
  if (section) section.style.display = "";
}

function renderTools(doc = {}) {
  const box = qs(".tool-tags");
  if (!box) return;
  const section = box.closest(".sb-section");
  const configured = toNamedList(doc.tools);
  const fallbackCategory = (Array.isArray(doc.skills) ? doc.skills : []).find((group) =>
    String(group?.category || "").toLowerCase().includes("tool"),
  );
  const items = configured.length > 0 ? configured : toNamedList(fallbackCategory?.items);

  if (items.length === 0) {
    box.innerHTML = "";
    if (section) section.style.display = "none";
    return;
  }

  box.innerHTML = items.map((item) => `<span class="tool-tag">${escapeHtml(item.name)}</span>`).join("");
  if (section) section.style.display = "";
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

function renderEducation(doc = {}, locale = currentLocale) {
  const section = qs("#educations");
  if (!section) return;
  const list = qs(".overview-edu-list", section);
  if (!list) return;
  const strings = getLocaleStrings(locale);

  const educations = Array.isArray(doc.education) ? doc.education : [];
  if (educations.length === 0) {
    list.innerHTML = `<div class="overview-edu-item"><div class="overview-edu-detail">${escapeHtml(strings.overview.empty)}</div></div>`;
    return;
  }

  const html = educations
    .map((ed) => {
      const degree = pick(ed.degree);
      const major = pick(ed.major);
      const degreeLine =
        normalizeLocale(locale) === "ko"
          ? pick(joinWithSpace([major, degree]), degree, major, strings.defaults.degree)
          : major
            ? `${degree} in ${major}`
            : degree || strings.defaults.degree;
      const institution = pick(ed.institution, ed.institution_full, strings.defaults.institution);
      const period = formatMonthPeriod(ed.period_start, ed.period_end, locale);
      const thesisLine = isFilled(ed.thesis_title) ? `${strings.overview.thesis}: "${ed.thesis_title}"` : "";
      const gpaLine = isFilled(ed.gpa) ? `${strings.overview.gpa} ${ed.gpa} / ${pick(ed.gpa_scale)}` : "";
      const descriptionLine = pick(ed.description);

      return `
        <div class="overview-edu-item">
          <div class="overview-edu-period">${escapeHtml(period)}</div>
          <div class="overview-edu-main">${escapeHtml(`${degreeLine} / ${institution}`)}</div>
          ${isFilled(thesisLine) ? `<div class="overview-edu-detail">${escapeHtml(thesisLine)}</div>` : ""}
          ${isFilled(gpaLine) ? `<div class="overview-edu-detail">${escapeHtml(gpaLine)}</div>` : ""}
          ${isFilled(descriptionLine) ? `<div class="overview-edu-detail">${escapeHtml(descriptionLine)}</div>` : ""}
        </div>
      `;
    })
    .join("\n");

  list.innerHTML = html;
}

function renderOverviewStats(doc = {}, locale = currentLocale) {
  const section = qs("#educations");
  if (!section) return;
  const box = qs(".overview-edu-stats", section);
  if (!box) return;
  const strings = getLocaleStrings(locale);

  const stats = [
    {
      label: strings.nav.publications,
      value: Array.isArray(doc.publications) ? doc.publications.length : 0,
      kind: "publications",
      target: "publications",
    },
    {
      label: strings.nav.patents,
      value: Array.isArray(doc.patents) ? doc.patents.length : 0,
      kind: "patents",
      target: "patents",
    },
    {
      label: strings.nav.projects,
      value: Array.isArray(doc.projects) ? doc.projects.length : 0,
      kind: "projects",
      target: "projects",
    },
  ];

  box.innerHTML = stats
    .map(
      ({ label, value, kind, target }) => `
        <button type="button" class="overview-edu-stat overview-edu-stat-${kind}" data-target="${escapeHtml(target)}" aria-label="${escapeHtml(sectionJumpAria(label, locale))}">
          <div class="overview-edu-stat-label">${escapeHtml(label)}</div>
          <div class="overview-edu-stat-value">${escapeHtml(String(value).padStart(2, "0"))}</div>
        </button>
      `,
    )
    .join("\n");

  qsa(".overview-edu-stat[data-target]", box).forEach((card) => {
    if (card.dataset.navBound === "1") return;
    card.dataset.navBound = "1";
    card.addEventListener("click", () => {
      navigateToSectionId(card.dataset.target);
    });
  });
}

function buildPublicationCards(doc = {}, locale = currentLocale) {
  const publications = Array.isArray(doc.publications) ? doc.publications : [];
  const personal = doc.personal || {};
  const strings = getLocaleStrings(locale);
  const total = publications.length;

  return publications.map((pub, index) => {
    const venue = pick(
      pub.conference,
      pub.journal,
      pub.conference_abbr,
      pub.journal_abbr,
      strings.defaults.publication,
    );
    const year = pick(pub.year);
    const title = pick(pub.title, "Untitled");
    const link = pick(pub.project_page, pub.pdf, pub.arxiv, pub.code, pub.video, pub.slides);
    const linkLabel = pub.code && link === pub.code ? strings.contact.github : strings.placeholders.readMore;
    const authorsHtml = formatAuthorsHtml(pick(pub.authors, pub.author), personal);
    const statusRaw = String(pub.status || "").toLowerCase().trim();
    const isUnderReview = statusRaw.includes("under_review") || statusRaw.includes("under review");
    const venueClass = `pub-venue${isUnderReview ? " pub-venue-under-review" : ""}`;
    const indexLabel = publicationIndexLabel(pub);
    const indexClass = indexLabel === "SCI" ? "pub-index pub-index-sci" : "pub-index pub-index-kci";
    const statusLabel = publicationStatusLabel(pub.status, locale);
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
      <div class="pub-card pub-card-publication pub-card-indexed${sciCardClass}">
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

function buildProjectCards(doc = {}, locale = currentLocale) {
  const projects = Array.isArray(doc.projects) ? doc.projects : [];
  const strings = getLocaleStrings(locale);

  return projects.map((project, index) => {
    const period = formatMonthPeriod(project.period_start, project.period_end, locale);
    const title = pick(project.title, strings.defaults.project);
    const description = pick(project.description, summarizeText((project.highlights || []).join(" "), 220));
    const link = pick(project.link, project.github);
    const linkLabel = project.github && link === project.github ? strings.contact.github : strings.placeholders.projectPage;
    const semiconductorClass = isSemiconductorProject(project) ? " pub-card-project-semiconductor" : "";
    const fundingLabel = pick(project.funding, strings.defaults.project);
    const serialLabel = String(projects.length - index).padStart(2, "0");

    return `
      <div class="pub-card pub-card-project pub-card-indexed${semiconductorClass}">
        <span class="pub-serial-mark" aria-hidden="true">${escapeHtml(serialLabel)}</span>
        <div class="pub-meta">
          <span class="pub-venue">${escapeHtml(fundingLabel)}</span>
          <span class="pub-year">${escapeHtml(period)}</span>
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

function buildPatentCards(doc = {}, locale = currentLocale) {
  const patents = Array.isArray(doc.patents) ? doc.patents : [];
  const strings = getLocaleStrings(locale);
  const typeMap = strings.patentType;
  const total = patents.length;

  return patents.map((patent, index) => {
    const typeRaw = String(patent.type || "").toLowerCase();
    const venue = pick(typeMap[typeRaw], patent.country, strings.defaults.patent);
    const yearSource = pick(patent.registration_date, patent.filing_date);
    const year = pick(String(yearSource).slice(0, 4));
    const title =
      normalizeLocale(locale) === "ko"
        ? pick(patent.title, patent.title_en, strings.defaults.patent)
        : pick(patent.title_en, patent.title, strings.defaults.patent);
    const description = pick(
      patent.description,
      Array.isArray(patent.inventors) ? `${strings.placeholders.inventors}: ${patent.inventors.join(", ")}` : "",
      patent.application_number,
    );
    const statusLabel = patentStatusLabel(patent.status, locale);
    const serialLabel = String(total - index).padStart(2, "0");
    const foreignPatentClass = isForeignPatent(patent) ? " pub-card-patent-foreign" : "";

    return `
      <div class="pub-card pub-card-patent pub-card-indexed${foreignPatentClass}">
        <span class="pub-serial-mark" aria-hidden="true">${escapeHtml(serialLabel)}</span>
        <div class="pub-meta">
          <span class="pub-venue">${escapeHtml(venue)}</span>
          <span class="pub-year">${escapeHtml(year)}</span>
          ${isFilled(statusLabel) ? `<span class="pub-index pub-index-kci">${escapeHtml(statusLabel)}</span>` : ""}
        </div>
        <div class="pub-title">${escapeHtml(title)}</div>
        <p class="pub-desc">${escapeHtml(description)}</p>
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

function renderPublications(doc = {}, locale = currentLocale) {
  const section = qs("#publications") || findSectionByTitle("publication");
  if (!section) return;
  const list = qs(".pub-list", section);
  if (!list) return;
  const heading = qs(".sec-head h2", section);
  const strings = getLocaleStrings(locale);

  const cards = buildPublicationCards(doc, locale);
  if (heading) {
    heading.textContent = `${strings.nav.publications} (${cards.length})`;
  }
  list.innerHTML =
    cards.length > 0 ? cards.join("\n") : placeholderCard(strings.placeholders.publications);
}

function renderPatents(doc = {}, locale = currentLocale) {
  const section = qs("#patents") || findSectionByTitle("patent");
  if (!section) return;
  const list = qs(".patent-list", section);
  if (!list) return;
  const heading = qs(".sec-head h2", section);
  const strings = getLocaleStrings(locale);

  const cards = buildPatentCards(doc, locale);
  if (heading) {
    heading.textContent = `${strings.nav.patents} (${cards.length})`;
  }
  list.innerHTML = cards.length > 0 ? cards.join("\n") : placeholderCard(strings.placeholders.patents);
}

function renderProjects(doc = {}, locale = currentLocale) {
  const section = qs("#projects") || findSectionByTitle("project");
  if (!section) return;
  const list = qs(".project-list", section);
  if (!list) return;
  const heading = qs(".sec-head h2", section);
  const strings = getLocaleStrings(locale);

  const cards = buildProjectCards(doc, locale);
  if (heading) {
    heading.textContent = `${strings.nav.projects} (${cards.length})`;
  }
  list.innerHTML = cards.length > 0 ? cards.join("\n") : placeholderCard(strings.placeholders.projects);
}

function renderCV(doc = {}, personal = {}, locale = currentLocale) {
  const section = qs("#cv") || findSectionByTitle("cv");
  if (!section) return;
  const list = qs(".cv-list", section);
  if (!list) return;
  const strings = getLocaleStrings(locale);

  const cvLink = pick(personal.cv, doc.cv);
  if (!isFilled(cvLink)) {
    list.innerHTML = placeholderCard(strings.placeholders.cvMissing);
    return;
  }

  list.innerHTML = `
    <div class="pub-card">
      <div class="pub-meta">
        <span class="pub-venue">${escapeHtml(strings.placeholders.cvVenue)}</span>
      </div>
      <div class="pub-title">${escapeHtml(strings.placeholders.cvTitle)}</div>
      <p class="pub-desc">${escapeHtml(strings.placeholders.cvDescription)}</p>
      <a class="pub-link" href="${escapeHtml(cvLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(strings.placeholders.openCv)}</a>
    </div>
  `;
}

function render(doc = {}, locale = currentLocale) {
  currentLocale = normalizeLocale(locale);
  const orderedSections = ensureMainSectionStructure(currentLocale);
  applyFonts(doc);
  bindLocaleToggle();
  renderLocaleToggle(currentLocale);
  renderSidebarLabels(currentLocale);
  document.documentElement.lang = getLocaleStrings(currentLocale).locale;

  const personal = doc.personal || {};
  const sidebarProfile = getSidebarProfile(doc, personal, currentLocale);
  renderIdentity(doc, personal, currentLocale);
  renderSidebarTopLink(currentLocale);
  renderAvatar(personal, sidebarProfile);
  renderContact(personal, currentLocale);
  renderSkills(doc);
  renderLanguages(doc, currentLocale);
  renderTools(doc);
  renderEducation(doc, currentLocale);
  renderOverviewStats(doc, currentLocale);
  renderPublications(doc, currentLocale);
  renderPatents(doc, currentLocale);
  renderProjects(doc, currentLocale);
  renderCV(doc, personal, currentLocale);
  renderNavigator(orderedSections, currentLocale);
}

async function boot() {
  try {
    resetInitialViewport();
    await ensureYamlLib();
    currentLocale = detectInitialLocale();
    await applyLocale(currentLocale, { resetViewport: false, persist: false });
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


