/* NAPOLI 360 · Accessibilità condivisa tra le pagine: testo grande, alto contrasto, indicazioni a voce, percorsi senza scale.
   Le preferenze restano solo su questo dispositivo (localStorage). */
(function () {
  const KEY = "n360-a11y", S = { big: false, hc: false, voice: false, nostairs: false };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  const css = document.createElement("style");
  css.textContent = `
html.a11y-big .view, html.a11y-big .tabbar, html.a11y-big .sheet, html.a11y-big .top, html.a11y-big .lcard { zoom: 1.15; width: 86.96%; }
html.a11y-big .view { height: 86.96%; }
html.a11y-hc { --ink2: #1F2A3A; --ink3: #2B3647; --line: #7D8A9C; --surface2: #E6EBF1; --s2: #E6EBF1; }
html.a11y-hc .cap, html.a11y-hc .d, html.a11y-hc .sub, html.a11y-hc .foot, html.a11y-hc .demo { color: #1F2A3A !important; }
html.a11y-hc .card, html.a11y-hc .item, html.a11y-hc .tile, html.a11y-hc .bar, html.a11y-hc .q, html.a11y-hc .pbtn { box-shadow: 0 0 0 2px #0A1A33 !important; }
html.a11y-hc .btn.soft, html.a11y-hc .btn.ghost { box-shadow: inset 0 0 0 2px #0A1A33; }
html.a11y-hc a { text-decoration: underline; }`;
  document.head.appendChild(css);
  function apply() { const h = document.documentElement; h.classList.toggle("a11y-big", !!S.big); h.classList.toggle("a11y-hc", !!S.hc); }
  function speak(t) {
    if (!S.voice) return;
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(t).replace(/·/g, ",")); u.lang = "it-IT"; u.rate = 1;
      const v = speechSynthesis.getVoices().find((v) => /^it/i.test(v.lang)); if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  window.N360A11Y = {
    get: () => ({ ...S }),
    set: (k, v) => { S[k] = !!v; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} apply(); if (k === "voice" && v) speak("Indicazioni a voce attive"); },
    speak
  };
  apply();
})();
