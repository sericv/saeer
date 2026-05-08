// File: app.js
// إعدادات بطاقة الولاء تُحمَّل من Firestore (settings/loyalty)

console.log("App loaded");

// التأكد من تهيئة Firebase بشكل آمن
let db = null;
try {
  if (!window.firebaseConfig) {
    console.error("Firebase config missing");
  } else if (!firebase.apps.length) {
    firebase.initializeApp(window.firebaseConfig);
  }
  db = firebase.firestore();
} catch (e) {
  console.error("App crash:", e);
}

const cafeId = typeof getResolvedCafeId === "function" ? getResolvedCafeId() : "default";

function withCafeTenant(payload) {
  return Object.assign({}, payload, { cafeId });
}

function settingsScopedRef(scope) {
  return db.collection("settings").doc(`${cafeId}_${scope}`);
}

async function findUserDocByPhone(phone) {
  let snap = await db.collection("users").where("cafeId", "==", cafeId).where("phone", "==", phone).limit(1).get();
  if (!snap.empty) return snap.docs[0];
  if (typeof DEFAULT_CAFE_ID !== "undefined" && cafeId === DEFAULT_CAFE_ID) {
    const snap2 = await db.collection("users").where("phone", "==", phone).limit(15).get();
    const m = snap2.docs.find(d => {
      const u = d.data();
      return !u.cafeId || u.cafeId === DEFAULT_CAFE_ID;
    });
    return m || null;
  }
  return null;
}

function userBelongsToActiveCafe(userData) {
  if (!userData) return false;
  if (!userData.cafeId) return typeof DEFAULT_CAFE_ID !== "undefined" && cafeId === DEFAULT_CAFE_ID;
  return userData.cafeId === cafeId;
}

let currentUser = null;
let currentUserId = null;
let menuCategories = [];
let menuProducts = [];
let menuDataInitialized = false;
let menuRenderQueued = false;
let categoriesReady = false;
let productsReady = false;
let menuCategoriesHydrated = false;
let menuProductsHydrated = false;
let activeCategoryId = null;
let selectedCategory = null;
let currentMenuView = "categories";
let hasNavigationSetup = false;
let userRealtimeUnsubscribe = null;
let categoriesRealtimeUnsubscribe = null;
let productsRealtimeUnsubscribe = null;
let contactRealtimeUnsubscribe = null;
let loyaltySettingsUnsubscribe = null;
let openLoyaltyAfterAuth = false;
let customerCafeMetaUnsubscribe = null;
let generalSettingsUnsubscribe = null;
let featuredMenuTitle = "القائمة المميزة";
let preOrderEnabled = false;
let preorderGeneralSettingsLoaded = false;
let homeBanners = [];
let homeBannerEnabled = true;
let homeBannerIndex = 0;
let homeBannerTimer = null;
let homeBannerTouchStartX = null;
let preOrderWorkingHoursEnabled = false;
let preOrderOpenTime = "08:00";
let preOrderCloseTime = "00:00";
/** @type {{ productId: string, name: string, price: number, image: string, quantity: number }[]} */
let cartLines = [];
let productOptionsModalState = null;
let activeOrderUnsubscribe = null;
let activeOrderDoneHideTimer = null;
/** True while the logged-in customer has an order with status other than done (from snapshot). */
let customerPreorderCartLocked = false;
const ACTIVE_CUSTOMER_ORDER_STATUSES = ["pending", "preparing", "ready"];
const MAX_ORDER_NOTE_LEN = 400;
const preorderResumeInFlight = { current: false };
const preorderReadyNotified = new Set();
let preorderAudioUnlockBound = false;
let currentFontUrl = "";
let dynamicFontLinkEl = null;
const FONT_FAMILY_MAP = {
  tajawal: "'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif",
  cairo: "'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif",
  almarai: "'Almarai', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif",
  ibmplexarabic: "'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif",
  elmessiri: "'El Messiri', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif"
};

function applyCustomerStoreBrandingFromDoc(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const name = d.name != null && String(d.name).trim() ? String(d.name).trim() : "";
  const label = typeof STORE_LABEL !== "undefined" ? STORE_LABEL : "متجر";
  const line = name ? `${label} | ${name}` : label;
  const subEl = document.querySelector("#homeScreen .welcome-subtitle");
  const authStoreEl = document.getElementById("authStoreName");
  if (subEl) subEl.textContent = line;
  if (authStoreEl) authStoreEl.textContent = line;
  document.title = name ? `${line} — ولاء` : "برنامج الولاء";
}

function subscribeCustomerCafeMeta() {
  if (!db || !cafeId || typeof db.collection !== "function") return;
  if (customerCafeMetaUnsubscribe) {
    customerCafeMetaUnsubscribe();
    customerCafeMetaUnsubscribe = null;
  }
  customerCafeMetaUnsubscribe = db.collection("cafes").doc(cafeId).onSnapshot(
    (snap) => applyCustomerStoreBrandingFromDoc(snap.exists ? snap.data() : {}),
    (err) => console.error("cafes meta (customer app)", err)
  );
}

const LOYALTY_ICON_SET = {
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.75l2.55 5.17 5.7.83-4.13 4.02.98 5.67L12 15.76 6.9 18.44l.98-5.67L3.75 8.75l5.7-.83L12 2.75z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9h16v3H4V9zm1 4h6v8H5v-8zm8 0h6v8h-6v-8zM11 3.5c-1.8 0-3 1.1-3 2.6 0 1.2.8 2 2 2.9H4v-1c0-1.7 1.3-3 3-3h4v-1.5zm2 0V5h4c1.7 0 3 1.3 3 3v1h-6c1.2-.9 2-1.7 2-2.9 0-1.5-1.2-2.6-3-2.6z"/></svg>',
  coffee: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 6h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V6zm12 2h2a3 3 0 1 1 0 6h-2V8zM5 20h12v1.5H5V20zm2-15c.5-.8 1.5-1.4 2.4-1.4H10v1.2c0 1.1-.9 2-2 2h-.6C6.8 6.8 6.6 5.7 7 5z"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.6 2.6c.4 2.6-.7 4.2-2.5 6.2-1 1.1-1.8 2.1-1.8 3.7 0 1.8 1.3 3.1 2.9 3.1 1.8 0 3.1-1.5 3.1-3.5 0-.8-.1-1.3-.6-2.4 2 .8 3.5 2.8 3.5 5.3A6.2 6.2 0 0 1 12 21.2 6.2 6.2 0 0 1 5.8 15c0-3.9 2.3-6.3 4.2-8.1 1.2-1.2 2.3-2.2 3.6-4.3z"/></svg>',
  diamond: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.2 3h9.6l4.2 5-9 13-9-13 4.2-5zm2.2 2L8 7.5h3.2L9.4 5zm5.2 0-1.8 2.5H16L14.6 5zM6.2 9.5l5.8 8.4 5.8-8.4H6.2z"/></svg>',
  reward: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 3h10v4.5a4.5 4.5 0 0 1-4.5 4.5h-1A4.5 4.5 0 0 1 7 7.5V3zm-2 1h2v3a5.9 5.9 0 0 1-.2 1.5A3.5 3.5 0 0 1 5 2.5V4zm14 0V2.5a3.5 3.5 0 0 1-1.8 6A5.9 5.9 0 0 1 17 7V4h2zm-9 9h4v2h-1v2.2a3 3 0 1 1-2 0V15h-1v-2z"/></svg>'
};

function getLoyaltyIconSvg(iconName) {
  return LOYALTY_ICON_SET[iconName] || LOYALTY_ICON_SET.star;
}

function mergeLoyaltyData(docSnap) {
  const d = docSnap && docSnap.exists ? docSnap.data() : {};
  const visits = Math.max(1, Number(d.visitsRequired || d.visitsTarget || 6));
  const incomingStyle = d.progressStyle === "steps" ? "circles" : d.progressStyle;
  return {
    backgroundImage: d.backgroundImage || "",
    overlayOpacity: d.overlayOpacity != null ? Math.min(1, Math.max(0, Number(d.overlayOpacity))) : 0.5,
    title: d.title || "بطاقة الولاء",
    subtitle: d.subtitle || "",
    rewardText: d.rewardText || "كل زيارة تقربك من مكافأتك",
    pointsLabel: d.pointsLabel || "نقاطك الحالية",
    progressText: d.progressText || "{remaining} زيارات تفصلك عن مكافأتك",
    completionMessage:
      d.completionMessage ||
      d.rewardMessage ||
      "مبروك! يمكنك استلام مكافأتك الآن",
    icon: d.icon || "star",
    visitsRequired: visits,
    progressStyle: ["circles", "bar", "grid", "minimal", "segments"].includes(incomingStyle) ? incomingStyle : "circles",
    introTitle: d.introTitle || "✨ ما هو برنامج الولاء؟",
    introSubtitle: d.introSubtitle || "انضم الآن واجمع النقاط بسهولة",
    introDescription: d.introDescription || "كل طلب منك يقرّبك من مكافآت مميزة.",
    introButtonText: d.introButtonText || "ابدأ رحلتك",
    introIllustration: d.introIllustration || "",
    introBullets: Array.isArray(d.introBullets) ? d.introBullets.filter(Boolean).slice(0, 6) : [],
    rewards: Array.isArray(d.rewards) ? d.rewards : []
  };
}

let loyaltyConfig = mergeLoyaltyData(null);
const RIYAL_ICON_SVG = `<svg class="riyal-icon" viewBox="0 0 400 400"><path d="M240.555 382.706C233.658 398 229.098 414.597 227.352 432.003L373.316 400.974C380.214 385.684 384.769 369.083 386.52 351.678L240.555 382.706Z" fill="currentColor"/><path d="M373.316 308.014C380.213 292.723 384.772 276.123 386.519 258.717L272.817 282.9V236.412L373.312 215.056C380.21 199.765 384.769 183.165 386.516 165.759L272.814 189.921V22.7383C255.391 32.5206 239.918 45.5419 227.341 60.9013V199.59L181.868 209.256V0C164.445 9.77887 148.972 22.8036 136.394 38.1631V218.917L34.6481 240.538C27.7506 255.829 23.1878 272.43 21.4376 289.835L136.394 265.405V323.948L13.1957 350.128C6.29825 365.418 1.73891 382.019 -0.0078125 399.424L128.947 372.02C139.444 369.837 148.467 363.63 154.333 355.089L177.982 320.028V320.021C180.437 316.393 181.868 312.02 181.868 307.309V255.74L227.341 246.074V339.049L373.312 308.007L373.316 308.014Z" fill="currentColor"/></svg>`;
let themeUnsubscribe = null;
const THEME_PRESETS = {
  "Warm Brown": { primary: "#8C5A3C", secondary: "#4E3527", bgLight: "#F8F2EC", bgMuted: "#F1E7DE", surfaceSoft: "#FFFDFC", border: "#E8D8CA", textDark: "#2E231C", textLight: "#786153", accentSoft: "#EADBCF", accentHover: "#704933", gradientMain: "linear-gradient(135deg, #A06C4B, #4E3527)", gradientSoft: "linear-gradient(155deg, #F4E8DD, #FFFDFB)" },
  "Soft Beige": { primary: "#B89C78", secondary: "#6B5642", bgLight: "#FBF7F1", bgMuted: "#F3ECE2", surfaceSoft: "#FFFFFF", border: "#E9DDCF", textDark: "#2E2720", textLight: "#7A6A58", accentSoft: "#EFE3D5", accentHover: "#8E7559", gradientMain: "linear-gradient(135deg, #C7AC87, #6B5642)", gradientSoft: "linear-gradient(155deg, #F7EFE6, #FFFFFF)" },
  "Elegant Black": { primary: "#3D3D42", secondary: "#18191D", bgLight: "#F3F4F6", bgMuted: "#E8EAEE", surfaceSoft: "#FFFFFF", border: "#D4D9E1", textDark: "#191C22", textLight: "#59606D", accentSoft: "#DDE2EA", accentHover: "#2A2E39", gradientMain: "linear-gradient(135deg, #50535B, #18191D)", gradientSoft: "linear-gradient(155deg, #EEF0F4, #FFFFFF)" },
  "Olive Green": { primary: "#6D7A4C", secondary: "#3F4B2F", bgLight: "#F6F8F1", bgMuted: "#EBF0E2", surfaceSoft: "#FCFDF9", border: "#D7E0C7", textDark: "#222A1B", textLight: "#5E6C4C", accentSoft: "#E2EAD4", accentHover: "#55613A", gradientMain: "linear-gradient(135deg, #7F8C5B, #3F4B2F)", gradientSoft: "linear-gradient(155deg, #EFF4E5, #FCFDF9)" },
  "Sage Green": { primary: "#7D9B8A", secondary: "#496356", bgLight: "#F3F8F5", bgMuted: "#E6F0EA", surfaceSoft: "#FCFFFD", border: "#D0E0D7", textDark: "#1E2D25", textLight: "#556C60", accentSoft: "#DCEAE2", accentHover: "#628071", gradientMain: "linear-gradient(135deg, #8DAA9A, #496356)", gradientSoft: "linear-gradient(155deg, #EBF4EF, #FCFFFD)" },
  "Ocean Blue": { primary: "#4F87A8", secondary: "#2D5873", bgLight: "#F2F8FC", bgMuted: "#E2EEF6", surfaceSoft: "#FBFEFF", border: "#CFE1EE", textDark: "#1D2B35", textLight: "#4E6678", accentSoft: "#DAEAF5", accentHover: "#3F7393", gradientMain: "linear-gradient(135deg, #5D97B9, #2D5873)", gradientSoft: "linear-gradient(155deg, #EAF3FA, #FBFEFF)" },
  "Royal Blue": { primary: "#3F61B3", secondary: "#273C7A", bgLight: "#F3F6FD", bgMuted: "#E5EBFA", surfaceSoft: "#FCFDFF", border: "#D2DCF5", textDark: "#1A2440", textLight: "#4D5C88", accentSoft: "#DEE5F8", accentHover: "#34529B", gradientMain: "linear-gradient(135deg, #4A6CC2, #273C7A)", gradientSoft: "linear-gradient(155deg, #ECF1FC, #FCFDFF)" },
  "Soft Pink": { primary: "#B8869D", secondary: "#7A5568", bgLight: "#FDF6F9", bgMuted: "#F6EAF0", surfaceSoft: "#FFFCFE", border: "#ECD8E2", textDark: "#34222B", textLight: "#7B5D6B", accentSoft: "#F0DFE7", accentHover: "#9E6F84", gradientMain: "linear-gradient(135deg, #C395AB, #7A5568)", gradientSoft: "linear-gradient(155deg, #F8EEF3, #FFFCFE)" },
  "Luxury Purple": { primary: "#6F4D95", secondary: "#412B5B", bgLight: "#F6F2FA", bgMuted: "#ECE3F5", surfaceSoft: "#FDFBFF", border: "#DCCFEA", textDark: "#271D35", textLight: "#645478", accentSoft: "#E6DCF1", accentHover: "#5E4184", gradientMain: "linear-gradient(135deg, #815DAA, #412B5B)", gradientSoft: "linear-gradient(155deg, #F0EAF7, #FDFBFF)" }
};
const LEGACY_THEME_ALIASES = {
  Gold: "Warm Brown",
  "Dark Coffee": "Warm Brown",
  Olive: "Olive Green",
  Latte: "Soft Beige",
  Minimal: "Elegant Black"
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex) {
  const s = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}

