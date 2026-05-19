(function () {
  "use strict";

  const header = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const drawer = document.querySelector(".mobile-drawer");
  const drawerClose = document.querySelector(".mobile-drawer__close");
  const drawerBackdrop = document.querySelector(".mobile-drawer__backdrop");
  const drawerLinks = document.querySelectorAll(".mobile-drawer a[data-scroll]");

  function setHeaderScrolled() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  }

  setHeaderScrolled();
  window.addEventListener("scroll", setHeaderScrolled, { passive: true });

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    navToggle?.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    navToggle?.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  navToggle?.addEventListener("click", () => {
    if (drawer?.classList.contains("is-open")) closeDrawer();
    else openDrawer();
  });
  drawerClose?.addEventListener("click", closeDrawer);
  drawerBackdrop?.addEventListener("click", closeDrawer);

  drawerLinks.forEach((a) => {
    a.addEventListener("click", () => closeDrawer());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  /** Scroll-spy reveal */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-visible");
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /** FAQ accordion (single open optional — keep simple: toggle each) */
  document.querySelectorAll(".faq-item__q").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      if (!item) return;
      const wasOpen = item.classList.contains("is-open");
      document.querySelectorAll(".faq-item.is-open").forEach((o) => {
        if (o !== item) o.classList.remove("is-open");
      });
      item.classList.toggle("is-open", !wasOpen);
    });
  });
})();
