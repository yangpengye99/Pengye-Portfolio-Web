/* Password lock for private case studies.
   The page ships only an AES-GCM ciphertext of its <main>; the password derives the key (PBKDF2)
   in the browser, so the content is never readable in the page source. */
(() => {
  const main = document.querySelector("main[data-locked]");
  const data = document.getElementById("locked-payload");
  if (!main || !data) return;
  const payload = JSON.parse(data.textContent);
  const form = main.querySelector(".lock-form");
  const input = form.querySelector("input");
  const error = main.querySelector(".lock-error");
  const card = main.querySelector(".lock-card");
  const KEY = "unlock:" + location.pathname.replace(/^\/zh(?=\/)/, "");

  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  async function decrypt(password) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: bytes(payload.salt), iterations: payload.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(payload.iv) }, key, bytes(payload.ct));
    return new TextDecoder().decode(plain);
  }

  function show(html) {
    main.innerHTML = html;
    main.classList.remove("locked");
    main.removeAttribute("data-locked");
    window.scrollTo(0, 0);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px 8% 0px", threshold: 0 });
    main.querySelectorAll(".reveal, .reveal-scale").forEach((el) => io.observe(el));
    // videos inserted after load: start the muted autoplay ones explicitly
    main.querySelectorAll("video[autoplay]").forEach((v) => { v.muted = true; v.play().catch(() => {}); });
  }

  async function unlock(password, remember) {
    const html = await decrypt(password);
    if (remember) { try { sessionStorage.setItem(KEY, password); } catch (e) {} }
    show(html);
  }

  // unlocked earlier in this tab (e.g. after switching language) → open straight away
  let saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch (e) {}
  if (saved) unlock(saved, false).catch(() => { try { sessionStorage.removeItem(KEY); } catch (e) {} });

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const pw = input.value.trim();
    if (!pw) return;
    unlock(pw, true).catch(() => {
      error.hidden = false;
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      input.select();
    });
  });
})();