function rgbToHex(r, g, b) {
  const parts = [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"));
  return `#${parts.join("")}`;
}

function mixColor(hexA, hexB, ratio) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const t = clamp(Number(ratio) || 0, 0, 1);
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function getResolvedThemeName(themeName) {
  const normalized = String(themeName || "").trim();
  if (THEME_PRESETS[normalized]) return normalized;
  if (LEGACY_THEME_ALIASES[normalized]) return LEGACY_THEME_ALIASES[normalized];
  return "Warm Brown";
}

// ==================== VALIDATION ====================
function validatePhone(phone) {
  return /^05\d{8}$/.test(phone);
}

// ==================== RENDER PROGRESS STEPS ====================
function renderProgressSteps(visits, layoutMode = "circles") {
  const container = document.getElementById("stepsContainer");
  if (!container) return;

  const max = loyaltyConfig.visitsRequired || 6;
  const activeIcon = getLoyaltyIconSvg(loyaltyConfig.icon);
  container.classList.toggle("mode-grid", layoutMode === "grid");
  container.classList.toggle("mode-circles-wrap", layoutMode === "circles" && max > 6);
  container.classList.toggle("mode-circles-inline", layoutMode === "circles" && max <= 6);
  let html = "";
  for (let i = 0; i < max; i++) {
    const stepNumber = i + 1;
    let stepClass = "";
    let innerHtml = "";

    if (visits > i) {
      stepClass = "completed";
      innerHtml = '<i class="fas fa-check"></i>';
    } else if (visits === i) {
      stepClass = "current";
      innerHtml = `<span class="step-icon">${activeIcon}</span>`;
    } else {
      stepClass = "empty";
      innerHtml = "";
    }

    html += `
      <div class="step-item">
        <div class="step-circle ${stepClass}">
          ${innerHtml}
        </div>
        <div class="step-number">${stepNumber}</div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function updateLoyaltyBar(visits) {
  const max = loyaltyConfig.visitsRequired || 6;
  const barFill = document.getElementById("loyaltyBarFill");
  if (barFill) {
    const pct = Math.min(100, (visits / max) * 100);
    barFill.style.width = `${pct}%`;
  }
}

function renderSegmentedProgress(visits) {
  const wrap = document.getElementById("loyaltySegmentsWrap");
  if (!wrap) return;
  const max = loyaltyConfig.visitsRequired || 6;
  let html = "";
  for (let i = 0; i < max; i++) {
    const done = visits > i;
    const current = visits === i;
    html += `<span class="loyalty-segment ${done ? "done" : ""} ${current ? "current" : ""}"></span>`;
  }
  wrap.innerHTML = html;
}

function renderMinimalProgress(visits) {
  const v = document.getElementById("loyaltyMinimalVisits");
  const t = document.getElementById("loyaltyMinimalTotal");
  const l = document.getElementById("loyaltyMinimalLabel");
  const max = loyaltyConfig.visitsRequired || 6;
  if (v) v.textContent = String(visits);
  if (t) t.textContent = String(max);
  if (l) l.textContent = loyaltyConfig.pointsLabel || "تقدمك الحالي";
}

function updateProgressMessage(visits) {
  const msgContainer = document.getElementById("progressMessage");
  const msgText = document.getElementById("progressText");
  const iconEl = document.getElementById("progressMessageIcon");
  if (iconEl) iconEl.innerHTML = getLoyaltyIconSvg(loyaltyConfig.icon);
  if (!msgContainer || !msgText) return;

  const max = loyaltyConfig.visitsRequired || 6;
  const remaining = Math.max(0, max - visits);

  if (visits >= max) {
    const done =
      (loyaltyConfig.completionMessage || "")
        .replace(/\{visits\}/g, String(visits))
        .replace(/\{total\}/g, String(max));
    msgText.innerHTML = done || "مبروك!";
    msgContainer.style.background = "linear-gradient(135deg, rgba(201, 160, 61, 0.3), rgba(184, 134, 11, 0.2))";
    msgContainer.style.border = "1px solid var(--gold-primary)";
  } else {
    msgContainer.style.background = "#F5F0E8";
    msgContainer.style.border = "none";
    const tmpl = loyaltyConfig.progressText || "{remaining} زيارات تفصلك عن مكافأتك";
    const out = tmpl
      .replace(/\{remaining\}/g, String(remaining))
      .replace(/\{visits\}/g, String(visits))
      .replace(/\{total\}/g, String(max));
    msgText.textContent = out;
  }
}

function updateProgressRegion(visits) {
  const stepsWrap = document.getElementById("stepsContainer");
  const barWrap = document.getElementById("loyaltyBarWrap");
  const segmentsWrap = document.getElementById("loyaltySegmentsWrap");
  const minimalWrap = document.getElementById("loyaltyMinimalWrap");
  const mode = loyaltyConfig.progressStyle || "circles";

  if (stepsWrap) stepsWrap.style.display = "none";
  if (barWrap) barWrap.style.display = "none";
  if (segmentsWrap) segmentsWrap.style.display = "none";
  if (minimalWrap) minimalWrap.style.display = "none";

  if (mode === "bar") {
    if (barWrap) barWrap.style.display = "block";
    updateLoyaltyBar(visits);
  } else if (mode === "segments") {
    if (segmentsWrap) segmentsWrap.style.display = "grid";
    renderSegmentedProgress(visits);
  } else if (mode === "minimal") {
    if (minimalWrap) minimalWrap.style.display = "grid";
    renderMinimalProgress(visits);
  } else if (mode === "grid") {
    if (stepsWrap) stepsWrap.style.display = "grid";
    renderProgressSteps(visits, "grid");
  } else {
    if (stepsWrap) stepsWrap.style.display = "flex";
    renderProgressSteps(visits, "circles");
  }
  updateProgressMessage(visits);
}

// ==================== UPDATE UI ====================
function updateClientUI() {
  if (!currentUser) return;
  
  const visits = currentUser.visits || 0;
  const maxPts = loyaltyConfig.visitsRequired || 6;
  const hasCompleted = visits >= maxPts;
  
  const elements = {
    homeName: document.getElementById("homeName"),
    homePoints: document.getElementById("homePoints"),
    heroName: document.getElementById("heroName"),
    heroCode: document.getElementById("heroCode"),
    loyaltyPoints: document.getElementById("loyaltyPoints"),
    profileName: document.getElementById("profileName"),
    profileCode: document.getElementById("profileCode"),
    profilePhone: document.getElementById("profilePhone"),
    profilePoints: document.getElementById("profilePoints"),
    profileVisits: document.getElementById("profileVisits"),
    pointsTotal: document.getElementById("pointsTotal")
  };
  
  if (elements.homeName) elements.homeName.innerHTML = currentUser.name.split(' ')[0] || currentUser.name;
  if (elements.homePoints) elements.homePoints.innerText = visits;
  if (elements.heroName) elements.heroName.innerText = currentUser.name;
  if (elements.heroCode) elements.heroCode.innerText = currentUser.code;
  if (elements.loyaltyPoints) elements.loyaltyPoints.innerText = visits;
  if (elements.profileName) elements.profileName.innerText = currentUser.name;
  if (elements.profileCode) elements.profileCode.innerText = currentUser.code;
  if (elements.profilePhone) elements.profilePhone.innerText = currentUser.phone;
  if (elements.profilePoints) elements.profilePoints.innerText = visits;
  if (elements.profileVisits) elements.profileVisits.innerText = visits;
  if (elements.pointsTotal) elements.pointsTotal.innerText = maxPts;
  
  const loyaltyCard = document.querySelector(".points-card");
  const heroCard = document.getElementById("heroImageCard");
  
  if (hasCompleted) {
    if (loyaltyCard) loyaltyCard.classList.add("completed-card");
    if (heroCard) heroCard.classList.add("completed-hero");
  } else {
    if (loyaltyCard) loyaltyCard.classList.remove("completed-card");
    if (heroCard) heroCard.classList.remove("completed-hero");
  }
  
  updateProgressRegion(visits);
  renderRewardsShowcase(visits);
  updateProfileActionButton();
  updateHomeLoyaltyCardState();
  updateCartChrome();
}

function updateGuestUI() {
  const elements = {
    homeName: document.getElementById("homeName"),
    homePoints: document.getElementById("homePoints"),
    profileName: document.getElementById("profileName"),
    profileCode: document.getElementById("profileCode"),
    profilePhone: document.getElementById("profilePhone"),
    profilePoints: document.getElementById("profilePoints"),
    profileVisits: document.getElementById("profileVisits")
  };

  if (elements.homeName) elements.homeName.innerText = "ضيفنا";
  if (elements.homePoints) elements.homePoints.innerText = "0";
  if (elements.profileName) elements.profileName.innerText = "ضيف";
  if (elements.profileCode) elements.profileCode.innerText = "-----";
  if (elements.profilePhone) elements.profilePhone.innerText = "سجّل دخولك لتفعيل الولاء";
  if (elements.profilePoints) elements.profilePoints.innerText = "0";
  if (elements.profileVisits) elements.profileVisits.innerText = "0";
  const totalEl = document.getElementById("pointsTotal");
  if (totalEl) totalEl.innerText = String(loyaltyConfig.visitsRequired || 6);
  renderRewardsShowcase(0);
  updateProfileActionButton();
  updateHomeLoyaltyCardState();
  updateCartChrome();
}

// ==================== MENU (DISPLAY ONLY) ====================
function defaultMenuData() {
  return {
    categories: [
      {
        id: "espresso",
        name: "اسبريسو",
        description: "نكهات مركزة لعشاق القهوة الأصيلة.",
        imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=900",
        visible: true,
        sortOrder: 1
      },
      {
        id: "signature",
        name: "مختارات",
        description: "مشروبات بتوقيع خاص ولمسة فاخرة.",
        imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=900",
        visible: true,
        sortOrder: 2
      },
      {
        id: "desserts",
        name: "حلويات",
        description: "تحليات يومية متوازنة مع قهوتك.",
        imageUrl: "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=900",
        visible: true,
        sortOrder: 3
      }
    ],
    products: [
      {
        id: "p1",
        name: "لاتيه الزعفران",
        categoryId: "signature",
        description: "حليب مبخر مع نغمة زعفران ولمسة قرفة.",
        price: "24",
        calories: 180,
        imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=900",
        sortOrder: 1
      },
      {
        id: "p2",
        name: "كورتادو كلاسيك",
        categoryId: "espresso",
        description: "توازن ناعم بين الاسبريسو والحليب.",
        price: "18",
        imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=900",
        sortOrder: 2
      },
      {
        id: "p3",
        name: "تشيزكيك الفستق",
        categoryId: "desserts",
        description: "تشيزكيك كريمي بطبقة فستق محمص.",
        price: "28",
        imageUrl: "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=900",
        sortOrder: 3
      }
    ]
  };
}

/** Placeholder when product has no image (optional image in cashier). */
const MENU_IMAGE_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320" viewBox="0 0 400 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f5ebe0"/><stop offset="100%" stop-color="#e8dcc8"/></linearGradient></defs><rect width="400" height="320" fill="url(#g)"/></svg>'
  );

function getProductCaloriesNumber(product) {
  const c = product?.calories;
  if (c == null || c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Price (prominent, inline-end in RTL) + optional calories (lighter, inline-start). */
function formatProductPriceAndCalories(product) {
  const rawValue = product.priceText || product.price;
  const normalized = String(rawValue ?? "")
    .replace(/ر\.?\s*س/gi, "")
    .replace(/SAR/gi, "")
    .trim();
  const priceHtml = normalized
    ? `<span class="premium-product-price"><span class="price">${normalized}${RIYAL_ICON_SVG}</span></span>`
    : `<span class="premium-product-price">—</span>`;
  const calN = getProductCaloriesNumber(product);
  const calHtml =
    calN != null ? `<span class="premium-product-calories">${calN} سعرة</span>` : "";
  return `<div class="premium-product-price-row">${priceHtml}${calHtml}</div>`;
}

function getItemImage(item) {
  const src = item?.image || item?.imageUrl || "";
  return src || MENU_IMAGE_PLACEHOLDER;
}

function normalizeProductOptionGroups(product) {
  const groups = Array.isArray(product?.optionGroups) ? product.optionGroups : [];
  return groups
    .filter((g) => g && g.enabled !== false && Array.isArray(g.options))
    .map((g, groupIdx) => ({
      id: String(g.id || `g_${groupIdx}`),
      title: String(g.title || "خيارات").trim() || "خيارات",
      type: g.type === "single" ? "single" : "multi",
      options: g.options
        .filter((o) => o && o.enabled !== false)
        .map((o, optIdx) => ({
          id: String(o.id || `${groupIdx}_${optIdx}`),
          title: String(o.title || "خيار").trim() || "خيار",
          additionalPrice: Math.max(0, Number(o.additionalPrice || 0)),
          image: String(o.image || "").trim()
        }))
        .filter((o) => o.title)
    }))
    .filter((g) => g.options.length);
}

function normalizeSelectedOptionsForStorage(selectedOptions) {
  const list = Array.isArray(selectedOptions) ? selectedOptions : [];
  return list
    .map((o) => ({
      groupId: String(o.groupId || ""),
      groupTitle: String(o.groupTitle || "خيارات"),
      optionId: String(o.optionId || ""),
      title: String(o.title || "خيار"),
      additionalPrice: Math.max(0, Number(o.additionalPrice || 0))
    }))
    .filter((o) => o.title)
    .sort((a, b) => `${a.groupId}_${a.optionId}`.localeCompare(`${b.groupId}_${b.optionId}`));
}

function calculateOptionsExtra(selectedOptions) {
  return normalizeSelectedOptionsForStorage(selectedOptions).reduce((sum, o) => sum + Number(o.additionalPrice || 0), 0);
}

function productLineId(productId, selectedOptions) {
  const normalized = normalizeSelectedOptionsForStorage(selectedOptions);
  if (!normalized.length) return String(productId);
  const key = normalized.map((o) => `${o.groupId}:${o.optionId}`).join("|");
  return `${productId}__${encodeURIComponent(key)}`;
}

function scheduleMenuRender() {
  if (menuRenderQueued) return;
  menuRenderQueued = true;
  requestAnimationFrame(() => {
    menuRenderQueued = false;
    renderMenu();
    updateCartChrome();
  });
}

function renderCategorySkeleton(count = 3) {
  const categoriesContainer = document.getElementById("menuCategories");
  if (!categoriesContainer) return;
  categoriesContainer.innerHTML = Array.from({ length: count }).map(() => `
    <div class="menu-skeleton-card">
      <div class="menu-skeleton-shimmer"></div>
    </div>
  `).join("");
}

function renderProductSkeleton(count = 4) {
  const grid = document.getElementById("premiumProductsGrid");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: count }).map(() => `
    <div class="menu-skeleton-product">
      <div class="menu-skeleton-shimmer"></div>
    </div>
  `).join("");
}

function isMostPopular(product) {
  return product?.mostPopular === true || product?.isPopular === true;
}

function isNewProduct(product) {
  return product?.isNew === true;
}

function updateHomeLoyaltyCardState() {
  const inviteCard = document.getElementById("loyaltyInviteCard");
  const statusCard = document.getElementById("loyaltyStatusCard");
  if (inviteCard) inviteCard.style.display = "none";
  if (statusCard) statusCard.style.display = "none";
}

function normalizeFontFamilyKey(raw) {
  return String(raw || "").toLowerCase().replace(/[\s_-]/g, "");
}

function getFontHrefByKey(key) {
  const normalized = normalizeFontFamilyKey(key);
  if (normalized === "tajawal") return "https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&display=swap";
  if (normalized === "cairo") return "https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap";
  if (normalized === "almarai") return "https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&display=swap";
  if (normalized === "ibmplexarabic" || normalized === "ibmplexsansarabic") {
    return "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;700&display=swap";
  }
  if (normalized === "elmessiri") return "https://fonts.googleapis.com/css2?family=El+Messiri:wght@400;500;600;700&display=swap";
  return "";
}

function ensureDynamicFontLink(url) {
  if (!url) return;
  if (!dynamicFontLinkEl) {
    dynamicFontLinkEl = document.createElement("link");
    dynamicFontLinkEl.rel = "stylesheet";
    dynamicFontLinkEl.id = "dynamicFontLink";
    document.head.appendChild(dynamicFontLinkEl);
  }
  if (dynamicFontLinkEl.href !== url) dynamicFontLinkEl.href = url;
}

function applyGlobalFontSettings(themeData = {}) {
  const key = normalizeFontFamilyKey(themeData.fontFamily);
  const customFontUrl = String(themeData.customFontUrl || "").trim();
  const root = document.documentElement;
  let nextFontFamily = FONT_FAMILY_MAP[key] || FONT_FAMILY_MAP.cairo;
  const fontHref = getFontHrefByKey(key);
  if (fontHref) ensureDynamicFontLink(fontHref);

  if (customFontUrl && customFontUrl !== currentFontUrl) {
    let styleEl = document.getElementById("customRuntimeFontFace");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "customRuntimeFontFace";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@font-face{font-family:'CustomArabicFont';src:url('${customFontUrl}') format('woff2'),url('${customFontUrl}') format('woff'),url('${customFontUrl}') format('truetype');font-display:swap;}`;
    nextFontFamily = "'CustomArabicFont', " + nextFontFamily;
    currentFontUrl = customFontUrl;
  } else if (!customFontUrl) {
    const styleEl = document.getElementById("customRuntimeFontFace");
    if (styleEl) styleEl.remove();
    currentFontUrl = "";
  }
  root.style.setProperty("--app-font-family", nextFontFamily);
}

function applyFeaturedMenuTitle(titleRaw) {
  const title = String(titleRaw || "").trim() || "القائمة المميزة";
  featuredMenuTitle = title;
  const titleEl = document.getElementById("featuredMenuTitle");
  if (titleEl) titleEl.textContent = title;
}

function getVisibleCategories() {
  const list = menuCategoriesHydrated ? menuCategories : defaultMenuData().categories;
  return list.filter(category => category.visible !== false);
}

function getVisibleProducts() {
  const list = menuProductsHydrated ? menuProducts : defaultMenuData().products;
  return list.filter(product => product.visible !== false);
}

function renderMenuCategories() {
  const categoriesContainer = document.getElementById("menuCategories");
  if (!categoriesContainer) return;

  const categories = getVisibleCategories();
  if (!categories.length) {
    categoriesContainer.innerHTML = `<div class="empty-posts"><i class="fas fa-layer-group"></i><p>لا توجد فئات متاحة حالياً</p></div>`;
    return;
  }

  const products = getVisibleProducts();
  const categoriesWithNewProducts = new Set(products.filter(isNewProduct).map(product => product.categoryId));
  categoriesContainer.innerHTML = categories.map(category => `
    <article class="category-card ${getItemImage(category) === MENU_IMAGE_PLACEHOLDER ? "category-card--no-image" : ""}" tabindex="0" onclick="openMenuCategory('${category.id}')">
      ${getItemImage(category) === MENU_IMAGE_PLACEHOLDER ? "" : `<img class="category-card-image" src="${getItemImage(category)}" alt="${category.name || "فئة"}" loading="lazy" decoding="async">`}
      ${categoriesWithNewProducts.has(category.id) ? `<span class="category-new-badge">جديد</span>` : ""}
      <div class="category-card-overlay"></div>
      <div class="category-card-body">
        <h4 class="category-card-title">${category.name || "فئة"}</h4>
        ${category.description && String(category.description).trim() ? `<p class="category-card-description">${String(category.description).trim()}</p>` : ""}
      </div>
    </article>
  `).join("");
}

function getFilteredProducts() {
  const products = getVisibleProducts();
  if (!activeCategoryId) return [];
  return products.filter(product => product.categoryId === activeCategoryId);
}

function renderProductsGrid() {
  const grid = document.getElementById("premiumProductsGrid");
  const countBadge = document.getElementById("productsCountBadge");
  const title = document.getElementById("activeCategoryTitle");
  const description = document.getElementById("activeCategoryDescription");
  if (!grid) return;

  const filteredProducts = getFilteredProducts();
  if (title) {
    title.innerText = selectedCategory?.name || "الفئة";
  }
  if (description) {
    const desc = (selectedCategory?.description && String(selectedCategory.description).trim()) || "";
    description.innerText = desc;
    description.style.display = desc ? "" : "none";
  }
  if (countBadge) {
    countBadge.innerText = `${filteredProducts.length} منتج`;
  }

  if (!filteredProducts.length) {
    grid.innerHTML = `<div class="empty-posts"><i class="fas fa-mug-hot"></i><p>لا توجد منتجات في هذه الفئة</p></div>`;
    return;
  }

  const allowCartUi = preOrderEnabled && preorderGeneralSettingsLoaded;
  const showQuickAdd = allowCartUi && isPreorderAvailableNow() && !isCustomerPreorderCartLockedForUi();
  grid.innerHTML = filteredProducts
    .map(product => `
      <article class="premium-product-card${allowCartUi ? " premium-product-card--cart" : ""}" onclick="openProductOptionsModal('${product.id}')">
        <img class="premium-product-image" src="${getItemImage(product)}" alt="${product.name || "منتج"}" loading="lazy" decoding="async">
        ${isMostPopular(product) || isNewProduct(product) ? `<div class="product-card-badges">${isMostPopular(product) ? `<span class="menu-popular-badge"><i class="fas fa-fire"></i> الأكثر طلباً</span>` : ""}${isNewProduct(product) ? `<span class="menu-new-badge">جديد</span>` : ""}</div>` : ""}
        ${showQuickAdd ? `<button type="button" class="product-quick-add" data-quick-add="${product.id}" onclick="openProductOptionsModal('${product.id}', true); event.stopPropagation();" aria-label="إضافة للسلة"><i class="fas fa-plus"></i></button>` : ""}
        <div class="premium-product-body">
          <h4 class="premium-product-name">${product.name || "منتج"}</h4>
          ${formatProductPriceAndCalories(product)}
          ${product.description && String(product.description).trim() ? `<p>${String(product.description).trim()}</p>` : ""}
        </div>
      </article>
    `)
    .join("");
}

function openProductOptionsModal(productId, forceCartIntent) {
  const product = getVisibleProducts().find((p) => p.id === productId);
  if (!product) return;
  const modal = document.getElementById("productOptionsModal");
  const groupsRoot = document.getElementById("productOptionsGroups");
  const titleEl = document.getElementById("productOptionsTitle");
  const descEl = document.getElementById("productOptionsDesc");
  const imageEl = document.getElementById("productOptionsImage");
  const addBtn = document.getElementById("productOptionsAddBtn");
  if (!modal || !groupsRoot || !titleEl || !descEl || !imageEl || !addBtn) return;

  const optionGroups = normalizeProductOptionGroups(product);
  const cartMode = !!(preOrderEnabled && preorderGeneralSettingsLoaded && isPreorderAvailableNow() && !isCustomerPreorderCartLockedForUi());
  if (forceCartIntent && cartMode && !optionGroups.length) {
    if (!requireLoginForPreorder()) return;
    addConfiguredProductToCart(product, []);
    persistCartLines();
    updateCartChrome();
    renderCartPage();
    cartSyncProductGridIfNeeded();
    pulseQuickAdd(product.id);
    return;
  }

  productOptionsModalState = {
    productId: product.id,
    optionGroups,
    selectedByGroup: {}
  };
  titleEl.textContent = String(product.name || "منتج");
  descEl.textContent = String(product.description || "");
  descEl.style.display = descEl.textContent ? "block" : "none";
  imageEl.src = getItemImage(product);
  imageEl.loading = "eager";
  imageEl.decoding = "async";
  addBtn.textContent = "إضافة للسلة";
  addBtn.disabled = !cartMode;
  addBtn.style.display = cartMode ? "block" : "none";
  groupsRoot.innerHTML = optionGroups.map((g) => `
    <section class="product-options-group">
      <h4 class="product-options-group-title">${g.title}</h4>
      ${g.options.map((o) => `
        <button type="button" class="product-option-item" data-group-id="${g.id}" data-option-id="${o.id}" onclick="toggleProductOption('${g.id}','${o.id}')">
          <span class="product-option-item-main">
            <span class="product-option-dot"><i class="fas fa-check"></i></span>
            ${o.image ? `<img src="${o.image}" alt="" loading="lazy" decoding="async" style="width:24px;height:24px;border-radius:8px;object-fit:cover;border:1px solid var(--border-light);">` : ""}
            <span class="product-option-title">${o.title}</span>
          </span>
          <span class="product-option-price">${o.additionalPrice > 0 ? `+${o.additionalPrice} ر.س` : "مجاني"}</span>
        </button>
      `).join("")}
    </section>
  `).join("");
  updateProductOptionsTotal();
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
}

function closeProductOptionsModal() {
  const modal = document.getElementById("productOptionsModal");
  if (modal) {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
  productOptionsModalState = null;
}

function toggleProductOption(groupId, optionId) {
  if (!productOptionsModalState) return;
  const group = productOptionsModalState.optionGroups.find((g) => g.id === groupId);
  if (!group) return;
  const selected = productOptionsModalState.selectedByGroup[groupId] || [];
  if (group.type === "single") {
    productOptionsModalState.selectedByGroup[groupId] = [optionId];
  } else {
    productOptionsModalState.selectedByGroup[groupId] = selected.includes(optionId)
      ? selected.filter((id) => id !== optionId)
      : selected.concat(optionId);
  }
  updateProductOptionsTotal();
}

function getSelectedOptionsFromModalState() {
  if (!productOptionsModalState) return [];
  const out = [];
  productOptionsModalState.optionGroups.forEach((g) => {
    const selected = productOptionsModalState.selectedByGroup[g.id] || [];
    selected.forEach((optId) => {
      const opt = g.options.find((o) => o.id === optId);
      if (!opt) return;
      out.push({
        groupId: g.id,
        groupTitle: g.title,
        optionId: opt.id,
        title: opt.title,
        additionalPrice: opt.additionalPrice
      });
    });
  });
  return normalizeSelectedOptionsForStorage(out);
}

function updateProductOptionsTotal() {
  if (!productOptionsModalState) return;
  const product = getVisibleProducts().find((p) => p.id === productOptionsModalState.productId);
  if (!product) return;
  const totalEl = document.getElementById("productOptionsTotal");
  const selected = getSelectedOptionsFromModalState();
  const total = parseProductPriceNumber(product) + calculateOptionsExtra(selected);
  if (totalEl) totalEl.textContent = `${total.toFixed(2)} ر.س`;

  document.querySelectorAll(".product-option-item").forEach((el) => {
    const g = el.getAttribute("data-group-id");
    const o = el.getAttribute("data-option-id");
    const isOn = !!(g && o && (productOptionsModalState.selectedByGroup[g] || []).includes(o));
    el.classList.toggle("is-selected", isOn);
  });
}

function setMenuView(view) {
  const categoriesView = document.getElementById("menuCategoriesView");
  const productsView = document.getElementById("menuProductsView");
  if (!categoriesView || !productsView) return;

  currentMenuView = view === "products" ? "products" : "categories";
  categoriesView.classList.toggle("active", view === "categories");
  productsView.classList.toggle("active", view === "products");
  updateHomeBannerVisibility();
}

function ensureHomeBannerAutoplay() {
  clearHomeBannerTimer();
  if (homeBanners.length > 1) {
    homeBannerTimer = setInterval(() => goToHomeBanner(homeBannerIndex + 1), 4200);
  }
}

function updateHomeBannerVisibility() {
  const section = document.getElementById("homeBannerSection");
  if (!section) return;
  const hasBanners = homeBannerEnabled && Array.isArray(homeBanners) && homeBanners.length > 0;
  const inProductsView = currentMenuView === "products";
  if (!hasBanners) {
    section.classList.remove("is-collapsed");
    section.style.display = "none";
    clearHomeBannerTimer();
    return;
  }
  if (section.style.display === "none") section.style.display = "block";
  section.classList.toggle("is-collapsed", inProductsView);
  if (inProductsView) clearHomeBannerTimer();
  else ensureHomeBannerAutoplay();
}

function ensureSelectedCategory() {
  const categories = getVisibleCategories();
  if (!categories.length) {
    selectedCategory = null;
    activeCategoryId = null;
    return;
  }
  const stillExists = categories.some(category => category.id === activeCategoryId);
  if (!stillExists) {
    selectedCategory = null;
    activeCategoryId = null;
  } else {
    selectedCategory = categories.find(category => category.id === activeCategoryId) || null;
  }
}

function renderMenu() {
  ensureSelectedCategory();
  renderMenuCategories();
  if (selectedCategory) {
    setMenuView("products");
    renderProductsGrid();
  } else {
    setMenuView("categories");
  }
}

function loadMenuData() {
  if (menuDataInitialized && categoriesRealtimeUnsubscribe && productsRealtimeUnsubscribe) {
    scheduleMenuRender();
    return;
  }
  if (categoriesRealtimeUnsubscribe) categoriesRealtimeUnsubscribe();
  if (productsRealtimeUnsubscribe) productsRealtimeUnsubscribe();
  categoriesReady = false;
  productsReady = false;
  menuCategoriesHydrated = false;
  menuProductsHydrated = false;
  renderCategorySkeleton();
  renderProductSkeleton();

  const categoryQuery = db.collection("menuCategories").where("cafeId", "==", cafeId).orderBy("sortOrder", "asc");
  const productQuery = db.collection("menuProducts").where("cafeId", "==", cafeId).orderBy("sortOrder", "asc");

  categoriesRealtimeUnsubscribe = categoryQuery.onSnapshot(
    (categoriesSnapshot) => {
      menuCategories = categoriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      menuCategoriesHydrated = true;
      categoriesReady = true;
      scheduleMenuRender();
    },
    (err) => {
      console.error("Error loading categories:", err);
      menuCategories = [];
      menuCategoriesHydrated = true;
      categoriesReady = true;
      scheduleMenuRender();
    }
  );

  productsRealtimeUnsubscribe = productQuery.onSnapshot(
    (productsSnapshot) => {
      menuProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      menuProductsHydrated = true;
      productsReady = true;
      menuDataInitialized = true;
      scheduleMenuRender();
    },
    (err) => {
      console.error("Error loading products:", err);
      menuProducts = [];
      menuProductsHydrated = true;
      productsReady = true;
      menuDataInitialized = true;
      scheduleMenuRender();
    }
  );
}

function openMenuCategory(categoryId) {
  const category = getVisibleCategories().find(item => item.id === categoryId);
  if (!category) return;
  activeCategoryId = category.id;
  selectedCategory = category;
  setMenuView("products");
  renderProductsGrid();
}

function goBackToCategories() {
  activeCategoryId = null;
  selectedCategory = null;
  setMenuView("categories");
  renderMenuCategories();
}

function selectMenuCategory(categoryId) {
  openMenuCategory(categoryId);
}

function closeMenuListeners() {
  if (categoriesRealtimeUnsubscribe) {
    categoriesRealtimeUnsubscribe();
    categoriesRealtimeUnsubscribe = null;
  }
  if (productsRealtimeUnsubscribe) {
    productsRealtimeUnsubscribe();
    productsRealtimeUnsubscribe = null;
  }
  menuDataInitialized = false;
  menuCategoriesHydrated = false;
  menuProductsHydrated = false;
}

function updateLoyaltyEntryState() {
  const intro = document.getElementById("loyaltyIntro");
  const content = document.getElementById("loyaltyContent");
  const loggedIn = !!currentUser;
  if (intro) intro.style.display = loggedIn ? "none" : "block";
  if (content) content.style.display = loggedIn ? "block" : "none";
  updateHomeLoyaltyCardState();
}

function applyTheme(themeName) {
  const resolvedName = getResolvedThemeName(themeName);
  const scale = THEME_PRESETS[resolvedName] || THEME_PRESETS["Warm Brown"];
  const root = document.documentElement;
  root.style.setProperty("--primary", scale.primary);
  root.style.setProperty("--secondary", scale.secondary);
  root.style.setProperty("--gold-primary", scale.primary);
  root.style.setProperty("--gold-dark", scale.secondary);
  root.style.setProperty("--bg-light", scale.bgLight);
  root.style.setProperty("--bg-muted", scale.bgMuted);
  root.style.setProperty("--bg-surface-soft", scale.surfaceSoft);
  root.style.setProperty("--border-light", scale.border);
  root.style.setProperty("--text-dark", scale.textDark);
  root.style.setProperty("--text-light", scale.textLight);
  root.style.setProperty("--accent-soft", scale.accentSoft);
  root.style.setProperty("--accent-hover", scale.accentHover);
  root.style.setProperty("--gradient-main", scale.gradientMain);
  root.style.setProperty("--gradient-soft", scale.gradientSoft);
}

function clearHomeBannerTimer() {
  if (homeBannerTimer) {
    clearInterval(homeBannerTimer);
    homeBannerTimer = null;
  }
}

function goToHomeBanner(index) {
  if (!homeBanners.length) return;
  homeBannerIndex = (index + homeBanners.length) % homeBanners.length;
  document.querySelectorAll(".home-banner-slide").forEach((slide, i) => {
    slide.classList.toggle("is-active", i === homeBannerIndex);
  });
  document.querySelectorAll(".home-banner-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === homeBannerIndex);
  });
}

function setupHomeBannerTouch() {
  const section = document.getElementById("homeBannerSection");
  if (!section || section.dataset.touchBound === "1") return;
  section.dataset.touchBound = "1";
  section.addEventListener("touchstart", (e) => {
    homeBannerTouchStartX = e.touches?.[0]?.clientX ?? null;
  }, { passive: true });
  section.addEventListener("touchend", (e) => {
    if (homeBannerTouchStartX == null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? homeBannerTouchStartX;
    const dx = endX - homeBannerTouchStartX;
    homeBannerTouchStartX = null;
    if (Math.abs(dx) < 28) return;
    goToHomeBanner(dx < 0 ? homeBannerIndex + 1 : homeBannerIndex - 1);
  }, { passive: true });
}

function renderHomeBanners() {
  const section = document.getElementById("homeBannerSection");
  const track = document.getElementById("homeBannerTrack");
  const dots = document.getElementById("homeBannerDots");
  if (!section || !track || !dots) return;
  clearHomeBannerTimer();
  const list = Array.isArray(homeBanners) ? homeBanners.filter((b) => b && b.enabled !== false && b.image) : [];
  if (!homeBannerEnabled || !list.length) {
    section.style.display = "none";
    track.innerHTML = "";
    dots.innerHTML = "";
    clearHomeBannerTimer();
    return;
  }
  section.style.display = "block";
  homeBanners = list;
  if (homeBannerIndex >= homeBanners.length) homeBannerIndex = 0;
  track.innerHTML = homeBanners.map((b, i) => `
    <div class="home-banner-slide">
      <img class="home-banner-image" src="${b.image}" alt="${String(b.title || "banner")}" loading="${i === 0 ? "eager" : "lazy"}" fetchpriority="${i === 0 ? "high" : "low"}" decoding="async">
      <div class="home-banner-content">
        ${b.title ? `<h3 class="home-banner-title">${String(b.title)}</h3>` : ""}
        ${b.subtitle ? `<p class="home-banner-subtitle">${String(b.subtitle)}</p>` : ""}
      </div>
    </div>
  `).join("");
  dots.style.display = homeBanners.length > 1 ? "flex" : "none";
  dots.innerHTML = homeBanners.length > 1
    ? homeBanners.map((_, i) => `<button class="home-banner-dot ${i === homeBannerIndex ? "active" : ""}" onclick="window.__goToHomeBanner(${i})"></button>`).join("")
    : "";
  goToHomeBanner(homeBannerIndex);
  setupHomeBannerTouch();
  ensureHomeBannerAutoplay();
  updateHomeBannerVisibility();
}

function renderRewardsShowcase(visits) {
  const section = document.getElementById("rewardsShowcaseSection");
  const grid = document.getElementById("rewardsShowcaseGrid");
  if (!section || !grid) return;
  const rewards = (Array.isArray(loyaltyConfig.rewards) ? loyaltyConfig.rewards : [])
    .filter((r) => r && r.hidden !== true && r.enabled !== false);
  if (!rewards.length) {
    section.style.display = "none";
    grid.innerHTML = "";
    return;
  }
  const maxVisits = loyaltyConfig.visitsRequired || 6;
  section.style.display = "block";
  grid.innerHTML = rewards.map((reward) => {
    const mode = reward.rewardMode === "loyalty_completion" ? "loyalty_completion" : "points_based";
    const required = Math.max(0, Number(reward.pointsRequired || 0));
    const eligible = mode === "loyalty_completion" ? visits >= maxVisits : visits >= required;
    const remaining = mode === "points_based" ? Math.max(0, required - visits) : 0;
    const metaText = mode === "loyalty_completion" ? "بعد اكتمال بطاقة الولاء" : eligible ? `${required} نقطة` : `باقي ${remaining} نقطة`;
    const media = reward.image
      ? `<div class="reward-media"><img src="${reward.image}" alt="${String(reward.title || "reward")}" loading="lazy" decoding="async"></div>`
      : `<div class="reward-media"><i class="fas fa-gift"></i></div>`;
    return `
      <article class="reward-card ${eligible ? "reward-eligible" : ""}">
        ${media}
        <div>
          <div class="reward-title">${String(reward.title || "مكافأة مميزة")}</div>
          <div class="reward-description">${String(reward.description || "")}</div>
        </div>
        <div class="reward-meta">${metaText}</div>
      </article>
    `;
  }).join("");
}

function startThemeRealtime() {
  if (themeUnsubscribe) themeUnsubscribe();
  themeUnsubscribe = settingsScopedRef("theme").onSnapshot((doc) => {
    const data = doc.exists ? doc.data() || {} : {};
    const selectedTheme = data.selectedTheme || "Warm Brown";
    applyTheme(selectedTheme);
    applyGlobalFontSettings(data);
  });
}

function subscribeGeneralSettings() {
  if (generalSettingsUnsubscribe) {
    generalSettingsUnsubscribe();
    generalSettingsUnsubscribe = null;
  }
  generalSettingsUnsubscribe = settingsScopedRef("general").onSnapshot(
    (doc) => {
      preorderGeneralSettingsLoaded = true;
      const data = doc.exists ? doc.data() || {} : {};
      applyFeaturedMenuTitle(data.featuredMenuTitle || "");
      preOrderEnabled = data.preOrderEnabled === true;
      preOrderWorkingHoursEnabled = data.preOrderWorkingHoursEnabled === true;
      preOrderOpenTime = String(data.preOrderOpenTime || "08:00");
      preOrderCloseTime = String(data.preOrderCloseTime || "00:00");
      homeBannerEnabled = data.bannerSliderEnabled !== false;
      homeBanners = Array.isArray(data.homeBanners) ? data.homeBanners : [];
      renderHomeBanners();
      try {
        console.log("[preorder] preOrderEnabled:", preOrderEnabled, "| loaded from Firestore general settings");
      } catch (e) {}
      applyPreorderAvailability();
    },
    (err) => {
      preorderGeneralSettingsLoaded = true;
      console.error("general settings (customer app)", err);
      applyPreorderAvailability();
    }
  );
}

function applyPreorderAvailability() {
  const navCart = document.getElementById("navCartItem");
  const mainApp = document.getElementById("mainApp");
  if (!preorderGeneralSettingsLoaded) {
    navCart?.classList.add("nav-item--hidden");
    navCart?.setAttribute("aria-hidden", "true");
    mainApp?.classList.remove("preorder-enabled");
    return;
  }
  if (preOrderEnabled) {
    navCart?.classList.remove("nav-item--hidden");
    navCart?.setAttribute("aria-hidden", "false");
    mainApp?.classList.add("preorder-enabled");
    bindPreorderAudioUnlockOnce();
    updateCartChrome();
    if (currentUserId) {
      void resumePreorderOrderTracking();
    }
  } else {
    navCart?.classList.add("nav-item--hidden");
    navCart?.setAttribute("aria-hidden", "true");
    mainApp?.classList.remove("preorder-enabled");
    clearActiveOrderListener();
    setCustomerPreorderCartLocked(false);
    hideActiveOrderTrackingUi(false);
    cartLines = [];
    persistCartLines();
    updateCartChrome();
    renderCartPage();
    cartSyncProductGridIfNeeded();
    if (document.getElementById("cartScreen")?.classList.contains("active")) {
      switchToScreen("home");
    }
  }
  updatePreorderStatusUi();
}

function parseTimeToMinutes(raw) {
  const src = String(raw || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(src)) return null;
  const parts = src.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function isWithinWorkingHoursNow() {
  if (!preOrderWorkingHoursEnabled) return true;
  const openMin = parseTimeToMinutes(preOrderOpenTime);
  const closeMin = parseTimeToMinutes(preOrderCloseTime);
  if (openMin == null || closeMin == null) return true;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (openMin === closeMin) return true;
  if (openMin < closeMin) return nowMin >= openMin && nowMin < closeMin;
  return nowMin >= openMin || nowMin < closeMin;
}

function isPreorderAvailableNow() {
  return !!(preorderGeneralSettingsLoaded && preOrderEnabled && isWithinWorkingHoursNow());
}

function showClosedStoreMessage() {
  showStyledAlert("المتجر مغلق حالياً، يمكنك تصفح القائمة وسيتم استقبال الطلبات خلال أوقات العمل.", "error");
}

function updatePreorderStatusUi() {
  const badge = document.getElementById("preorderStatusBadge");
  if (!badge) return;
  if (!preorderGeneralSettingsLoaded || !preOrderEnabled) {
    badge.style.display = "none";
    badge.textContent = "";
    badge.classList.remove("is-open", "is-closed");
    return;
  }
  const openNow = isWithinWorkingHoursNow();
  badge.style.display = "inline-flex";
  badge.textContent = openNow ? "مفتوح الآن" : "مغلق حالياً";
  badge.classList.toggle("is-open", openNow);
  badge.classList.toggle("is-closed", !openNow);
}

function isLoggedInForPreorder() {
  return !!(
    currentUserId &&
    currentUser &&
    String(currentUser.phone || "").trim().length > 0
  );
}

function requireLoginForPreorder() {
  if (isLoggedInForPreorder()) return true;
  showStyledAlert("يجب تسجيل الدخول لإرسال الطلب", "error");
  openLoyaltyAuth();
  return false;
}

function bindPreorderAudioUnlockOnce() {
  if (preorderAudioUnlockBound) return;
  preorderAudioUnlockBound = true;
  const unlock = () => {
    const a = document.getElementById("preorderReadySound");
    if (a) {
      a.volume = 0.001;
      a.play().then(() => {
        a.pause();
        a.currentTime = 0;
        a.volume = 1;
      }).catch(() => {});
    }
  };
  document.body.addEventListener("touchstart", unlock, { passive: true, once: true });
  document.body.addEventListener("click", unlock, { once: true });
}

function parseProductPriceNumber(product) {
  const raw = product?.priceText ?? product?.price ?? "";
  const s = String(raw).replace(/ر\.?\s*س/gi, "").replace(/SAR/gi, "").replace(/,/g, ".").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function cartStorageKey() {
  return `cart_v1_${cafeId}`;
}

function loadPersistedCart() {
  cartLines = [];
  try {
    const raw = localStorage.getItem(cartStorageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cartLines = parsed
        .filter((l) => l && (l.productId || l.lineId) && Number(l.quantity) > 0)
        .map((l) => ({
          lineId: String(l.lineId || productLineId(String(l.productId || ""), l.selectedOptions || l.options || [])),
          productId: String(l.productId),
          name: String(l.name || "منتج"),
          price: Math.round(Number(l.price) * 100) / 100 || 0,
          basePrice: Math.round(Number(l.basePrice || l.price || 0) * 100) / 100 || 0,
          selectedOptions: normalizeSelectedOptionsForStorage(l.selectedOptions || l.options || []),
          image: String(l.image || ""),
          quantity: Math.max(1, parseInt(l.quantity, 10) || 1)
        }));
    }
  } catch (e) {
    cartLines = [];
  }
}

function persistCartLines() {
  try {
    localStorage.setItem(cartStorageKey(), JSON.stringify(cartLines));
  } catch (e) {}
}

function cartLineIndex(lineId) {
  return cartLines.findIndex((l) => l.lineId === lineId);
}

function cartTotals() {
  const total = cartLines.reduce((s, l) => s + l.price * l.quantity, 0);
  const count = cartLines.reduce((s, l) => s + l.quantity, 0);
  return { total, count };
}

function escapeHtmlCart(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}

function cartSyncProductGridIfNeeded() {
  const productsView = document.getElementById("menuProductsView");
  if (productsView && productsView.classList.contains("active")) renderProductsGrid();
}

function orderCreatedAtMillis(data) {
  const c = data && data.createdAt;
  if (c && typeof c.toMillis === "function") return c.toMillis();
  if (c instanceof Date) return c.getTime();
  return 0;
}

async function fetchLatestActiveOrderIdForUser() {
  if (!db || !currentUserId || !cafeId) return null;
  try {
    const snap = await db
      .collection("orders")
      .where("cafeId", "==", cafeId)
      .where("userId", "==", currentUserId)
      .where("status", "in", ACTIVE_CUSTOMER_ORDER_STATUSES)
      .limit(25)
      .get();
    if (snap.empty) return null;
    let bestId = snap.docs[0].id;
    let bestMs = orderCreatedAtMillis(snap.docs[0].data());
    snap.docs.forEach((doc) => {
      const ms = orderCreatedAtMillis(doc.data());
      if (ms > bestMs) {
        bestMs = ms;
        bestId = doc.id;
      }
    });
    return bestId;
  } catch (e) {
    console.error("fetchLatestActiveOrderIdForUser", e);
    return null;
  }
}

function isCustomerPreorderCartLockedForUi() {
  return !!(customerPreorderCartLocked && currentUserId && preOrderEnabled);
}

function setCustomerPreorderCartLocked(on) {
  customerPreorderCartLocked = !!on;
  const banner = document.getElementById("cartActiveOrderBanner");
  const noteEl = document.getElementById("cartOrderNoteInput");
  const lockedUi = isCustomerPreorderCartLockedForUi();
  if (banner) {
    banner.style.display = lockedUi ? "block" : "none";
    banner.setAttribute("aria-hidden", lockedUi ? "false" : "true");
  }
  if (noteEl) {
    noteEl.disabled = lockedUi;
  }
  document.getElementById("cartScreen")?.classList.toggle("cart-page--locked", lockedUi);
  renderCartPage();
  cartSyncProductGridIfNeeded();
}

function updateCartChrome() {
  const { total, count } = cartTotals();
  const badge = document.getElementById("navCartBadge");
  if (badge) {
    badge.style.display = count > 0 ? "flex" : "none";
    badge.textContent = String(count);
  }
  const totalEl = document.getElementById("cartTotalDisplay");
  if (totalEl) {
    totalEl.innerHTML = `${total.toFixed(2)} <span class="riyal-inline">ر.س</span>`;
  }
  const submitBtn = document.getElementById("cartSubmitBtn");
  const locked = isCustomerPreorderCartLockedForUi();
  if (submitBtn) {
    submitBtn.disabled = locked || count === 0 || !isLoggedInForPreorder() || !isPreorderAvailableNow();
  }
  const guestHint = document.getElementById("cartGuestHint");
  if (guestHint) guestHint.style.display = currentUserId ? "none" : "block";
  const emptyEl = document.getElementById("cartEmptyState");
  const listEl = document.getElementById("cartItemsList");
  if (emptyEl && listEl) {
    const empty = cartLines.length === 0;
    if (locked && empty) {
      emptyEl.style.display = "none";
      listEl.style.display = "none";
    } else {
      emptyEl.style.display = empty ? "block" : "none";
      listEl.style.display = empty ? "none" : "flex";
    }
  }
  updatePreorderStatusUi();
}

function bindCartListDelegation() {
  const list = document.getElementById("cartItemsList");
  if (!list || list.dataset.actBound) return;
  list.dataset.actBound = "1";
  list.addEventListener("click", (e) => {
    const inc = e.target.closest("[data-cart-inc]");
    const dec = e.target.closest("[data-cart-dec]");
    const del = e.target.closest("[data-cart-del]");
    const btn = inc || dec || del;
    if (!btn) return;
    const pid = btn.getAttribute("data-pid");
    if (!pid) return;
    if (inc) cartIncrement(pid);
    else if (dec) cartDecrement(pid);
    else cartRemoveLine(pid);
  });
}

function renderCartPage() {
  const list = document.getElementById("cartItemsList");
  if (!list) return;
  bindCartListDelegation();
  if (!cartLines.length) {
    list.innerHTML = "";
    updateCartChrome();
    return;
  }
  const lineLocked = isCustomerPreorderCartLockedForUi() ? " cart-line--locked" : "";
  list.innerHTML = cartLines
    .map((line) => {
      const imgSrc = line.image && String(line.image).trim() ? String(line.image).replace(/"/g, "&quot;") : MENU_IMAGE_PLACEHOLDER;
      const pidAttr = encodeURIComponent(line.lineId);
      const nameHtml = escapeHtmlCart(line.name || "منتج");
      const optionsHtml = Array.isArray(line.selectedOptions) && line.selectedOptions.length
        ? `<div class="cart-line-meta">${line.selectedOptions.map((o) => `${escapeHtmlCart(o.groupTitle)}: ${escapeHtmlCart(o.title)} (+${Number(o.additionalPrice || 0).toFixed(2)} ر.س)`).join(" • ")}</div>`
        : "";
      return `
      <div class="cart-line${lineLocked}">
        <img class="cart-line-img" src="${imgSrc}" alt="" loading="lazy" decoding="async">
        <div class="cart-line-body">
          <div class="cart-line-name">${nameHtml}</div>
          <div class="cart-line-meta"><span class="cart-line-unit">${line.price.toFixed(2)} ر.س</span></div>
          ${optionsHtml}
          <div class="cart-line-controls">
            <button type="button" class="cart-qty-btn" data-cart-dec data-pid="${pidAttr}" aria-label="إنقاص"><i class="fas fa-minus"></i></button>
            <span class="cart-qty-num">${line.quantity}</span>
            <button type="button" class="cart-qty-btn cart-qty-add" data-cart-inc data-pid="${pidAttr}" aria-label="زيادة"><i class="fas fa-plus"></i></button>
            <button type="button" class="cart-remove-btn" data-cart-del data-pid="${pidAttr}" aria-label="حذف"><i class="fas fa-trash-alt"></i></button>
          </div>
        </div>
      </div>`;
    })
    .join("");
  updateCartChrome();
}

function pulseQuickAdd(productId) {
  const btn = document.querySelector(`button.product-quick-add[data-quick-add="${productId}"]`);
  if (!btn) return;
  btn.classList.remove("product-quick-add--pulse");
  void btn.offsetWidth;
  btn.classList.add("product-quick-add--pulse");
  setTimeout(() => btn.classList.remove("product-quick-add--pulse"), 420);
}

function addConfiguredProductToCart(product, selectedOptions) {
  const optionsList = normalizeSelectedOptionsForStorage(selectedOptions);
  const basePrice = parseProductPriceNumber(product);
  const price = Math.round((basePrice + calculateOptionsExtra(optionsList)) * 100) / 100;
  const name = String(product.name || "منتج").trim() || "منتج";
  const image = getItemImage(product);
  const lineId = productLineId(product.id, optionsList);
  const idx = cartLineIndex(lineId);
  if (idx >= 0) {
    cartLines[idx].quantity += 1;
    cartLines[idx].price = price;
    cartLines[idx].basePrice = basePrice;
    cartLines[idx].name = name;
    cartLines[idx].image = image;
    cartLines[idx].selectedOptions = optionsList;
  } else {
    cartLines.push({ lineId, productId: product.id, name, price, basePrice, selectedOptions: optionsList, image, quantity: 1 });
  }
}

function cartQuickAdd(productId) {
  if (!preOrderEnabled || !db) return;
  if (!isPreorderAvailableNow()) {
    showClosedStoreMessage();
    return;
  }
  if (isCustomerPreorderCartLockedForUi()) return;
  if (!requireLoginForPreorder()) return;
  const products = getVisibleProducts();
  const product = products.find((p) => p.id === productId);
  if (!product) return;
  addConfiguredProductToCart(product, []);
  persistCartLines();
  updateCartChrome();
  renderCartPage();
  cartSyncProductGridIfNeeded();
  pulseQuickAdd(productId);
  bindPreorderAudioUnlockOnce();
}

function cartIncrement(productId) {
  try {
    productId = decodeURIComponent(productId);
  } catch (e) {}
  if (!isPreorderAvailableNow()) {
    showClosedStoreMessage();
    return;
  }
  if (isCustomerPreorderCartLockedForUi()) return;
  if (!isLoggedInForPreorder()) {
    showStyledAlert("يجب تسجيل الدخول لإرسال الطلب", "error");
    return;
  }
  const idx = cartLineIndex(productId);
  if (idx < 0) return;
  cartLines[idx].quantity += 1;
  persistCartLines();
  updateCartChrome();
  renderCartPage();
  cartSyncProductGridIfNeeded();
}

function cartDecrement(productId) {
  try {
    productId = decodeURIComponent(productId);
  } catch (e) {}
  if (!isPreorderAvailableNow()) {
    showClosedStoreMessage();
    return;
  }
  if (isCustomerPreorderCartLockedForUi()) return;
  if (!isLoggedInForPreorder()) {
    showStyledAlert("يجب تسجيل الدخول لإرسال الطلب", "error");
    return;
  }
  const idx = cartLineIndex(productId);
  if (idx < 0) return;
  cartLines[idx].quantity -= 1;
  if (cartLines[idx].quantity <= 0) cartLines.splice(idx, 1);
  persistCartLines();
  updateCartChrome();
  renderCartPage();
  cartSyncProductGridIfNeeded();
}

function cartRemoveLine(productId) {
  try {
    productId = decodeURIComponent(productId);
  } catch (e) {}
  if (isCustomerPreorderCartLockedForUi()) return;
  const idx = cartLineIndex(productId);
  if (idx < 0) return;
  cartLines.splice(idx, 1);
  persistCartLines();
  updateCartChrome();
  renderCartPage();
  cartSyncProductGridIfNeeded();
}

function confirmProductOptionsSelection() {
  if (!productOptionsModalState) return;
  const product = getVisibleProducts().find((p) => p.id === productOptionsModalState.productId);
  if (!product) return;
  const selectedOptions = getSelectedOptionsFromModalState();
  const cartMode = !!(preOrderEnabled && preorderGeneralSettingsLoaded && isPreorderAvailableNow() && !isCustomerPreorderCartLockedForUi());
  if (cartMode) {
    if (!requireLoginForPreorder()) return;
    addConfiguredProductToCart(product, selectedOptions);
    persistCartLines();
    updateCartChrome();
    renderCartPage();
    cartSyncProductGridIfNeeded();
    pulseQuickAdd(product.id);
    bindPreorderAudioUnlockOnce();
    showStyledAlert("تمت إضافة المنتج", "success");
  }
  closeProductOptionsModal();
}

function setupProductOptionsModal() {
  const modal = document.getElementById("productOptionsModal");
  if (!modal || modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeProductOptionsModal();
  });
}

function cafeOrderLetter() {
  const alnum = String(cafeId || "x").replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "");
  const ch = alnum ? alnum.charAt(0).toUpperCase() : "A";
  if (/[A-Z]/.test(ch)) return ch;
  if (/[0-9]/.test(ch)) return ch;
  return "A";
}

function formatOrderNumberFromSeq(seq) {
  const n = Math.max(1, Number(seq) || 1);
  const suffix = n <= 999 ? String(n).padStart(3, "0") : String(n);
  return `#${cafeOrderLetter()}${suffix}`;
}

function activeOrderTrackStorageKey() {
  return `preorder_active_track_v1_${cafeId}`;
}

function readActiveOrderTrack() {
  try {
    const raw = localStorage.getItem(activeOrderTrackStorageKey());
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j.orderId !== "string" || !j.orderId) return null;
    return { orderId: j.orderId, userId: j.userId != null ? String(j.userId) : "" };
  } catch (e) {
    return null;
  }
}

function writeActiveOrderTrack(orderId) {
  if (!orderId || !currentUserId) return;
  try {
    const payload = JSON.stringify({
      orderId: String(orderId),
      userId: String(currentUserId),
      cafeId: String(cafeId || "")
    });
    localStorage.setItem(activeOrderTrackStorageKey(), payload);
    sessionStorage.setItem("preorder_active_order_id", String(orderId));
  } catch (e) {}
}

function clearActiveOrderTrackStorage() {
  try {
    localStorage.removeItem(activeOrderTrackStorageKey());
  } catch (e) {}
  try {
    sessionStorage.removeItem("preorder_active_order_id");
  } catch (e) {}
}

function detachActiveOrderSnapshot() {
  if (activeOrderUnsubscribe) {
    activeOrderUnsubscribe();
    activeOrderUnsubscribe = null;
  }
}

function clearActiveOrderListener() {
  if (activeOrderDoneHideTimer) {
    clearTimeout(activeOrderDoneHideTimer);
    activeOrderDoneHideTimer = null;
  }
  detachActiveOrderSnapshot();
}

const ORDER_STATUS_LABELS = {
  pending: "قيد الانتظار",
  preparing: "قيد التحضير",
  ready: "جاهز للاستلام",
  done: "تم التسليم"
};

function orderStatusStepIndex(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return 0;
  if (s === "preparing") return 1;
  if (s === "ready") return 2;
  if (s === "done") return 3;
  return 0;
}

function updateActiveOrderTrackingUi(orderId, data) {
  const section = document.getElementById("activeOrderTrackSection");
  const inner = document.getElementById("activeOrderTrackInner");
  const numEl = document.getElementById("activeOrderNumberDisplay");
  const statusEl = document.getElementById("activeOrderStatusText");
  const fillEl = document.getElementById("activeOrderProgressFill");
  const stepsRoot = document.getElementById("activeOrderProgressSteps");
  if (!section || !numEl || !statusEl || !fillEl || !stepsRoot) return;

  const status = String(data.status || "pending").toLowerCase();
  const stepIdx = orderStatusStepIndex(status);
  const displayNum =
    data.orderNumber && String(data.orderNumber).trim()
      ? String(data.orderNumber).trim()
      : `#${String(orderId).slice(0, 6)}`;

  numEl.textContent = displayNum.startsWith("#") ? displayNum : `#${displayNum.replace(/^#/, "")}`;
  statusEl.textContent = `الحالة: ${ORDER_STATUS_LABELS[status] || ORDER_STATUS_LABELS.pending}`;

  const pct = Math.min(100, Math.max(0, ((stepIdx + 1) / 4) * 100));
  fillEl.style.width = `${pct}%`;

  stepsRoot.querySelectorAll("li[data-step]").forEach((li, i) => {
    li.classList.remove("is-active", "is-complete");
    if (i < stepIdx) li.classList.add("is-complete");
    else if (i === stepIdx) li.classList.add("is-active");
  });

  section.hidden = false;
  section.setAttribute("aria-hidden", "false");
  if (inner) {
    inner.classList.remove("active-order-card--out");
  }
}

function hideActiveOrderTrackingUi(animate) {
  const section = document.getElementById("activeOrderTrackSection");
  const inner = document.getElementById("activeOrderTrackInner");
  if (!section) return;

  const finish = () => {
    section.hidden = true;
    section.setAttribute("aria-hidden", "true");
    if (inner) inner.classList.remove("active-order-card--out");
  };

  if (animate && inner) {
    inner.classList.add("active-order-card--out");
    activeOrderDoneHideTimer = setTimeout(finish, 420);
  } else {
    finish();
  }
}

function triggerPreorderReadyUi(orderId) {
  if (!preorderGeneralSettingsLoaded || !preOrderEnabled || !currentUserId) return;
  if (preorderReadyNotified.has(orderId)) return;
  preorderReadyNotified.add(orderId);
  try {
    sessionStorage.setItem(`preorder_ready_ack_${orderId}`, "1");
  } catch (e) {}

  const toast = document.getElementById("preorderReadyToast");
  if (toast) {
    toast.style.display = "flex";
    toast.classList.remove("preorder-ready-pop");
    void toast.offsetWidth;
    toast.classList.add("preorder-ready-pop");
    setTimeout(() => {
      toast.style.display = "none";
      toast.classList.remove("preorder-ready-pop");
    }, 4200);
  }

  const audio = document.getElementById("preorderReadySound");
  if (audio) {
    audio.currentTime = 0;
    audio.volume = 1;
    audio.play().catch(() => {
      playPointSoundForClient();
    });
  } else {
    playPointSoundForClient();
  }
}

function subscribeTrackedOrder(orderId) {
  if (!db || !orderId) return;
  if (!preorderGeneralSettingsLoaded || !preOrderEnabled) return;
  if (!currentUserId) return;
  clearActiveOrderListener();
  writeActiveOrderTrack(orderId);

  let primed = false;
  let previousStatus = null;
  activeOrderUnsubscribe = db
    .collection("orders")
    .doc(orderId)
    .onSnapshot(
      (docSnap) => {
        if (!docSnap.exists) {
          clearActiveOrderTrackStorage();
          setCustomerPreorderCartLocked(false);
          hideActiveOrderTrackingUi(false);
          clearActiveOrderListener();
          return;
        }
        const data = docSnap.data() || {};
        if (data.cafeId !== cafeId) return;

        if (data.userId != null && currentUserId && String(data.userId) !== String(currentUserId)) {
          clearActiveOrderTrackStorage();
          setCustomerPreorderCartLocked(false);
          hideActiveOrderTrackingUi(false);
          clearActiveOrderListener();
          return;
        }

        const status = String(data.status || "pending").toLowerCase();
        const isActiveStatus = ACTIVE_CUSTOMER_ORDER_STATUSES.includes(status);
        if (!isActiveStatus && status !== "done") return;

        if (status === "done") {
          setCustomerPreorderCartLocked(false);
          updateActiveOrderTrackingUi(orderId, data);
          clearActiveOrderTrackStorage();
          preorderReadyNotified.delete(orderId);
          detachActiveOrderSnapshot();
          const inner = document.getElementById("activeOrderTrackInner");
          if (inner) inner.classList.add("active-order-card--out");
          activeOrderDoneHideTimer = setTimeout(() => {
            const section = document.getElementById("activeOrderTrackSection");
            if (section) {
              section.hidden = true;
              section.setAttribute("aria-hidden", "true");
            }
            if (inner) inner.classList.remove("active-order-card--out");
            activeOrderDoneHideTimer = null;
          }, 420);
          return;
        }

        updateActiveOrderTrackingUi(orderId, data);
        setCustomerPreorderCartLocked(true);

        if (!primed) {
          primed = true;
          previousStatus = status;
          return;
        }

        const statusChanged = previousStatus !== status;
        const movedToReady = statusChanged && previousStatus != null && previousStatus !== "ready" && status === "ready";
        previousStatus = status;

        if (movedToReady && !preorderReadyNotified.has(orderId)) {
          triggerPreorderReadyUi(orderId);
        }
      },
      (err) => console.error("order tracker (customer)", err)
    );
}

async function submitPreorder() {
  if (!db || !preOrderEnabled) return;
  if (!isPreorderAvailableNow()) {
    showClosedStoreMessage();
    return;
  }
  if (!requireLoginForPreorder()) return;
  if (!cartLines.length) return;
  if (isCustomerPreorderCartLockedForUi()) {
    showStyledAlert("لديك طلب جاري، انتظر حتى يتم استلامه", "error");
    return;
  }

  const customerName = String(currentUser?.name || "").trim() || "عميل";
  const customerPhone = String(currentUser?.phone || "").trim();
  if (!customerPhone) {
    showStyledAlert("يجب تسجيل الدخول لإرسال الطلب", "error");
    openLoyaltyAuth();
    return;
  }

  const noteRaw = String(document.getElementById("cartOrderNoteInput")?.value || "").trim().slice(0, MAX_ORDER_NOTE_LEN);

  const items = cartLines.map((line) => ({
    productId: line.productId,
    name: line.name,
    quantity: line.quantity,
    price: Math.round(line.price * 100) / 100,
    basePrice: Math.round(Number(line.basePrice || line.price || 0) * 100) / 100,
    options: normalizeSelectedOptionsForStorage(line.selectedOptions || [])
  }));
  const total = Math.round(cartTotals().total * 100) / 100;

  const btn = document.getElementById("cartSubmitBtn");
  if (btn) setLoading(btn, true, "⏳ جاري الإرسال...");

  const existingActive = await fetchLatestActiveOrderIdForUser();
  if (existingActive) {
    if (btn) setLoading(btn, false, "إرسال الطلب");
    showStyledAlert("لديك طلب جاري، انتظر حتى يتم استلامه", "error");
    subscribeTrackedOrder(existingActive);
    return;
  }

  const generalRef = settingsScopedRef("general");
  const orderRef = db.collection("orders").doc();

  try {
    let seqUsed = 1;
    await db.runTransaction(async (transaction) => {
      const genSnap = await transaction.get(generalRef);
      const prev = genSnap.exists ? Number(genSnap.data().orderSeq || 0) : 0;
      seqUsed = prev + 1;
      transaction.set(
        generalRef,
        {
          orderSeq: seqUsed,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      const orderNumber = formatOrderNumberFromSeq(seqUsed);
      transaction.set(
        orderRef,
        withCafeTenant({
          orderNumber,
          orderSeq: seqUsed,
          userId: currentUserId,
          customerName,
          customerPhone,
          items,
          total,
          status: "pending",
          note: noteRaw,
          pickupType: "now",
          scheduledTime: "",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
      );
    });

    const numEl = document.getElementById("preorderConfirmNumber");
    if (numEl) numEl.textContent = formatOrderNumberFromSeq(seqUsed);

    cartLines = [];
    persistCartLines();
    updateCartChrome();
    renderCartPage();
    cartSyncProductGridIfNeeded();
    const confirm = document.getElementById("preorderConfirmOverlay");
    if (confirm) {
      confirm.style.display = "flex";
      confirm.setAttribute("aria-hidden", "false");
    }

    preorderReadyNotified.delete(orderRef.id);
    try {
      sessionStorage.removeItem(`preorder_ready_ack_${orderRef.id}`);
    } catch (e) {}

    const noteEl = document.getElementById("cartOrderNoteInput");
    if (noteEl) noteEl.value = "";

    subscribeTrackedOrder(orderRef.id);
  } catch (e) {
    console.error("submitPreorder", e);
    showStyledAlert("تعذّر إرسال الطلب. حاول مرة أخرى.", "error");
  } finally {
    if (btn) setLoading(btn, false, "إرسال الطلب");
  }
}

function closePreorderConfirm() {
  const confirm = document.getElementById("preorderConfirmOverlay");
  if (confirm) {
    confirm.style.display = "none";
    confirm.setAttribute("aria-hidden", "true");
  }
}

function getContactIconSvg(type) {
  const icons = {
    instagram: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5a4.25 4.25 0 0 0 4.25 4.25h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5a4.25 4.25 0 0 0-4.25-4.25h-8.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm5.25-2a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z"/></svg>`,
    whatsapp: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.04 2a9.94 9.94 0 0 0-8.6 15l-1.3 4.76 4.88-1.28A9.95 9.95 0 1 0 12.04 2Zm0 1.6a8.36 8.36 0 1 1-4.02 15.69l-.23-.13-2.86.75.76-2.78-.15-.24A8.34 8.34 0 0 1 12.04 3.6Zm-3.9 4.63c-.2 0-.4.01-.57.4-.17.39-.66 1.28-.66 1.4 0 .11-.03.24.08.37.11.13 1.53 2.46 3.77 3.35 1.86.73 2.26.6 2.66.56.4-.04 1.28-.52 1.46-1.02.18-.5.18-.93.13-1.02-.05-.09-.19-.15-.4-.25-.2-.1-1.2-.59-1.38-.66-.18-.06-.31-.1-.45.1-.13.2-.51.66-.63.8-.11.13-.23.15-.44.05-.2-.1-.87-.32-1.66-1.02-.61-.54-1.03-1.2-1.15-1.4-.12-.2-.01-.32.09-.43.09-.09.2-.23.29-.35.1-.12.12-.2.18-.34.06-.13.02-.26-.01-.36-.04-.1-.4-.98-.55-1.35-.15-.35-.3-.36-.42-.36h-.36Z"/></svg>`,
    twitter: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.9 2H22l-6.77 7.73L23.2 22h-6.27l-4.9-6.4L6.4 22H3.3l7.24-8.27L.8 2h6.43l4.43 5.85L18.9 2Zm-1.1 18h1.74L6.3 3.9H4.5L17.8 20Z"/></svg>`,
    snapchat: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.02 2c-3.04 0-5.5 2.46-5.5 5.5v2.16c0 .49-.12.98-.35 1.41-.19.35-.5.66-.88.88-.23.13-.31.42-.18.64.13.22.41.3.64.18.1-.06.2-.12.3-.18.48 1.52 1.96 2.47 3.56 2.74.2.03.33.21.3.41l-.1.61c-.03.2.1.38.3.42.48.08.96.12 1.45.12s.97-.04 1.45-.12c.2-.04.33-.22.3-.42l-.1-.61c-.03-.2.1-.38.3-.41 1.6-.27 3.08-1.22 3.56-2.74.1.06.2.12.3.18.23.12.51.04.64-.18.13-.22.05-.51-.18-.64-.38-.22-.69-.53-.88-.88a2.9 2.9 0 0 1-.35-1.41V7.5c0-3.04-2.46-5.5-5.5-5.5Z"/></svg>`
  };
  return icons[type] || "";
}

function renderContactSection(data = {}) {
  const section = document.getElementById("contactUsSection");
  const grid = document.getElementById("contactIconsGrid");
  if (!section || !grid) return;

  if (data.visible === false) {
    section.style.display = "none";
    return;
  }

  const links = [
    { key: "instagram", value: data.instagram },
    { key: "whatsapp", value: data.whatsapp },
    { key: "twitter", value: data.twitter },
    { key: "snapchat", value: data.snapchat }
  ].filter(item => item.value);

  if (!links.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  grid.innerHTML = links.map(link => `
    <button class="contact-icon-btn" data-link="${encodeURIComponent(link.value)}">
      ${getContactIconSvg(link.key)}
    </button>
  `).join("");
  grid.querySelectorAll(".contact-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => openContactLink(decodeURIComponent(btn.dataset.link || "")));
  });
}

function startContactRealtime() {
  if (contactRealtimeUnsubscribe) contactRealtimeUnsubscribe();
  contactRealtimeUnsubscribe = settingsScopedRef("contact").onSnapshot((doc) => {
    renderContactSection(doc.exists ? doc.data() : { visible: false });
  });
}

function openContactLink(url) {
  if (!url) return;
  window.open(url, "_blank");
}

function updateProfileActionButton() {
  const actionText = document.getElementById("profileActionText");
  const actionIcon = document.getElementById("profileActionIcon");
  const loggedIn = !!(currentUser && currentUserId);
  if (actionText) actionText.innerText = loggedIn ? "تسجيل الخروج" : "تسجيل";
  if (actionIcon) actionIcon.className = loggedIn ? "fas fa-sign-out-alt" : "fas fa-sign-in-alt";
}

function handleProfileAction() {
  const loggedIn = !!(currentUser && currentUserId);
  if (loggedIn) {
    logoutUser();
  } else {
    openLoyaltyAuth();
  }
}

function showMainApp() {
  const mainApp = document.getElementById("mainApp");
  const loginScreen = document.getElementById("loginScreen");
  const registerScreen = document.getElementById("registerScreen");
  if (mainApp) mainApp.style.display = "block";
  if (loginScreen) loginScreen.style.display = "none";
  if (registerScreen) registerScreen.style.display = "none";
}

function showLoginScreen() {
  const mainApp = document.getElementById("mainApp");
  const loginScreen = document.getElementById("loginScreen");
  const registerScreen = document.getElementById("registerScreen");
  if (mainApp) mainApp.style.display = "none";
  if (loginScreen) loginScreen.style.display = "flex";
  if (registerScreen) registerScreen.style.display = "none";
}

function saveUserState(userId) {
  if (userId) {
    localStorage.setItem("userId", userId);
  }
}

function loadUserState() {
  return localStorage.getItem("userId");
}

function clearUserState() {
  localStorage.removeItem("userId");
}

function switchToScreen(screen) {
  document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
  document.querySelectorAll(".page-content").forEach(page => page.classList.remove("active"));
  const nav = document.querySelector(`.nav-item[data-screen="${screen}"]`);
  const page = document.getElementById(`${screen}Screen`);
  if (nav) nav.classList.add("active");
  if (page) page.classList.add("active");
}

function openLoyaltyAuth() {
  openLoyaltyAfterAuth = true;
  document.getElementById("mainApp").style.display = "none";
  document.getElementById("registerScreen").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
}

function openLoyaltyInvite() {
  switchToScreen("loyalty");
  updateLoyaltyEntryState();
}

function continueAsGuest() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("registerScreen").style.display = "none";
  document.getElementById("mainApp").style.display = "block";
  switchToScreen("home");
}

// ==================== LOYALTY CUSTOMIZATION (settings/loyalty) ====================
function applyLoyaltySettingsToUI() {
  const cfg = loyaltyConfig;
  const heroCard = document.getElementById("heroImageCard");
  const overlay = document.getElementById("heroImageOverlay");

  if (heroCard) {
    if (cfg.backgroundImage) {
      heroCard.style.backgroundImage = `url('${cfg.backgroundImage}')`;
      heroCard.style.backgroundSize = "cover";
      heroCard.style.backgroundPosition = "center";
      heroCard.style.backgroundRepeat = "no-repeat";
    } else {
      heroCard.style.removeProperty("background-image");
      heroCard.style.removeProperty("background-size");
      heroCard.style.removeProperty("background-position");
      heroCard.style.removeProperty("background-repeat");
    }
  }

  if (overlay) {
    const o = cfg.overlayOpacity != null ? cfg.overlayOpacity : 0.5;
    overlay.style.background = `linear-gradient(180deg, rgba(0,0,0,${0.12 + 0.28 * o}) 0%, rgba(0,0,0,${0.35 + 0.45 * o}) 100%)`;
  }

  const t = document.getElementById("loyaltyHeroTitle");
  if (t) t.textContent = cfg.title || "بطاقة الولاء";
  const st = document.getElementById("loyaltyCardSubtitle");
  if (st) {
    st.textContent = cfg.subtitle || "";
    st.style.display = cfg.subtitle ? "block" : "none";
  }
  const rw = document.getElementById("loyaltyHeroReward");
  if (rw) rw.textContent = cfg.rewardText || "كل زيارة تقربك من مكافأتك";
  const pl = document.getElementById("loyaltyPointsLabel");
  if (pl) pl.textContent = cfg.pointsLabel || "نقاطك الحالية";
  const icon = document.getElementById("loyaltyPointsIconDisplay");
  if (icon) icon.innerHTML = getLoyaltyIconSvg(cfg.icon);
  const introTitle = document.getElementById("loyaltyIntroTitle");
  if (introTitle) introTitle.textContent = cfg.introTitle || "✨ ما هو برنامج الولاء؟";
  const introSubtitle = document.getElementById("loyaltyIntroSubtitle");
  if (introSubtitle) {
    introSubtitle.textContent = cfg.introSubtitle || "";
    introSubtitle.style.display = cfg.introSubtitle ? "block" : "none";
  }
  const introDesc = document.getElementById("loyaltyIntroDescription");
  if (introDesc) {
    introDesc.textContent = cfg.introDescription || "";
    introDesc.style.display = cfg.introDescription ? "block" : "none";
  }
  const introBtn = document.getElementById("loyaltyIntroCtaBtn");
  if (introBtn) introBtn.textContent = cfg.introButtonText || "ابدأ رحلتك";
  const introList = document.getElementById("loyaltyIntroList");
  if (introList) {
    const bullets = (Array.isArray(cfg.introBullets) ? cfg.introBullets : []).filter(Boolean);
    introList.innerHTML = (bullets.length ? bullets : [
      "اجمع النقاط مع كل زيارة",
      "احصل على مكافآت مجانية",
      "تابع تقدمك بسهولة",
      "استمتع بتجربة ولاء مميزة"
    ]).map((b) => `<div class="intro-item"><i class="fas fa-check-circle"></i><span>${String(b)}</span></div>`).join("");
  }
  const introImageWrap = document.getElementById("loyaltyIntroIllustrationWrap");
  const introImage = document.getElementById("loyaltyIntroIllustration");
  if (introImageWrap && introImage) {
    if (cfg.introIllustration) {
      introImage.src = cfg.introIllustration;
      introImage.decoding = "async";
      introImageWrap.style.display = "block";
    } else {
      introImage.removeAttribute("src");
      introImageWrap.style.display = "none";
    }
  }
  renderRewardsShowcase(currentUser?.visits || 0);
}

function subscribeLoyaltySettings() {
  if (loyaltySettingsUnsubscribe) {
    loyaltySettingsUnsubscribe();
    loyaltySettingsUnsubscribe = null;
  }
  if (!db) return;
  let loyaltyLegacyFetched = false;
  loyaltySettingsUnsubscribe = settingsScopedRef("loyalty").onSnapshot(
    (doc) => {
      const applyDoc = (d) => {
        loyaltyConfig = mergeLoyaltyData(d);
        applyLoyaltySettingsToUI();
        const totalEl = document.getElementById("pointsTotal");
        if (totalEl) totalEl.innerText = String(loyaltyConfig.visitsRequired || 6);
        if (currentUser) {
          const v = currentUser.visits || 0;
          updateProgressRegion(v);
        } else {
          updateProgressRegion(0);
        }
      };
      if (!doc.exists && !loyaltyLegacyFetched && typeof DEFAULT_CAFE_ID !== "undefined" && cafeId === DEFAULT_CAFE_ID) {
        loyaltyLegacyFetched = true;
        db.collection("settings").doc("loyalty").get().then((leg) => {
          applyDoc(leg.exists ? leg : doc);
        });
        return;
      }
      applyDoc(doc);
    },
    (err) => console.error("Loyalty settings error:", err)
  );
}

// ==================== SOUND & ANIMATION ====================
function playPointSoundForClient() {
  const audio = document.getElementById("pointSoundClient");
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(e => console.log("Audio play failed:", e));
  }
}

function animatePointsUpdate() {
  const pointsElement = document.getElementById("loyaltyPoints");
  const cupsContainer = document.getElementById("stepsContainer");
  
  if (pointsElement) {
    pointsElement.classList.add("point-updated");
    setTimeout(() => pointsElement.classList.remove("point-updated"), 300);
  }
  
  if (cupsContainer) {
    cupsContainer.classList.add("points-updated");
    setTimeout(() => cupsContainer.classList.remove("points-updated"), 300);
  }
}

// ==================== AUTHENTICATION ====================
function checkUserLogin() {
  try {
    const phone = document.getElementById("loginPhone").value.trim();
    if (!phone) {
      showStyledAlert("❌ الرجاء إدخال رقم الجوال", "error");
      return;
    }
    
    if (!validatePhone(phone)) {
      showStyledAlert("❌ رقم الجوال غير صحيح\nيجب أن يبدأ بـ 05 ويتكون من 10 أرقام", "error");
      return;
    }
    
    const btn = event?.target || document.querySelector('#loginScreen .btn-gold');
    if (btn) setLoading(btn, true, "⏳ جاري البحث...");
    
    Promise.resolve(findUserDocByPhone(phone))
      .then((docSnap) => {
        if (!docSnap || !docSnap.exists) {
          document.getElementById("loginScreen").style.display = "none";
          document.getElementById("registerScreen").style.display = "flex";
          document.getElementById("regPhone").value = phone;
          return;
        }
        currentUserId = docSnap.id;
        currentUser = docSnap.data();
        saveUserState(currentUserId);
        showMainApp();
        startMainApp();
      })
      .catch((err) => {
        console.error(err);
        showStyledAlert("⚠️ حدث خطأ، حاول مرة أخرى", "error");
      })
      .finally(() => {
        if (btn) setLoading(btn, false, "دخول");
      });
  } catch (err) {
    console.error("Login crash:", err);
    showStyledAlert("⚠️ حدث خطأ أثناء تسجيل الدخول", "error");
  }
}

function registerNewUser() {
  try {
    const name = document.getElementById("regName").value.trim();
    const phone = document.getElementById("regPhone").value.trim();
    
    if (!name || !phone) {
      showStyledAlert("❌ يرجى ملء جميع الحقول", "error");
      return;
    }
    
    if (!validatePhone(phone)) {
      showStyledAlert("❌ رقم الجوال غير صحيح\nيجب أن يبدأ بـ 05 ويتكون من 10 أرقام", "error");
      return;
    }
    
    const btn = event?.target || document.querySelector('#registerScreen .btn-gold');
    if (btn) setLoading(btn, true, "⏳ جاري التسجيل...");
    
    Promise.resolve(findUserDocByPhone(phone))
      .then((existingDoc) => {
        if (existingDoc && existingDoc.exists) {
          currentUserId = existingDoc.id;
          currentUser = existingDoc.data();
          saveUserState(currentUserId);
          showMainApp();
          startMainApp();
          return null;
        }

        const code = Math.floor(10000 + Math.random() * 90000);
        return db.collection("users").add(withCafeTenant({
          name,
          phone,
          points: 0,
          visits: 0,
          code: code.toString(),
          createdAt: new Date()
        }));
      })
      .then((docRef) => {
        if (!docRef) return null;
        return db.collection("users").doc(docRef.id).get();
      })
      .then((doc) => {
        if (!doc || !doc.exists) return;
        currentUserId = doc.id;
        currentUser = doc.data();
        saveUserState(currentUserId);
        showMainApp();
        startMainApp();
      })
      .catch((err) => {
        console.error(err);
        showStyledAlert("⚠️ فشل التسجيل", "error");
      })
      .finally(() => {
        if (btn) setLoading(btn, false, "تسجيل");
      });
  } catch (err) {
    console.error("Registration crash:", err);
    showStyledAlert("⚠️ حدث خطأ أثناء التسجيل", "error");
  }
}

function goBackToLogin() {
  document.getElementById("registerScreen").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("loginPhone").value = "";
  document.getElementById("regName").value = "";
  document.getElementById("regPhone").value = "";
}

function logoutUser() {
  closeMenuListeners();
  clearActiveOrderListener();
  setCustomerPreorderCartLocked(false);
  hideActiveOrderTrackingUi(false);
  cartLines = [];
  persistCartLines();
  updateCartChrome();
  renderCartPage();
  if (userRealtimeUnsubscribe) {
    userRealtimeUnsubscribe();
    userRealtimeUnsubscribe = null;
  }
  currentUser = null;
  currentUserId = null;
  clearUserState();
  showLoginScreen();
  updateGuestUI();
  updateLoyaltyEntryState();
  switchToScreen("home");
  showStyledAlert("✅ تم تسجيل الخروج بنجاح", "success");
  updateProfileActionButton();
}

async function startMainApp() {
  if (db && typeof checkCafeSubscription === "function") {
    const sub = await checkCafeSubscription(db, cafeId);
    if (!sub.ok) {
      showStyledAlert(sub.message || "انتهى الاشتراك", "error");
      const mainApp = document.getElementById("mainApp");
      if (mainApp) mainApp.style.display = "none";
      const loginScreen = document.getElementById("loginScreen");
      if (loginScreen) loginScreen.style.display = "flex";
      return;
    }
  }
  showMainApp();
  if (currentUser && currentUserId) {
    updateClientUI();
  } else {
    updateGuestUI();
  }
  updateLoyaltyEntryState();
  loadMenuData();
  subscribeLoyaltySettings();
  startContactRealtime();
  startRealtimeListener();
  setupNavigation();
  setupProductOptionsModal();
  subscribeCustomerCafeMeta();
  subscribeGeneralSettings();

  loadPersistedCart();
  updateCartChrome();
  renderCartPage();

  if (openLoyaltyAfterAuth && currentUserId) {
    openLoyaltyAfterAuth = false;
    switchToScreen("loyalty");
  }

  if (preorderGeneralSettingsLoaded && preOrderEnabled && currentUserId) {
    void resumePreorderOrderTracking();
    bindPreorderAudioUnlockOnce();
  }
}

async function resumePreorderOrderTracking() {
  if (!db || !currentUserId) {
    setCustomerPreorderCartLocked(false);
    return;
  }
  if (!preorderGeneralSettingsLoaded || !preOrderEnabled) return;
  if (preorderResumeInFlight.current) return;
  preorderResumeInFlight.current = true;
  try {
    const orderId = await fetchLatestActiveOrderIdForUser();
    if (!orderId) {
      clearActiveOrderTrackStorage();
      hideActiveOrderTrackingUi(false);
      setCustomerPreorderCartLocked(false);
      return;
    }
    writeActiveOrderTrack(orderId);
    try {
      if (sessionStorage.getItem(`preorder_ready_ack_${orderId}`) === "1") {
        preorderReadyNotified.add(orderId);
      }
    } catch (e) {}
    subscribeTrackedOrder(orderId);
  } catch (e) {
    console.error("resumePreorderOrderTracking", e);
    setCustomerPreorderCartLocked(false);
  } finally {
    preorderResumeInFlight.current = false;
  }
}

// ==================== REAL-TIME LISTENER ====================
function startRealtimeListener() {
  if (userRealtimeUnsubscribe) {
    userRealtimeUnsubscribe();
    userRealtimeUnsubscribe = null;
  }
  if (!currentUserId) return;
  
  let previousVisits = currentUser?.visits || 0;
  
  userRealtimeUnsubscribe = db.collection("users").doc(currentUserId).onSnapshot((doc) => {
    if (doc.exists) {
      const newData = doc.data();
      const newVisits = newData.visits || 0;
      
      if (newVisits > previousVisits) {
        playPointSoundForClient();
        animatePointsUpdate();
      }
      
      currentUser = newData;
      previousVisits = newVisits;
      updateClientUI();
    }
  });
}

// ==================== NAVIGATION ====================
function setupNavigation() {
  if (hasNavigationSetup) return;
  const navItems = document.querySelectorAll(".nav-item");
  if (!navItems.length) return;

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const screen = item.dataset.screen;
      if (screen === "loyalty") {
        updateLoyaltyEntryState();
      }
      if (screen === "cart") {
        const navCart = document.getElementById("navCartItem");
        if (!navCart || navCart.classList.contains("nav-item--hidden")) return;
        renderCartPage();
      }
      if (screen === "profile" && !currentUserId) {
        showLoginScreen();
        return;
      }
      document.querySelectorAll(".nav-item").forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
      document.querySelectorAll(".page-content").forEach((page) => page.classList.remove("active"));
      const targetScreen = document.getElementById(`${screen}Screen`);
      if (targetScreen) targetScreen.classList.add("active");
    });
  });
  hasNavigationSetup = true;
}

