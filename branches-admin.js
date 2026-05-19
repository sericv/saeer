/**
 * Branch management for cashier dashboard (depends on db, cafeId, BranchContext, withCafe).
 */
(function (global) {
  const BC = () => global.BranchContext;
  let branchesCache = [];
  let branchesUnsubscribe = null;
  let qrLibLoading = null;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function getDb() {
    if (global.db) return global.db;
    if (typeof firebase !== "undefined" && firebase.firestore) return firebase.firestore();
    return null;
  }

  function getCafeId() {
    if (global.cafeId) return global.cafeId;
    if (typeof getResolvedCafeId === "function") return getResolvedCafeId();
    try {
      return new URLSearchParams(global.location.search).get("cafe") || "default";
    } catch {
      return "default";
    }
  }

  function getWithCafe() {
    if (typeof global.withCafe === "function") return global.withCafe;
    const cid = getCafeId();
    return (payload) => ({ ...payload, cafeId: cid });
  }

  function setBranchFormValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? "" : String(value);
  }

  function setBranchFormChecked(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = !!checked;
  }

  function getActiveBranchId() {
    const stored = global.cashierSettingsBranchId;
    if (stored && branchesCache.some((b) => b.id === stored)) return stored;
    return BC().getResolvedDefaultBranchId();
  }

  function setActiveBranchId(id) {
    global.cashierSettingsBranchId = id || BC().getResolvedDefaultBranchId();
  }

  async function loadQrLibrary() {
    if (global.QRCode) return global.QRCode;
    if (qrLibLoading) return qrLibLoading;
    qrLibLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      s.onload = () => resolve(global.QRCode);
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return qrLibLoading;
  }

  function branchCustomerUrl(branch) {
    const slug = branch.slug || branch.id;
    const path = global.location.pathname.replace(/cashier\.html$/i, "index.html");
    return BC().buildCustomerStoreUrl(getCafeId(), slug, `${global.location.origin}${path}`);
  }

  function renderBranchQrInto(el, url) {
    if (!el) return;
    el.innerHTML = "";
    if (!global.QRCode) {
      el.innerHTML = `<p class="tiny">جاري تحميل مولّد QR...</p>`;
      return;
    }
    new global.QRCode(el, {
      text: url,
      width: 200,
      height: 200,
      colorDark: "#2C2418",
      colorLight: "#ffffff",
      correctLevel: global.QRCode.CorrectLevel.M
    });
  }

  async function downloadBranchQr(branch, filename) {
    await loadQrLibrary();
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(wrap);
    const url = branchCustomerUrl(branch);
    renderBranchQrInto(wrap, url);
    await new Promise((r) => setTimeout(r, 120));
    const canvas = wrap.querySelector("canvas");
    const img = wrap.querySelector("img");
    const src = canvas ? canvas.toDataURL("image/png") : img && img.src;
    document.body.removeChild(wrap);
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = filename || `saer-qr-${branch.slug || branch.id}.png`;
    a.click();
  }

  function copyBranchLink(branch) {
    const url = branchCustomerUrl(branch);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        if (typeof showToast === "function") showToast("تم نسخ رابط الفرع ✅");
      });
    } else {
      prompt("انسخ الرابط:", url);
    }
  }

  function renderBranchesList() {
    const root = document.getElementById("branchesAdminList");
    if (!root) return;
    if (!branchesCache.length) {
      root.innerHTML = `<p class="tiny">لا توجد فروع بعد. أنشئ فرعاً جديداً أدناه.</p>`;
      return;
    }
    root.innerHTML = branchesCache
      .map((b) => {
        const id = escapeHtml(b.id);
        const name = escapeHtml(b.name || "فرع");
        const slug = escapeHtml(b.slug || BC().DEFAULT_BRANCH_ID);
        const status = b.status === "inactive" ? "غير نشط" : "نشط";
        const statusCls = b.status === "inactive" ? "branch-status--off" : "branch-status--on";
        const def = b.isDefault ? `<span class="badge">افتراضي</span>` : "";
        const url = branchCustomerUrl(b);
        return `
        <article class="branch-admin-card" data-branch-id="${id}">
          <div class="branch-admin-card-head">
            <div>
              <h4 class="branch-admin-name">${name} ${def}</h4>
              <p class="tiny branch-admin-meta">${slug} · <span class="branch-status ${statusCls}">${status}</span></p>
            </div>
            <div class="branch-admin-actions-row">
              <button type="button" class="btn btn-soft btn-sm" onclick="BranchesAdmin.openEditModal('${id}')"><i class="fas fa-pen"></i></button>
              <button type="button" class="btn btn-soft btn-sm" onclick="BranchesAdmin.duplicateBranch('${id}')"><i class="fas fa-copy"></i> نسخ</button>
              ${b.isDefault ? "" : `<button type="button" class="btn btn-soft btn-sm" onclick="BranchesAdmin.deleteBranch('${id}')"><i class="fas fa-trash"></i></button>`}
            </div>
          </div>
          <div class="branch-admin-link-row">
            <input class="input branch-link-input" readonly value="${escapeHtml(url)}">
            <button type="button" class="btn btn-gold btn-sm" onclick="BranchesAdmin.copyLink('${id}')"><i class="fas fa-link"></i></button>
            <button type="button" class="btn btn-soft btn-sm" onclick="BranchesAdmin.showQr('${id}')"><i class="fas fa-qrcode"></i></button>
          </div>
          <div id="branchQrPreview_${id}" class="branch-qr-preview" style="display:none;"></div>
        </article>`;
      })
      .join("");
  }

  function renderBranchSelectorChips(containerId, selectedIds, onChangeName) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
    if (!branchesCache.length) {
      wrap.innerHTML = `<span class="tiny">الفرع الرئيسي (افتراضي)</span>`;
      return;
    }
    wrap.innerHTML = branchesCache
      .filter((b) => b.status !== "inactive")
      .map((b) => {
        const on = selected.has(b.id) || selected.has("all");
        const allChip =
          b.isDefault && branchesCache.length > 1
            ? ""
            : "";
        return `<button type="button" class="branch-chip ${on ? "is-on" : ""}" data-branch-chip="${escapeHtml(b.id)}" onclick="BranchesAdmin.toggleChip('${containerId}', '${escapeHtml(b.id)}', '${onChangeName || ""}')">${escapeHtml(b.name || b.slug)}</button>`;
      })
      .join("") +
      (branchesCache.length > 1
        ? `<button type="button" class="branch-chip ${selected.has("all") ? "is-on" : ""}" data-branch-chip="all" onclick="BranchesAdmin.toggleChip('${containerId}', 'all', '${onChangeName || ""}')">كل الفروع</button>`
        : "");
  }

  function getSelectedChips(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return [BC().getResolvedDefaultBranchId()];
    const on = [...wrap.querySelectorAll(".branch-chip.is-on")].map((el) => el.getAttribute("data-branch-chip"));
    return BC().coerceBranchIdsForSave(on, getActiveBranchId());
  }

  function toggleChip(containerId, branchId, onChangeName) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    if (branchId === "all") {
      wrap.querySelectorAll(".branch-chip").forEach((c) => c.classList.remove("is-on"));
      wrap.querySelector('[data-branch-chip="all"]')?.classList.add("is-on");
    } else {
      wrap.querySelector('[data-branch-chip="all"]')?.classList.remove("is-on");
      const chip = wrap.querySelector(`[data-branch-chip="${branchId}"]`);
      if (chip) chip.classList.toggle("is-on");
    }
    if (onChangeName && typeof global[onChangeName] === "function") global[onChangeName]();
  }

  async function setupBranchesListener() {
    const db = getDb();
    const cafeId = getCafeId();
    if (!db || !cafeId) {
      console.warn("BranchesAdmin: db or cafeId not ready");
      return;
    }
    if (branchesUnsubscribe) branchesUnsubscribe();
    branchesUnsubscribe = db
      .collection("branches")
      .where("cafeId", "==", cafeId)
      .onSnapshot(
        async (snap) => {
          if (snap.empty) {
            await BC().ensureDefaultBranch(db, cafeId);
            return;
          }
          branchesCache = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
          BC().getDefaultBranch(branchesCache);
          const defId = BC().getResolvedDefaultBranchId();
          if (
            !global.cashierSettingsBranchId ||
            global.cashierSettingsBranchId === BC().DEFAULT_BRANCH_ID ||
            !branchesCache.some((b) => b.id === global.cashierSettingsBranchId)
          ) {
            global.cashierSettingsBranchId = defId;
          }
          renderBranchesList();
          renderBranchSettingsContextSelect();
          if (typeof global.refreshProductBranchChips === "function") global.refreshProductBranchChips();
        },
        (err) => console.error("branches listener", err)
      );
  }

  function renderBranchSettingsContextSelect() {
    const sel = document.getElementById("cashierSettingsBranchSelect");
    if (!sel) return;
    const cur = getActiveBranchId();
    sel.innerHTML = branchesCache
      .map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name || b.slug)}</option>`)
      .join("");
    sel.value = branchesCache.some((b) => b.id === cur) ? cur : BC().getResolvedDefaultBranchId();
  }

  function openCreateModal() {
    const title = document.getElementById("branchFormModalTitle");
    if (title) title.textContent = "إضافة فرع";
    setBranchFormValue("branchFormId", "");
    setBranchFormValue("branchFormName", "");
    setBranchFormValue("branchFormSlug", "");
    setBranchFormValue("branchFormStatus", "active");
    setBranchFormValue("branchFormBanner", "");
    setBranchFormChecked("branchFormHoursEnabled", false);
    setBranchFormValue("branchFormOpenTime", "08:00");
    setBranchFormValue("branchFormCloseTime", "00:00");
    document.getElementById("branchFormModal")?.classList.add("is-open");
  }

  function openEditModal(branchId) {
    const b = branchesCache.find((x) => x.id === branchId);
    if (!b) return;
    const title = document.getElementById("branchFormModalTitle");
    if (title) title.textContent = "تعديل الفرع";
    setBranchFormValue("branchFormId", b.id);
    setBranchFormValue("branchFormName", b.name || "");
    setBranchFormValue("branchFormSlug", b.slug || "");
    setBranchFormValue("branchFormStatus", b.status || "active");
    setBranchFormValue("branchFormBanner", b.banner || "");
    const wh = b.workingHours || {};
    setBranchFormChecked("branchFormHoursEnabled", wh.enabled === true);
    setBranchFormValue("branchFormOpenTime", wh.open || "08:00");
    setBranchFormValue("branchFormCloseTime", wh.close || "00:00");
    document.getElementById("branchFormModal")?.classList.add("is-open");
  }

  function closeBranchFormModal() {
    document.getElementById("branchFormModal")?.classList.remove("is-open");
  }

  async function saveBranchForm() {
    const db = getDb();
    const cafeId = getCafeId();
    const withCafe = getWithCafe();
    if (!db) {
      if (typeof showToast === "function") showToast("قاعدة البيانات غير جاهزة بعد", "error");
      return;
    }
    const id = (document.getElementById("branchFormId")?.value || "").trim();
    const name = (document.getElementById("branchFormName")?.value || "").trim();
    let slug =
      BC().normalizeSlug(document.getElementById("branchFormSlug")?.value || "") || BC().normalizeSlug(name);
    if (!name || !slug) {
      if (typeof showToast === "function") showToast("أدخل اسم الفرع والرابط", "error");
      return;
    }
    const dup = branchesCache.some((b) => b.id !== id && BC().normalizeSlug(b.slug) === slug);
    if (dup) {
      if (typeof showToast === "function") showToast("رابط الفرع مستخدم مسبقاً", "error");
      return;
    }
    const payload = {
      cafeId,
      name,
      slug,
      status: document.getElementById("branchFormStatus")?.value || "active",
      banner: (document.getElementById("branchFormBanner")?.value || "").trim(),
      workingHours: {
        enabled: !!document.getElementById("branchFormHoursEnabled")?.checked,
        open: document.getElementById("branchFormOpenTime")?.value || "08:00",
        close: document.getElementById("branchFormCloseTime")?.value || "00:00"
      },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
      if (id) {
        await db.collection("branches").doc(id).set(payload, { merge: true });
        if (typeof logActivity === "function") logActivity("branch_edit", "تعديل فرع", name);
      } else {
        payload.sortOrder = branchesCache.length + 1;
        payload.isDefault = false;
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection("branches").add(withCafe(payload));
        if (typeof logActivity === "function") logActivity("branch_add", "إضافة فرع", name);
      }
      closeBranchFormModal();
      if (typeof showToast === "function") showToast("تم حفظ الفرع ✅");
    } catch (e) {
      console.error("saveBranchForm", e);
      if (typeof showToast === "function") showToast("تعذّر حفظ الفرع", "error");
    }
  }

  async function deleteBranch(branchId) {
    const b = branchesCache.find((x) => x.id === branchId);
    if (!b || b.isDefault) return;
    if (!confirm(`حذف فرع «${b.name}»؟ المنتجات المرتبطة به تبقى في النظام.`)) return;
    const db = getDb();
    if (!db) return;
    await db.collection("branches").doc(branchId).update({ status: "inactive" });
    if (typeof showToast === "function") showToast("تم تعطيل الفرع");
  }

  async function copySettingsDoc(scope, fromBranchId, toBranchId) {
    const db = getDb();
    const cafeId = getCafeId();
    if (!db) return;
    const fromId = BC().settingsDocId(cafeId, scope, fromBranchId);
    const toId = BC().settingsDocId(cafeId, scope, toBranchId);
    const snap = await db.collection("settings").doc(fromId).get();
    if (!snap.exists) return;
    await db.collection("settings").doc(toId).set(snap.data(), { merge: true });
  }

  async function duplicateBranch(sourceBranchId) {
    const src = branchesCache.find((b) => b.id === sourceBranchId);
    if (!src) return;
    const newName = prompt("اسم الفرع الجديد:", `${src.name || "فرع"} - نسخة`);
    if (!newName || !newName.trim()) return;
    let slug = BC().normalizeSlug(prompt("رابط الفرع (slug):", `${src.slug || "branch"}-copy`) || "");
    if (!slug) slug = BC().normalizeSlug(newName) + "-" + Date.now().toString(36).slice(-4);
    if (branchesCache.some((b) => BC().normalizeSlug(b.slug) === slug)) {
      if (typeof showToast === "function") showToast("الرابط مستخدم", "error");
      return;
    }
    const db = getDb();
    const cafeId = getCafeId();
    const withCafe = getWithCafe();
    if (!db) {
      if (typeof showToast === "function") showToast("قاعدة البيانات غير جاهزة", "error");
      return;
    }
    if (typeof showToast === "function") showToast("جاري نسخ الفرع...", "info", 4000);
    const newRef = db.collection("branches").doc();
    const newBranchId = newRef.id;
    await newRef.set(
      withCafe({
        name: newName.trim(),
        slug,
        status: "active",
        isDefault: false,
        sortOrder: branchesCache.length + 1,
        banner: src.banner || "",
        workingHours: src.workingHours || { enabled: false, open: "08:00", close: "00:00" },
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      })
    );

    const catMap = {};
    const cats = await db.collection("menuCategories").where("cafeId", "==", cafeId).get();
    for (const doc of cats.docs) {
      const data = doc.data();
      if (!BC().categoryMatchesBranch({ ...data, id: doc.id }, sourceBranchId)) continue;
      const newCat = db.collection("menuCategories").doc();
      catMap[doc.id] = newCat.id;
      const branchIds = BC().coerceBranchIdsForSave(data.branchIds, newBranchId);
      await newCat.set(
        withCafe({
          ...data,
          branchIds,
          sortOrder: data.sortOrder || 1,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
      );
    }

    const prods = await db.collection("menuProducts").where("cafeId", "==", cafeId).get();
    for (const doc of prods.docs) {
      const data = doc.data();
      if (!BC().productMatchesBranch({ ...data, id: doc.id }, sourceBranchId)) continue;
      const newProd = db.collection("menuProducts").doc();
      const branchIds = BC().coerceBranchIdsForSave(data.branchIds, newBranchId);
      const categoryId = catMap[data.categoryId] || data.categoryId;
      await newProd.set(
        withCafe({
          ...data,
          branchIds,
          categoryId,
          sortOrder: data.sortOrder || 1,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
      );
    }

    for (const scope of ["general", "theme", "contact", "loyalty", "dashboardConfig"]) {
      try {
        await copySettingsDoc(scope, sourceBranchId, newBranchId);
      } catch (e) {
        console.warn("copy settings", scope, e);
      }
    }

    if (typeof logActivity === "function") logActivity("branch_duplicate", "نسخ فرع", `${src.name} → ${newName}`);
    if (typeof showToast === "function") showToast("تم نسخ الفرع بنجاح ✅");
  }

  async function showQr(branchId) {
    const b = branchesCache.find((x) => x.id === branchId);
    if (!b) return;
    await loadQrLibrary();
    const el = document.getElementById(`branchQrPreview_${branchId}`);
    if (!el) return;
    const open = el.style.display !== "none";
    if (open) {
      el.style.display = "none";
      return;
    }
    el.style.display = "flex";
    renderBranchQrInto(el, branchCustomerUrl(b));
  }

  function init() {
    const cafeId = getCafeId();
    global.cafeId = cafeId;
    global.cashierSettingsBranchId = global.cashierSettingsBranchId || BC().DEFAULT_BRANCH_ID;
    void loadQrLibrary().catch(() => {});
    const db = getDb();
    if (!db) {
      console.warn("BranchesAdmin.init: Firestore not ready");
      return;
    }
    void BC().ensureDefaultBranch(db, cafeId).then(() => setupBranchesListener());
    document.getElementById("cashierSettingsBranchSelect")?.addEventListener("change", (e) => {
      setActiveBranchId(e.target.value);
      if (typeof global.reloadCashierBranchSettings === "function") global.reloadCashierBranchSettings();
    });
  }

  global.BranchesAdmin = {
    init,
    get branches() {
      return branchesCache;
    },
    getActiveBranchId,
    setActiveBranchId,
    renderBranchSelectorChips,
    getSelectedChips,
    toggleChip,
    openCreateModal,
    openEditModal,
    closeBranchFormModal,
    saveBranchForm,
    deleteBranch,
    duplicateBranch,
    copyLink: (id) => copyBranchLink(branchesCache.find((b) => b.id === id)),
    showQr,
    downloadQr: (id) => downloadBranchQr(branchesCache.find((b) => b.id === id)),
    branchCustomerUrl: (id) => branchCustomerUrl(branchesCache.find((b) => b.id === id))
  };
})(window);
