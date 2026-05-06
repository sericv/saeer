/**
 * Multi-tenant store context (shared by customer app, cashier, owner).
 * Resolve ?cafe= from URL, then localStorage, then default "default".
 */
(function (global) {
  const DEFAULT_CAFE_ID = "default";
  const STORAGE_KEY = "active_cafe_id";
  const STORE_LABEL = "متجر";

  function getResolvedCafeId() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("cafe");
    if (q && String(q).trim()) {
      const id = String(q).trim();
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch (e) {}
      return id;
    }
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s && String(s).trim()) return String(s).trim();
    } catch (e) {}
    return DEFAULT_CAFE_ID;
  }

  function parseFirestoreDate(val) {
    if (val == null) return null;
    if (typeof val.toDate === "function") {
      const d = val.toDate();
      return d && !Number.isNaN(d.getTime()) ? d : null;
    }
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /**
   * Build UI fields from cafes/{cafeId} document data (plain object).
   */
  function buildStoreSubscriptionState(d) {
    const raw = d && typeof d === "object" ? d : {};
    const storeName = (raw.name != null && String(raw.name).trim()) || "";
    const headline = storeName ? `${STORE_LABEL} | ${storeName}` : STORE_LABEL;
    const plan = raw.plan != null ? String(raw.plan) : "";
    const isTrial = plan === "trial";
    const isPaid = plan === "monthly" || plan === "yearly";
    const trialDays = raw.trialDays != null && !Number.isNaN(Number(raw.trialDays)) ? Number(raw.trialDays) : null;
    const exp = parseFirestoreDate(raw.expiresAt);
    const now = Date.now();
    let remainingDays = null;
    if (exp && !Number.isNaN(exp.getTime())) {
      remainingDays = Math.max(0, Math.ceil((exp.getTime() - now) / 86400000));
    }
    let subscriptionTypeAr = "غير محدد";
    let subscriptionLineAr = "";
    if (isTrial) {
      subscriptionTypeAr = "تجريبي";
      subscriptionLineAr =
        remainingDays != null ? `تجريبي (باقي ${remainingDays} ${remainingDays === 1 ? "يوم" : "أيام"})` : "تجريبي";
    } else if (isPaid) {
      subscriptionTypeAr = "مدفوع";
      const planWord = plan === "yearly" ? "سنوي" : "شهري";
      subscriptionLineAr =
        remainingDays != null
          ? `مدفوع (${planWord}) — باقي ${remainingDays} ${remainingDays === 1 ? "يوم" : "أيام"}`
          : `مدفوع (${planWord})`;
    } else if (plan) {
      subscriptionTypeAr = plan;
      subscriptionLineAr = plan;
    }
    const createdAt = parseFirestoreDate(raw.createdAt);
    return {
      storeName,
      headline,
      plan: plan || null,
      isTrial,
      isPaid,
      trialDays,
      expiresAt: exp,
      createdAt,
      remainingDays,
      subscriptionTypeAr,
      subscriptionLineAr
    };
  }

  /**
   * If cafes/{cafeId} is missing → allow (legacy single-tenant).
   * If active === false or expiresAt in the past → block.
   * Returns extra fields for cashier / customer UI (backward compatible: callers use .ok).
   */
  async function checkCafeSubscription(db, cafeId) {
    const fallback = {
      ok: true,
      message: "",
      storeName: "",
      headline: STORE_LABEL,
      plan: null,
      isTrial: false,
      isPaid: false,
      trialDays: null,
      expiresAt: null,
      remainingDays: null,
      subscriptionTypeAr: "",
      subscriptionLineAr: "",
      createdAt: null
    };
    if (!db || !cafeId) return fallback;
    try {
      const snap = await db.collection("cafes").doc(cafeId).get();
      if (!snap.exists) return fallback;
      const d = snap.data() || {};
      const ui = buildStoreSubscriptionState(d);
      if (d.active === false) {
        return Object.assign({}, ui, {
          ok: false,
          message: "تم تعطيل هذا المتجر."
        });
      }
      const exp = ui.expiresAt;
      if (exp && !Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
        return Object.assign({}, ui, {
          ok: false,
          message: "انتهى الاشتراك"
        });
      }
      return Object.assign({ ok: true, message: "" }, ui);
    } catch (e) {
      console.error("checkCafeSubscription", e);
      return fallback;
    }
  }

  global.DEFAULT_CAFE_ID = DEFAULT_CAFE_ID;
  global.STORE_LABEL = STORE_LABEL;
  global.getResolvedCafeId = getResolvedCafeId;
  global.checkCafeSubscription = checkCafeSubscription;
  global.buildStoreSubscriptionState = buildStoreSubscriptionState;
  global.parseFirestoreDate = parseFirestoreDate;
})(typeof window !== "undefined" ? window : globalThis);