// ==================== HELPERS ====================
function setLoading(btn, isLoading, text) {
  if (isLoading) {
    btn.disabled = true;
    btn.innerHTML = text;
    btn.classList.add('loading-state');
  } else {
    btn.disabled = false;
    btn.innerHTML = text;
    btn.classList.remove('loading-state');
  }
}

function showStyledAlert(message, type) {
  const alertDiv = document.createElement('div');
  alertDiv.className = `custom-alert ${type}`;
  alertDiv.innerHTML = `
    <div class="alert-content">
      <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
      <span>${message}</span>
    </div>
  `;
  document.body.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 3000);
}

// ==================== REFRESH USER DATA ====================
window.refreshUserData = function() {
  if (currentUserId) {
    db.collection("users").doc(currentUserId).get().then((doc) => {
      if (doc.exists) {
        currentUser = doc.data();
        updateClientUI();
      }
    });
  }
};

// ربط الدوال العالمية
window.selectMenuCategory = selectMenuCategory;
window.openMenuCategory = openMenuCategory;
window.goBackToCategories = goBackToCategories;
window.checkUserLogin = checkUserLogin;
window.registerNewUser = registerNewUser;
window.goBackToLogin = goBackToLogin;
window.logoutUser = logoutUser;
window.openLoyaltyAuth = openLoyaltyAuth;
window.openLoyaltyInvite = openLoyaltyInvite;
window.continueAsGuest = continueAsGuest;
window.handleProfileAction = handleProfileAction;
window.openContactLink = openContactLink;
window.cartQuickAdd = cartQuickAdd;
window.cartIncrement = cartIncrement;
window.cartDecrement = cartDecrement;
window.cartRemoveLine = cartRemoveLine;
window.openProductOptionsModal = openProductOptionsModal;
window.closeProductOptionsModal = closeProductOptionsModal;
window.toggleProductOption = toggleProductOption;
window.confirmProductOptionsSelection = confirmProductOptionsSelection;
window.submitPreorder = submitPreorder;
window.closePreorderConfirm = closePreorderConfirm;
window.__goToHomeBanner = goToHomeBanner;

// بدء التحقق من المستخدم المحفوظ
try {
  if (!db) {
    console.error("App crash:", new Error("Firebase services unavailable"));
    showMainApp();
    startMainApp();
  } else {
    startThemeRealtime();
    const savedUserId = loadUserState();
    if (savedUserId) {
      db.collection("users").doc(savedUserId).get()
        .then((doc) => {
          if (doc.exists) {
            const d = doc.data();
            if (!userBelongsToActiveCafe(d)) {
              clearUserState();
              currentUserId = null;
              currentUser = null;
              showMainApp();
              startMainApp();
              return;
            }
            currentUserId = doc.id;
            currentUser = d;
            showMainApp();
            startMainApp();
          } else {
            clearUserState();
            currentUserId = null;
            currentUser = null;
            showMainApp();
            startMainApp();
          }
        })
        .catch((e) => {
          console.error("App crash:", e);
          showMainApp();
          startMainApp();
        });
    } else {
      currentUserId = null;
      currentUser = null;
      showMainApp();
      startMainApp();
    }
  }
} catch (e) {
  console.error("App crash:", e);
  showMainApp();
  startMainApp();
}
