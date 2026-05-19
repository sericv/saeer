/**
 * Multi-branch context for Saer (safe extension — legacy stores use branch "main").
 * Loyalty/users/points stay cafe-scoped only; products/settings/orders are branch-aware.
 */
(function (global) {
  const DEFAULT_BRANCH_ID = "main";
  const BRANCH_STORAGE_PREFIX = "saer_branch_";
  /** Firestore document id of the cafe default branch (set when branches load). */
  let resolvedDefaultBranchId = null;

  function normalizeSlug(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\u0600-\u06FF-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function branchStorageKey(cafeId) {
    return `${BRANCH_STORAGE_PREFIX}${String(cafeId || "default").trim()}`;
  }

  function normalizeBranchIds(raw) {
    if (raw == null) return null;
    if (Array.isArray(raw)) {
      const ids = raw.map((x) => String(x || "").trim()).filter(Boolean);
      return ids.length ? ids : null;
    }
    if (typeof raw === "string" && raw.trim()) {
      if (raw === "all" || raw === "*") return ["all"];
      return [raw.trim()];
    }
    if (raw.branchId) return [String(raw.branchId).trim()];
    return null;
  }

  function setResolvedDefaultBranchId(branchId) {
    resolvedDefaultBranchId = branchId ? String(branchId).trim() : null;
  }

  function getResolvedDefaultBranchId() {
    return resolvedDefaultBranchId || DEFAULT_BRANCH_ID;
  }

  /** True when viewing the cafe default / main branch (slug "main" or its Firestore id). */
  function isDefaultBranch(branchId) {
    const bid = String(branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
    if (bid === DEFAULT_BRANCH_ID) return true;
    if (resolvedDefaultBranchId && bid === resolvedDefaultBranchId) return true;
    return false;
  }

  function branchIdListed(ids, branchId) {
    const bid = String(branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
    if (ids.includes("all") || ids.includes("*")) return true;
    if (ids.includes(bid)) return true;
    if (ids.includes(DEFAULT_BRANCH_ID) && isDefaultBranch(bid)) return true;
    if (resolvedDefaultBranchId && ids.includes(resolvedDefaultBranchId) && isDefaultBranch(bid)) return true;
    return false;
  }

  /** Legacy products/categories without branchIds → default branch only. */
  function entityMatchesBranch(entity, branchId) {
    const bid = String(branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
    const ids = normalizeBranchIds(entity && entity.branchIds);
    if (entity && entity.branchId && !ids) {
      const legacy = String(entity.branchId).trim();
      if (legacy === bid) return true;
      return isDefaultBranch(bid) && (legacy === DEFAULT_BRANCH_ID || legacy === resolvedDefaultBranchId);
    }
    if (!ids || !ids.length) {
      return isDefaultBranch(bid);
    }
    return branchIdListed(ids, bid);
  }

  function productMatchesBranch(product, branchId) {
    return entityMatchesBranch(product, branchId);
  }

  function categoryMatchesBranch(category, branchId) {
    return entityMatchesBranch(category, branchId);
  }

  function settingsDocId(cafeId, scope, branchId) {
    const cid = String(cafeId || "default").trim();
    const sc = String(scope || "").trim();
    const bid = String(branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
    if (isDefaultBranch(bid)) return `${cid}_${sc}`;
    return `${cid}_${bid}_${sc}`;
  }

  function getBranchParamFromUrl() {
    const params = new URLSearchParams(global.location && global.location.search ? global.location.search : "");
    const b = params.get("branch");
    return b && String(b).trim() ? String(b).trim() : "";
  }

  function resolveBranchFromList(branches, slugOrId) {
    const list = Array.isArray(branches) ? branches : [];
    const q = String(slugOrId || "").trim();
    if (!q) return null;
    const slug = normalizeSlug(q);
    const bySlug = list.find((b) => normalizeSlug(b.slug) === slug || normalizeSlug(b.slug) === normalizeSlug(q));
    if (bySlug) return bySlug;
    return list.find((b) => b.id === q) || null;
  }

  function getDefaultBranch(branches) {
    const list = Array.isArray(branches) ? branches : [];
    const def =
      list.find((b) => b.isDefault === true) ||
      list.find((b) => b.id === DEFAULT_BRANCH_ID) ||
      list.find((b) => normalizeSlug(b.slug) === DEFAULT_BRANCH_ID) ||
      list[0] ||
      null;
    setResolvedDefaultBranchId(def ? def.id : DEFAULT_BRANCH_ID);
    return def;
  }

  function getResolvedBranchId(cafeId, branches) {
    const list = Array.isArray(branches) ? branches : [];
    const fromUrl = getBranchParamFromUrl();
    if (fromUrl) {
      const match = resolveBranchFromList(list, fromUrl);
      const id = match ? match.id : (list.some((b) => b.id === fromUrl) ? fromUrl : null);
      if (id) {
        try {
          global.localStorage.setItem(branchStorageKey(cafeId), id);
        } catch (e) {}
        return id;
      }
    }
    try {
      const stored = global.localStorage.getItem(branchStorageKey(cafeId));
      if (stored && list.some((b) => b.id === stored && b.status !== "inactive")) return stored;
    } catch (e) {}
    const def = getDefaultBranch(list);
    return def ? def.id : DEFAULT_BRANCH_ID;
  }

  function getBranchSlug(branches, branchId) {
    const b = (Array.isArray(branches) ? branches : []).find((x) => x.id === branchId);
    return b && b.slug ? String(b.slug) : DEFAULT_BRANCH_ID;
  }

  function getBranchName(branches, branchId) {
    const b = (Array.isArray(branches) ? branches : []).find((x) => x.id === branchId);
    return b && b.name ? String(b.name) : "الفرع الرئيسي";
  }

  function buildCustomerStoreUrl(cafeId, branchSlug, baseHref) {
    const href = baseHref || (global.location ? global.location.href.split("?")[0] : "index.html");
    const url = new URL(href, global.location ? global.location.origin : undefined);
    url.searchParams.set("cafe", String(cafeId || "default"));
    const slug = normalizeSlug(branchSlug || DEFAULT_BRANCH_ID);
    if (slug && slug !== DEFAULT_BRANCH_ID) url.searchParams.set("branch", slug);
    else url.searchParams.delete("branch");
    return url.toString();
  }

  function coerceBranchIdsForSave(selectedIds, fallbackBranchId) {
    const arr = Array.isArray(selectedIds) ? selectedIds.filter(Boolean) : [];
    if (!arr.length) {
      const fb = String(fallbackBranchId || getResolvedDefaultBranchId()).trim() || getResolvedDefaultBranchId();
      return [fb];
    }
    if (arr.includes("all")) return ["all"];
    return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))];
  }

  /**
   * Ensures at least one default branch exists for the cafe (non-destructive).
   */
  async function ensureDefaultBranch(db, cafeId) {
    if (!db || !cafeId) return { id: DEFAULT_BRANCH_ID, slug: DEFAULT_BRANCH_ID, name: "الفرع الرئيسي", isDefault: true };
    const snap = await db.collection("branches").where("cafeId", "==", cafeId).limit(20).get();
    if (!snap.empty) {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const def = getDefaultBranch(list);
      const row = def || { id: snap.docs[0].id, ...snap.docs[0].data() };
      setResolvedDefaultBranchId(row.id);
      return row;
    }
    const ref = db.collection("branches").doc();
    const payload = {
      cafeId,
      name: "الفرع الرئيسي",
      slug: DEFAULT_BRANCH_ID,
      status: "active",
      isDefault: true,
      sortOrder: 1,
      banner: "",
      workingHours: {
        enabled: false,
        open: "08:00",
        close: "00:00"
      },
      createdAt:
        typeof firebase !== "undefined" && firebase.firestore && firebase.firestore.FieldValue
          ? firebase.firestore.FieldValue.serverTimestamp()
          : new Date()
    };
    await ref.set(payload);
    const created = { id: ref.id, ...payload };
    setResolvedDefaultBranchId(created.id);
    return created;
  }

  async function loadBranchesForCafe(db, cafeId) {
    if (!db || !cafeId) return [];
    await ensureDefaultBranch(db, cafeId);
    const snap = await db
      .collection("branches")
      .where("cafeId", "==", cafeId)
      .orderBy("sortOrder", "asc")
      .get()
      .catch(async () => {
        const s2 = await db.collection("branches").where("cafeId", "==", cafeId).get();
        return s2;
      });
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => b.status !== "inactive" || b.isDefault)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    getDefaultBranch(list);
    return list;
  }

  global.DEFAULT_BRANCH_ID = DEFAULT_BRANCH_ID;
  global.BranchContext = {
    DEFAULT_BRANCH_ID,
    setResolvedDefaultBranchId,
    getResolvedDefaultBranchId,
    isDefaultBranch,
    normalizeSlug,
    normalizeBranchIds,
    entityMatchesBranch,
    productMatchesBranch,
    categoryMatchesBranch,
    settingsDocId,
    getBranchParamFromUrl,
    resolveBranchFromList,
    getDefaultBranch,
    getResolvedBranchId,
    getBranchSlug,
    getBranchName,
    buildCustomerStoreUrl,
    coerceBranchIdsForSave,
    ensureDefaultBranch,
    loadBranchesForCafe,
    branchStorageKey
  };
})(typeof window !== "undefined" ? window : globalThis);
