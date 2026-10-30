/* Vista dal vivo: fotocamera del telefono + GPS + bussola, con frecce verso il Molo B.
   Se non sei al Beverello (o il GPS non è disponibile) parte una modalità demo che simula la camminata. */
(function () {
  const $ = (s) => document.querySelector(s);
  const live = $("#live"), video = $("#cam"), fb = $("#camfb");
  const ICON = {
    up: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
    right: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20v-7a3 3 0 0 1 3-3h8"/><path d="m14 6 4 4-4 4"/></svg>',
    left: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 20v-7a3 3 0 0 0-3-3H6"/><path d="m10 6-4 4 4 4"/></svg>',
    back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    done: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
  };
  let stream = null, geoId = null, heading = null, gotAbs = false, gps = null, acc = null, demoM = 0, last = 0, raf = null, smooth = 0;

  function onOri(e) {
    if (e.webkitCompassHeading != null) { heading = e.webkitCompassHeading; gotAbs = true; }
    else if (e.type === "deviceorientationabsolute" || e.absolute) { if (e.alpha != null) { heading = (360 - e.alpha) % 360; gotAbs = true; } }
  }
  function along(R, m) {
    const { route, cum } = R; m = Math.max(0, Math.min(R.total, m));
    let i = 1; while (i < cum.length - 1 && cum[i] < m) i++;
    const a = route[i - 1], b = route[i], t = Math.min(1, Math.max(0, (m - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function project(R, p) { // posizione → metri lungo il percorso e distanza dal percorso
    const { route, cum, dist } = R; let best = [Infinity, 0];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], k = Math.cos(a[1] * Math.PI / 180);
      const ax = a[0] * k, ay = a[1], bx = b[0] * k, by = b[1], px = p[0] * k, py = p[1];
      const L = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-12, t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L));
      const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d = dist(p, q);
      if (d < best[0]) best = [d, cum[i - 1] + (cum[i] - cum[i - 1]) * t];
    }
    return best;
  }
  function loop(ts) {
    const R = window.N360route; if (!R) { raf = requestAnimationFrame(loop); return; }
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
    let user, m, off = 0, real = false;
    if (gps) { const [d, mm] = project(R, gps); if (d < 800) { real = true; user = gps; m = mm; off = d; } }
    if (!real) { demoM = Math.min(R.total, demoM + dt * 4.2); m = demoM; user = along(R, m); }
    const target = along(R, m + 25), dest = R.route[R.route.length - 1];
    const remaining = Math.max(0, R.total - m + off);
    const bT = R.brg(user, target), bD = R.brg(user, dest);
    const h = gotAbs && heading != null ? heading : (real ? bT : R.brg(along(R, Math.max(0, m - 8)), along(R, m + 4)));
    let rel = ((bT - h + 540) % 360) - 180; smooth += (((rel - smooth + 540) % 360) - 180) * 0.15;
    $("#plane").style.transform = `rotateX(64deg) rotateZ(${smooth.toFixed(1)}deg)`;
    const rd = ((bD - h + 540) % 360) - 180, pin = $("#l-pin");
    pin.style.left = (50 + Math.max(-45, Math.min(45, rd / 40 * 40))).toFixed(1) + "%"; pin.style.opacity = Math.abs(rd) < 50 ? 1 : .35;
    $("#l-pindist").textContent = `${Math.round(remaining / 5) * 5} m · ${Math.max(1, Math.round(remaining / 75))} min`;
    let dir = "up", txt = "Prosegui dritto";
    if (remaining < 12) { dir = "done"; txt = "Sei al Molo B: mostra la carta d'imbarco"; }
    else if (Math.abs(rel) > 120) { dir = "back"; txt = "Girati: il percorso è alle tue spalle"; }
    else if (rel > 28) { dir = "right"; txt = "Gira a destra"; }
    else if (rel < -28) { dir = "left"; txt = "Gira a sinistra"; }
    $("#l-now").textContent = txt; $("#l-ico").innerHTML = ICON[dir]; $("#l-ico").classList.toggle("done", dir === "done");
    $("#l-dist").textContent = remaining < 12 ? "Arrivo" : `${Math.round(remaining / 5) * 5} m`;
    $("#l-mode").textContent = real ? `GPS attivo · precisione ±${Math.round(acc || 0)} m${gotAbs ? "" : " · bussola non disponibile"}`
      : "Modalità demo: non sei al Beverello, simulo la camminata dalla metro";
    raf = requestAnimationFrame(loop);
  }
  async function open() {
    live.hidden = false; demoM = 0; last = 0; smooth = 0;
    try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") await DeviceOrientationEvent.requestPermission(); } catch (e) {}
    addEventListener("deviceorientationabsolute", onOri, true); addEventListener("deviceorientation", onOri, true);
    fb.hidden = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream; await video.play().catch(() => {}); fb.hidden = true;
    } catch (e) { $("#l-mode").textContent = "Fotocamera non disponibile: vista simulata"; }
    if (navigator.geolocation) geoId = navigator.geolocation.watchPosition(
      (p) => { gps = [p.coords.longitude, p.coords.latitude]; acc = p.coords.accuracy; },
      () => { gps = null; }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function close() {
    live.hidden = true; cancelAnimationFrame(raf); raf = null;
    if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null;
    if (geoId != null) navigator.geolocation.clearWatch(geoId); geoId = null; gps = null;
    removeEventListener("deviceorientationabsolute", onOri, true); removeEventListener("deviceorientation", onOri, true);
  }
  $("#b-live").addEventListener("click", open);
  $("#l-close").addEventListener("click", close);
})();
