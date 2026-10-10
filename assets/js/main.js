(() => {

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reveal on scroll
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: "0px 0px 8% 0px", threshold: 0 }
  );
  document.querySelectorAll(".reveal, .reveal-scale").forEach((el) => io.observe(el));

  // Warm every lazy image in the background once the page has loaded (4 at a time, in page order),
  // so scrolling never waits on a fetch. Skipped when the visitor asked to save data.
  const warm = () => {
    if (navigator.connection && navigator.connection.saveData) return;
    const imgs = [...document.querySelectorAll('img[loading="lazy"]')];
    let i = 0;
    const next = () => {
      const img = imgs[i++];
      if (!img) return;
      img.loading = "eager";
      if (img.complete) return next();
      img.addEventListener("load", next, { once: true });
      img.addEventListener("error", next, { once: true });
    };
    for (let k = 0; k < 4; k++) next();
  };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  if (document.readyState === "complete") idle(warm);
  else window.addEventListener("load", () => idle(warm), { once: true });

  // Nav state + active section
  const nav = document.querySelector(".nav");
  const onScroll = () => nav && nav.classList.toggle("scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  if (links.length) {
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const a = map.get(e.target.id);
          if (a && e.isIntersecting) {
            links.forEach((l) => l.classList.remove("active"));
            a.classList.add("active");
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    map.forEach((_, id) => {
      const s = document.getElementById(id);
      if (s) spy.observe(s);
    });
  }

  // Seamless marquee: repeat each row's set until it is wider than the screen,
  // then double it so translateX(-50%) loops with no visible gap at any width.
  const rows = [...document.querySelectorAll(".marquee-row")].map((row) => ({ row, items: [...row.children] }));
  const fillRows = () => {
    rows.forEach(({ row, items }) => {
      row.replaceChildren(...items);
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const setW = items.reduce((w, el) => w + el.getBoundingClientRect().width + gap, 0);
      if (!setW) return;
      const reps = Math.max(1, Math.ceil((window.innerWidth + 200) / setW));
      const half = [];
      for (let r = 0; r < reps; r++) items.forEach((el) => half.push(r ? el.cloneNode(true) : el));
      const clones = half.map((el) => el.cloneNode(true));
      [...half.slice(items.length), ...clones].forEach((c) => { c.setAttribute("aria-hidden", "true"); c.alt = ""; c.loading = "eager"; });
      row.replaceChildren(...half, ...clones);
      row.style.setProperty("--dur", Math.round((setW * reps) / 45) + "s");
    });
  };
  fillRows();
  let rt = 0;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(fillRows, 200); });

  // Cover: subtle parallax on the glass slabs and tags
  const cover = document.querySelector(".cover");
  if (cover && !reduce && window.matchMedia("(pointer: fine)").matches) {
    const layers = cover.querySelectorAll("[data-depth]");
    let raf = 0;
    cover.addEventListener("pointermove", (ev) => {
      const r = cover.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width - 0.5;
      const y = (ev.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        layers.forEach((l) => {
          const d = parseFloat(l.dataset.depth);
          l.style.translate = `${x * d}px ${y * d}px`;
        });
      });
    });
    cover.addEventListener("pointerleave", () => layers.forEach((l) => (l.style.translate = "")));
  }

  // Experience: cards stay folded until the list scrolls into view, then unfold one by one
  const xpList = document.querySelector(".xp-list");
  if (xpList && !reduce) {
    const cards = [...xpList.querySelectorAll(".xp")];
    xpList.classList.add("foldable");
    const unfold = () => {
      xpList.classList.add("unfolded");
      cards.forEach((c, i) => setTimeout(() => c.classList.add("open"), 140 * i));
    };
    const xo = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { unfold(); xo.disconnect(); } }),
      { rootMargin: "0px 0px -30% 0px" }
    );
    xo.observe(xpList);
    cards.forEach((c) => c.addEventListener("click", () => { c.classList.add("open"); xpList.classList.add("unfolded"); }));
  }

  // Live demos: load the build into the phone only when asked, scale 390x844 to fit
  document.querySelectorAll(".demo-phone").forEach((ph) => {
    const screen = ph.querySelector(".demo-screen");
    const fit = () => screen.style.setProperty("--k", screen.clientWidth / 390);
    fit();
    window.addEventListener("resize", fit);
    const start = () => {
      const f = document.createElement("iframe");
      f.src = ph.dataset.src;
      f.title = ph.dataset.title || "Live demo";
      f.allow = "autoplay";
      screen.appendChild(f);
      ph.querySelector(".demo-cover")?.remove();
      fit();
    };
    ph.querySelector(".demo-cover")?.addEventListener("click", start);
    ph.closest("section")?.querySelectorAll("[data-demo-restart]").forEach((b) => b.addEventListener("click", () => { screen.querySelector("iframe")?.remove(); start(); }));
  });

  // Copy email
  const toast = document.querySelector(".toast");
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        if (toast) {
          toast.textContent = "Email copied to clipboard";
          toast.classList.add("show");
          setTimeout(() => toast.classList.remove("show"), 1800);
        }
      } catch {
        window.location.href = "mailto:" + btn.dataset.copy;
      }
    });
  });

  const y = document.querySelector("[data-year]");
  if (y) y.textContent = new Date().getFullYear();
})();
