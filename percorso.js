/* NAPOLI 360 · "Portami qui": percorso con i mezzi pubblici calcolato sugli orari ufficiali ANM (GTFS),
   con algoritmo Connection Scan (CSA), visualizzato in 3D con CesiumJS. */
(async function () {
  const C = Cesium, CFG = window.N360, PL = window.N360_PLACES, OR = window.N360_ORIGINS;
  const NOST = !!(window.N360A11Y && window.N360A11Y.get().nostairs); // senza scale: evita fermate dichiarate non accessibili
  const SPEAK = (t) => window.N360A11Y && window.N360A11Y.speak(t);
  const $ = (s) => document.querySelector(s);
  const col = (h, a = 1) => C.Color.fromCssColorString(h).withAlpha(a);
  const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2600); };
  const q = new URLSearchParams(location.search);
  const destKey = PL[q.get("to")] ? q.get("to") : "mann";
  let fromKey = OR[q.get("from")] ? q.get("from") : "vomero";
  const DEST = PL[destKey];
  if (q.get("back")) $("#back").href = q.get("back");
  $("#t-dest").textContent = DEST.n; $("#t-sub").textContent = "Portami qui · con i mezzi pubblici";

  // ---------- tempo locale (Europe/Rome) ----------
  function romeNow(add = 0) {
    const d = new Date(Date.now() + add * 1000);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
    return { date: p.year + p.month + p.day, sec: (+p.hour % 24) * 3600 + +p.minute * 60 + +p.second };
  }
  const hhmm = (s) => { s = Math.round(s / 60); return String(Math.floor(s / 60) % 24).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  const nice = (n) => n.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/^P\. /, "Piazza ").replace(/^C\.so /, "Corso ");

  // ---------- geometria ----------
  const rad = Math.PI / 180;
  const dist = (a, b) => { const x = (b[0] - a[0]) * rad * Math.cos((a[1] + b[1]) / 2 * rad), y = (b[1] - a[1]) * rad; return Math.sqrt(x * x + y * y) * 6371000; };
  const walkSec = (a, b) => dist(a, b) * 1.3 / 1.25; // percorso reale ~30% più lungo della linea d'aria, 4,5 km/h

  // ---------- dati ANM ----------
  let TR;
  try { TR = await (await fetch("data/transit.json", { cache: "no-cache" })).json(); }
  catch (e) { $("#r-now").textContent = "Orari non disponibili"; $("#r-sub").textContent = "Riprova tra qualche minuto."; return; }
  // bus, filobus e tram (oggi e domani): si aggiungono se disponibili
  try { const B = await (await fetch("data/bus.json", { cache: "no-cache" })).json();
    Object.assign(TR.routes, B.routes); Object.assign(TR.stops, B.stops); Object.assign(TR.services, B.services); TR.patterns = TR.patterns.concat(B.patterns); TR.hasBus = true;
  } catch (e) { TR.hasBus = false; }
  const SID = Object.keys(TR.stops), SI = new Map(SID.map((s, i) => [s, i]));
  const SP = SID.map((s) => [TR.stops[s].lon, TR.stops[s].lat]);
  // trasbordi a piedi tra fermate vicine (es. Municipio L1 ↔ L6, Garibaldi L1 ↔ Piazza Garibaldi L2)
  const FOOT = SP.map(() => []);
  { const G = new Map(), cell = (ll) => Math.floor(ll[0] / 0.006) + ":" + Math.floor(ll[1] / 0.0045);
    SP.forEach((ll, i) => { const k = cell(ll); if (!G.has(k)) G.set(k, []); G.get(k).push(i); });
    SP.forEach((ll, i) => { const cx = Math.floor(ll[0] / 0.006), cy = Math.floor(ll[1] / 0.0045);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of G.get((cx + dx) + ":" + (cy + dy)) || []) if (i !== j) { const d = dist(ll, SP[j]); if (d < 450) FOOT[i].push([j, Math.max(120, walkSec(ll, SP[j]) + 60)]); } }); }

  function connections(date, from, to) {
    const out = [];
    TR.patterns.forEach((p, pi) => {
      const st = p.s.map((s) => SI.get(s));
      for (const [sid, start] of p.t) {
        if (!(TR.services[sid] || []).includes(date)) continue;
        if (start + p.o[p.o.length - 1][0] < from || start > to) continue;
        const trip = pi + "_" + start;
        for (let i = 0; i < st.length - 1; i++) out.push([start + p.o[i][1], start + p.o[i + 1][0], st[i], st[i + 1], trip, pi]);
      }
    });
    return out.sort((a, b) => a[0] - b[0]);
  }
  function plan(orig, dest, date, now, opt = {}) {
    const maxEgress = opt.hill ? 1000 : 1500; // secondi a piedi dall'ultima fermata (in collina solo fermate vicine)
    const N = SID.length, T = new Array(N).fill(Infinity), RC = new Array(N).fill(99), prev = new Array(N).fill(null), board = new Map();
    for (let i = 0; i < N; i++) { const w = walkSec(orig, SP[i]); if (w < 1500) { T[i] = now + w; RC[i] = 0; prev[i] = { k: "o", w }; } }
    for (const [dep, arr, a, b, trip, pi] of connections(date, now, now + 3 * 3600)) {
      if (dep < now) continue;
      const bo0 = board.get(trip);
      if (T[a] <= dep && (!bo0 || RC[a] < bo0.rc) && !(NOST && TR.stops[SID[a]].w === 2)) board.set(trip, { s: a, dep, rc: RC[a] }); // sali il più tardi possibile con meno cambi
      const bo = board.get(trip); if (!bo) continue;
      const rc = bo.rc + 1;
      if (NOST && TR.stops[SID[b]].w === 2) continue; // non scendere dove la fermata è dichiarata non accessibile
      if (arr < T[b] || (arr === T[b] && rc < RC[b])) {
        T[b] = arr; RC[b] = rc; prev[b] = { k: "r", from: bo.s, dep: bo.dep, arr, pi, trip };
        for (const [j, w] of FOOT[b]) if (arr + w < T[j]) { T[j] = arr + w; RC[j] = rc; prev[j] = { k: "w", from: b, w }; }
      }
    }
    let best = { t: opt.hill ? Infinity : now + walkSec(orig, dest), s: -1 };
    for (let i = 0; i < N; i++) if (T[i] < Infinity && prev[i].k !== "o" && walkSec(SP[i], dest) < maxEgress && (!opt.egress || opt.egress.includes(TR.stops[SID[i]].n))) { const t = T[i] + walkSec(SP[i], dest); if (t + 150 * RC[i] < best.t + 150 * (best.rc || 0)) best = { t, s: i, rc: RC[i] }; }
    if (best.t === Infinity) best = { t: now + walkSec(orig, dest), s: -1 };
    if (best.s < 0) return { arrive: best.t, legs: [{ k: "walk", a: orig, b: dest, dep: now, arr: best.t, to: "dest" }] };
    const legs = []; let s = best.s;
    legs.push({ k: "walk", a: SP[s], b: dest, dep: T[s], arr: best.t, to: "dest" });
    while (prev[s].k !== "o") {
      const p = prev[s];
      if (p.k === "r") legs.unshift({ k: "ride", from: p.from, to: s, dep: p.dep, arr: p.arr, pi: p.pi, trip: p.trip });
      else legs.unshift({ k: "walk", a: SP[p.from], b: SP[s], dep: T[p.from], arr: T[s], transfer: true, fromStop: p.from, toStop: s });
      s = p.from;
    }
    legs.unshift({ k: "walk", a: orig, b: SP[s], dep: now, arr: T[s], toStop: s });
    return { arrive: best.t, legs };
  }
  function nextDeps(leg, date) {
    const p = TR.patterns[leg.pi], i = p.s.indexOf(SID[leg.from]);
    return p.t.filter(([sid]) => (TR.services[sid] || []).includes(date)).map(([, st]) => st + p.o[i][1]).filter((t) => t >= leg.dep).sort((a, b) => a - b).slice(0, 4);
  }

  // ---------- viewer 3D ----------
  C.Ion.defaultAccessToken = undefined;
  const viewer = new C.Viewer("map", {
    baseLayer: new C.ImageryLayer(new C.UrlTemplateImageryProvider({ url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maximumLevel: 19, credit: "Immagini © Esri, Maxar, Earthstar Geographics" })),
    terrainProvider: new C.EllipsoidTerrainProvider(), baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false
  });
  const sc = viewer.scene; sc.highDynamicRange = false; sc.globe.baseColor = col("#D4E6F2"); sc.fog.enabled = true;
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
  let H0 = 0;
  if (CFG.ionToken) {
    try { C.Ion.defaultAccessToken = CFG.ionToken; const ts = await C.Cesium3DTileset.fromIonAssetId(2275207, { showCreditsOnScreen: true, maximumScreenSpaceError: 16 });
      sc.primitives.add(ts); sc.globe.show = false; H0 = 47; document.body.classList.add("photo"); } catch (e) { console.warn(e); }
  }
  const CLAMP = { heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY };
  const tag = (ll, text, bg, fg, extra = {}) => viewer.entities.add({ position: C.Cartesian3.fromDegrees(ll[0], ll[1], H0),
    point: { pixelSize: 12, color: col(bg), outlineColor: C.Color.WHITE, outlineWidth: 3, ...CLAMP },
    label: { text, font: "700 12.5px Inter, sans-serif", fillColor: col(fg), showBackground: true, backgroundColor: col(bg), backgroundPadding: new C.Cartesian2(8, 5),
      pixelOffset: new C.Cartesian2(0, -16), verticalOrigin: C.VerticalOrigin.BOTTOM, ...CLAMP, ...extra } });
  const line = (pts, color, width, dashed) => viewer.entities.add({ polyline: { positions: C.Cartesian3.fromDegreesArray(pts.flat()), width, clampToGround: true, classificationType: C.ClassificationType.BOTH,
    material: dashed ? new C.PolylineDashMaterialProperty({ color: col(color), gapColor: col("#0A1A33", .35), dashLength: 14 }) : new C.PolylineOutlineMaterialProperty({ color: col(color), outlineColor: C.Color.WHITE, outlineWidth: 3 }) } });

  // ---------- calcolo e rendering ----------
  const destPt = [DEST.lon, DEST.lat];
  let path = [], pathCum = [], legMarks = [], JOURNEY = null, DATE = "";
  const routeOf = (leg) => TR.routes[TR.patterns[leg.pi].r];
  const EAVN = { "1": "Circumvesuviana", "1.": "Circumvesuviana", "4": "Circumvesuviana", "6": "Circumvesuviana", "8": "Circumvesuviana", "2": "Piscinola–Aversa", "5": "Circumflegrea", "5.": "Circumflegrea", "7": "Napoli–Piedimonte", "9": "Cumana", "9.": "Cumana" };
  const EAVC = { Cumana: "8E44AD", Circumflegrea: "16A085", Circumvesuviana: "C0392B", "Piscinola–Aversa": "7F8C8D", "Napoli–Piedimonte": "7F8C8D" };
  function lineInfo(r) {
    if (r.a === "EAV" && r.type === "2") { const n = EAVN[r.s] || "Treno EAV"; return { kind: "Treno", name: n, badge: n === "Cumana" ? "CU" : n === "Circumflegrea" ? "CF" : n === "Circumvesuviana" ? "CV" : "EAV", c: "#" + (EAVC[n] || "7F8C8D") }; }
    const kind = r.type === "7" ? "Funicolare" : r.type === "1" ? "Metro" : r.type === "11" ? "Filobus" : r.type === "0" ? "Tram" : r.type === "3" ? "Bus" : "Treno";
    const c = r.c && r.c.length === 6 ? "#" + r.c : kind === "Bus" ? "#E67E22" : kind === "Filobus" ? "#D35400" : kind === "Tram" ? "#A04000" : "#0E7BC4";
    return { kind, name: kind + " " + r.s, badge: r.s, c };
  }
  const colorOf = (r) => lineInfo(r).c;
  function compute() {
    viewer.entities.removeAll(); path = []; legMarks = [];
    const O = OR[fromKey], orig = [O.lon, O.lat];
    let { date, sec } = romeNow(); DATE = date;
    let J = plan(orig, destPt, date, sec, DEST), note = "";
    if (J.legs.length === 1 && dist(orig, destPt) > 1800 && connections(date, sec, sec + 3600).length === 0) { // servizio chiuso (notte): prima corsa del mattino
      const t = romeNow(86400); DATE = t.date; J = plan(orig, destPt, t.date, 7 * 3600, DEST); note = " · prima corsa utile domattina";
    }
    JOURNEY = J;
    // disegno
    tag(orig, "Partenza · " + O.n, "#0A1A33", "#FFFFFF");
    viewer.entities.add({ position: C.Cartesian3.fromDegrees(destPt[0], destPt[1], H0 + 30), cylinder: { length: 40, topRadius: 0, bottomRadius: 7, material: col("#F2B33D", .92) } });
    tag(destPt, DEST.n, "#F2B33D", "#0A1A33", { pixelOffset: new C.Cartesian2(0, -56) });
    const html = [];
    J.legs.forEach((L, li) => {
      let pts;
      if (L.k === "walk") {
        pts = [L.a, L.b]; line(pts, "#FFFFFF", 6, true);
        const mins = Math.max(1, Math.round((L.arr - L.dep) / 60)), m = Math.round(dist(L.a, L.b) * 1.3 / 10) * 10;
        const txt = L.to === "dest" ? `A piedi fino a ${DEST.n}` : L.transfer ? `Cambio a piedi a ${nice(TR.stops[SID[L.toStop]].n)}` : `A piedi fino alla fermata ${nice(TR.stops[SID[L.toStop]].n)}`;
        html.push(`<li class="leg" data-l="${li}"><span class="b w">🚶</span><div><div class="t">${txt}</div><div class="d">circa ${mins} min · ${m} m</div></div></li>`);
      } else {
        const p = TR.patterns[L.pi], r = routeOf(L), LI = lineInfo(r), c = LI.c, i0 = p.s.indexOf(SID[L.from]), i1 = p.s.indexOf(SID[L.to]);
        const dark = r.s === "L1";
        pts = p.s.slice(i0, i1 + 1).map((s) => SP[SI.get(s)]); line(pts, c, 10, false);
        const acc = (i) => TR.stops[SID[i]].w === 1 ? " ♿" : "";
        const a = nice(TR.stops[SID[L.from]].n) + acc(L.from), b = nice(TR.stops[SID[L.to]].n) + acc(L.to), head = nice(p.h || TR.stops[p.s[p.s.length - 1]].n);
        tag(SP[L.from], `Sali · ${a} · ${LI.badge}`, c, dark ? "#0A1A33" : "#FFFFFF");
        tag(SP[L.to], `Scendi · ${b}`, c, dark ? "#0A1A33" : "#FFFFFF");
        const nx = nextDeps(L, DATE).map(hhmm).join(" · ");
        html.push(`<li class="leg" data-l="${li}"><span class="b" style="background:${c};color:${dark ? "#0A1A33" : "#fff"}">${LI.badge}</span><div><div class="t">${LI.kind === "Treno" ? LI.name : LI.name} da ${a} a ${b}</div><div class="d">direzione ${head} · ${i1 - i0} fermate · ${hhmm(L.dep)} → ${hhmm(L.arr)}</div><div class="nx">Partenze da ${a}: ${nx}</div></div></li>`);
      }
      const start = path.length; path.push(...(start ? pts.slice(1) : pts)); legMarks.push(start);
    });
    pathCum = [0]; for (let i = 1; i < path.length; i++) pathCum.push(pathCum[i - 1] + dist(path[i - 1], path[i]));
    if (DEST.tip) html.push(`<li class="leg"><span class="b w">i</span><div><div class="d">${DEST.tip}</div></div></li>`);
    $("#legs").innerHTML = html.join("");
    const dur = Math.round((J.arrive - J.legs[0].dep) / 60);
    $("#r-now").textContent = `Arrivo alle ${hhmm(J.arrive)}`;
    $("#r-sub").textContent = `Da ${O.n} · partenza ${hhmm(J.legs[0].dep)}${note}${NOST ? " · senza scale ♿" : ""}`;
    $("#r-badge").textContent = `${dur} min`;
    $("#foot").textContent = `Orari programmati ANM ed EAV (GTFS ufficiali; EAV con licenza IODL 2.0), aggiornati il ${TR.generated.slice(8, 10)}/${TR.generated.slice(5, 7)}${TR.hasBus ? "" : " · bus non disponibili"} · non includono scioperi o ritardi: verifica su anm.it ed eavsrl.it · mappa © OpenStreetMap contributors · 3D CesiumJS`;
    fetch("data/qualita.json", { cache: "no-cache" }).then((r) => r.json()).then((q) => {
      const ok = q.feeds.filter((f) => f.ok).map((f) => `${f.name} ${f.errori === 0 ? "0 errori" : f.errori + " errori"}`).join(", ");
      if (ok) $("#foot").textContent += ` · orari verificati dal validatore MobilityData (${ok})`;
    }).catch(() => {});
    overview(0);
  }
  function overview(dur = 1.4) {
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    const bs = C.BoundingSphere.fromPoints(C.Cartesian3.fromDegreesArray(path.flat()));
    const c = C.Cartographic.fromCartesian(bs.center);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromRadians(c.longitude, c.latitude - bs.radius / 6371000 * 0.45, H0 + 40), bs.radius),
      { offset: new C.HeadingPitchRange(C.Math.toRadians(0), C.Math.toRadians(-48), Math.max(900, bs.radius * 3.2)), duration: dur });
  }

  // ---------- simulazione ----------
  const walker = () => viewer.entities.getById("walker") || viewer.entities.add({ id: "walker", position: C.Cartesian3.fromDegrees(path[0][0], path[0][1], H0),
    point: { pixelSize: 18, color: col("#0E7BC4"), outlineColor: C.Color.WHITE, outlineWidth: 4, ...CLAMP } });
  const brg = (a, b) => Math.atan2((b[0] - a[0]) * Math.cos(a[1] * rad), b[1] - a[1]) / rad;
  let raf = null, t0 = 0, head = 0, lastLeg = -1;
  function at(m) { let i = 1; while (i < pathCum.length - 1 && pathCum[i] < m) i++; const a = path[i - 1], b = path[i], t = Math.min(1, Math.max(0, (m - pathCum[i - 1]) / ((pathCum[i] - pathCum[i - 1]) || 1))); return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i - 1]; }
  function tick(ts) {
    if (!t0) t0 = ts;
    const total = pathCum[pathCum.length - 1], k = Math.min(1, (ts - t0) / 32000), m = k * total, [ll, seg] = at(m);
    const h = sc.sampleHeight ? sc.sampleHeight(C.Cartographic.fromDegrees(ll[0], ll[1])) : undefined;
    const p = C.Cartesian3.fromDegrees(ll[0], ll[1], (h && isFinite(h) ? h : H0 + 20)); walker().position = p;
    const [ahead] = at(Math.min(total, m + 120)); const hd = brg(ll, ahead); if (isFinite(hd)) head += (((hd - head + 540) % 360) - 180) * 0.04;
    viewer.camera.lookAt(p, new C.HeadingPitchRange(C.Math.toRadians(head), C.Math.toRadians(-34), 330));
    $("#r-bar").style.width = (k * 100).toFixed(1) + "%";
    let li = 0; legMarks.forEach((s, i) => { if (seg >= s) li = i; });
    document.querySelectorAll(".legs li").forEach((el) => el.classList.toggle("now", +el.dataset.l === li));
    if (li !== lastLeg) { lastLeg = li; const el = document.querySelector(`.legs li[data-l="${li}"] .t`); if (el) SPEAK(el.textContent.replace("♿", "")); }
    if (k < 1) raf = requestAnimationFrame(tick); else { raf = null; $("#b-go").textContent = "Rivedi"; toast("Sei arrivato: " + DEST.n); }
  }
  $("#b-go").addEventListener("click", () => { cancelAnimationFrame(raf); t0 = 0; lastLeg = -1; head = brg(path[0], path[Math.min(2, path.length - 1)]); $("#b-go").textContent = "Simulazione in corso…"; raf = requestAnimationFrame(tick); });
  $("#b-view").addEventListener("click", () => { cancelAnimationFrame(raf); raf = null; $("#b-go").textContent = "Simula il percorso"; overview(); });

  // ---------- partenze ----------
  $("#from").innerHTML = Object.entries(OR).map(([k, o]) => `<button class="chip" data-o="${k}" aria-pressed="${k === fromKey}">Da ${o.n.split(" · ")[0]}</button>`).join("")
    + `<button class="chip" data-o="gps">📍 Dalla mia posizione</button>`;
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-o]"); if (!b) return;
    if (b.dataset.o === "gps") {
      if (!navigator.geolocation) return toast("Posizione non disponibile");
      navigator.geolocation.getCurrentPosition((p) => {
        const ll = [p.coords.longitude, p.coords.latitude];
        if (dist(ll, [14.25, 40.845]) > 12000) return toast("Sei fuori Napoli: uso il Vomero come partenza");
        OR.gps = { n: "La mia posizione", lat: ll[1], lon: ll[0] }; fromKey = "gps";
        document.querySelectorAll("[data-o]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cancelAnimationFrame(raf); compute();
      }, () => toast("Posizione non concessa"), { enableHighAccuracy: true, timeout: 10000 });
      return;
    }
    fromKey = b.dataset.o; document.querySelectorAll("[data-o]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    cancelAnimationFrame(raf); $("#b-go").textContent = "Simula il percorso"; compute();
  });
  compute();
})();
