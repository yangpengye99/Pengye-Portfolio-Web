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
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );
  document.querySelectorAll(".reveal, .reveal-scale").forEach((el) => io.observe(el));

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

  // Seamless marquee: duplicate each row's children once
  document.querySelectorAll(".marquee-row").forEach((row) => {
    [...row.children].forEach((c) => {
      const clone = c.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.alt = "";
      row.appendChild(clone);
    });
  });

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
          l.style.transform = `translate3d(${x * d}px, ${y * d}px, 0)`;
        });
      });
    });
    cover.addEventListener("pointerleave", () => layers.forEach((l) => (l.style.transform = "")));
  }

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
