/**
 * Client-side image optimization for Base64 → Firestore workflow.
 * Prefers WebP with balanced quality; falls back to JPEG when WebP is unavailable.
 * Preserves aspect ratio, high-quality canvas scaling, and stays under payload limits.
 */
(function () {
  "use strict";

  var FIRESTORE_FIELD_HARD_MAX = 1048487;
  var WEBP_SUPPORT_CACHE = null;

  function detectWebpCanvasExport() {
    if (WEBP_SUPPORT_CACHE !== null) return WEBP_SUPPORT_CACHE;
    try {
      var c = document.createElement("canvas");
      c.width = 2;
      c.height = 2;
      var u = c.toDataURL("image/webp", 0.82);
      WEBP_SUPPORT_CACHE = u.indexOf("data:image/webp") === 0;
    } catch (e) {
      WEBP_SUPPORT_CACHE = false;
    }
    return WEBP_SUPPORT_CACHE;
  }

  function loadWithImageElement(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      var img = new Image();
      reader.onerror = function () {
        reject(new Error("file_read_error"));
      };
      img.onerror = function () {
        reject(new Error("image_load_error"));
      };
      reader.onload = function (e) {
        var url = e.target && e.target.result;
        img.src = url || "";
        var finish = function () {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          resolve({ drawSource: img, width: w, height: h, dispose: function () {} });
        };
        if (img.decode) {
          img.decode().then(finish).catch(function () {
            reject(new Error("image_load_error"));
          });
        } else if (img.complete && (img.naturalWidth || img.width)) {
          finish();
        } else {
          img.onload = function () {
            finish();
          };
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function loadImageSource(file) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file, { imageOrientation: "from-image" })
        .then(function (bmp) {
          return {
            drawSource: bmp,
            width: bmp.width,
            height: bmp.height,
            dispose: function () {
              try {
                bmp.close();
              } catch (e) {}
            }
          };
        })
        .catch(function () {
          return loadWithImageElement(file);
        });
    }
    return loadWithImageElement(file);
  }

  function computeTargetSize(origW, origH, maxWidth) {
    if (!origW || !origH) return { width: 0, height: 0 };
    var w = origW;
    var h = origH;
    if (w > maxWidth) {
      h = Math.round((h * maxWidth) / w);
      w = maxWidth;
    }
    return { width: w, height: h };
  }

  function encodeDataUrl(canvas, preferWebp, quality) {
    if (preferWebp && detectWebpCanvasExport()) {
      return canvas.toDataURL("image/webp", quality);
    }
    return canvas.toDataURL("image/jpeg", quality);
  }

  /**
   * @param {File} file
   * @param {{ maxWidth: number, maxBytes: number, hardMaxBytes?: number }} opts
   * @returns {Promise<string>}
   */
  function optimizeImageToDataUrl(file, opts) {
    var maxWidthCap = opts.maxWidth;
    var maxBytes = opts.maxBytes;
    var hardMax = opts.hardMaxBytes != null ? opts.hardMaxBytes : FIRESTORE_FIELD_HARD_MAX;
    var preferWebp = detectWebpCanvasExport();

    return loadImageSource(file).then(function (loaded) {
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      if (!ctx) {
        loaded.dispose();
        throw new Error("canvas_error");
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      var origW = loaded.width;
      var origH = loaded.height;
      if (!origW || !origH) {
        loaded.dispose();
        throw new Error("invalid_image_dimensions");
      }

      var widthFactors = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.42];
      var qualitySteps = preferWebp
        ? [0.9, 0.88, 0.86, 0.84, 0.82, 0.78, 0.74, 0.7]
        : [0.9, 0.85, 0.82, 0.78, 0.74, 0.7];

      var bestResult = "";
      try {
        for (var fi = 0; fi < widthFactors.length; fi++) {
          var cap = Math.max(320, Math.round(maxWidthCap * widthFactors[fi]));
          var dim = computeTargetSize(origW, origH, cap);
          if (!dim.width || !dim.height) continue;

          canvas.width = dim.width;
          canvas.height = dim.height;
          ctx.clearRect(0, 0, dim.width, dim.height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(loaded.drawSource, 0, 0, dim.width, dim.height);

          for (var qi = 0; qi < qualitySteps.length; qi++) {
            var q = qualitySteps[qi];
            var dataUrl = encodeDataUrl(canvas, preferWebp, q);
            bestResult = dataUrl;
            if (dataUrl.length <= maxBytes) {
              return dataUrl;
            }
          }
        }

        if (bestResult && bestResult.length <= hardMax) {
          return bestResult;
        }
        throw new Error("image_too_large");
      } finally {
        loaded.dispose();
      }
    });
  }

  /** Menu product tiles — max width 1600px */
  function compressImageForProduct(file) {
    return optimizeImageToDataUrl(file, { maxWidth: 1600, maxBytes: 880000, hardMaxBytes: FIRESTORE_FIELD_HARD_MAX });
  }

  /** Category cards — max width 1200px */
  function compressImageForCategory(file) {
    return optimizeImageToDataUrl(file, { maxWidth: 1200, maxBytes: 880000, hardMaxBytes: FIRESTORE_FIELD_HARD_MAX });
  }

  /** Home hero banners — max width 1920px */
  function compressImageForBanner(file) {
    return optimizeImageToDataUrl(file, { maxWidth: 1920, maxBytes: 950000, hardMaxBytes: FIRESTORE_FIELD_HARD_MAX });
  }

  function compressImageForLoyaltyBackground(file) {
    return optimizeImageToDataUrl(file, { maxWidth: 1920, maxBytes: 980000, hardMaxBytes: FIRESTORE_FIELD_HARD_MAX });
  }

  function compressImageForLoyaltyIntro(file) {
    return optimizeImageToDataUrl(file, { maxWidth: 1200, maxBytes: 620000, hardMaxBytes: FIRESTORE_FIELD_HARD_MAX });
  }

  function compressImageForReward(file) {
    return optimizeImageToDataUrl(file, { maxWidth: 1200, maxBytes: 550000, hardMaxBytes: FIRESTORE_FIELD_HARD_MAX });
  }

  /**
   * Legacy helper: infer max width from requested byte budget (Firestore-safe).
   */
  function compressImageToBase64(file, maxBytes) {
    var mb = maxBytes == null ? 950000 : maxBytes;
    var maxWidth = 1600;
    if (mb <= 560000) maxWidth = 960;
    else if (mb <= 650000) maxWidth = 1100;
    else if (mb <= 760000) maxWidth = 1280;
    return optimizeImageToDataUrl(file, { maxWidth: maxWidth, maxBytes: mb, hardMaxBytes: FIRESTORE_FIELD_HARD_MAX });
  }

  /** @deprecated Use compressImageForProduct / compressImageForCategory */
  function compressImageToJpegForMenu(file) {
    return compressImageForProduct(file);
  }

  window.optimizeImageToDataUrl = optimizeImageToDataUrl;
  window.compressImageForProduct = compressImageForProduct;
  window.compressImageForCategory = compressImageForCategory;
  window.compressImageForBanner = compressImageForBanner;
  window.compressImageForLoyaltyBackground = compressImageForLoyaltyBackground;
  window.compressImageForLoyaltyIntro = compressImageForLoyaltyIntro;
  window.compressImageForReward = compressImageForReward;
  window.compressImageToBase64 = compressImageToBase64;
  window.compressImageToJpegForMenu = compressImageToJpegForMenu;
})();
