/* NAPOLI 360 · Port Vision AI · prototipo 3D del Molo Beverello
   Dati: OpenStreetMap (data/beverello.geojson) · Motore 3D: CesiumJS · Routing: Dijkstra sui percorsi pedonali OSM */
(async function () {
  const C = Cesium, CFG = window.N360;
  const $ = (s) => document.querySelector(s);
  const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2600); };

  // ---------- Mappa 3D senza account esterni (OSM come base) ----------
  C.Ion.defaultAccessToken = undefined;
  const viewer = new C.Viewer("map", {
    baseLayer: new C.ImageryLayer(new C.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" })),
    terrainProvider: new C.EllipsoidTerrainProvider(),
    baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
    requestRenderMode: false
  });
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.globe.enableLighting = false;
  viewer.scene.highDynamicRange = false;
  const home = () => viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(CFG.view.lon, CFG.view.lat - 0.0042, CFG.view.height),
    orientation: { heading: C.Math.toRadians(CFG.view.heading), pitch: C.Math.toRadians(CFG.view.pitch), roll: 0 }, duration: 1.6
  });
  viewer.camera.setView({
    destination: C.Cartesian3.fromDegrees(CFG.view.lon, CFG.view.lat - 0.0042, CFG.view.height),
    orientation: { heading: C.Math.toRadians(CFG.view.heading), pitch: C.Math.toRadians(CFG.view.pitch), roll: 0 }
  });

  // ---------- Dati reali ----------
  let gj;
  try { gj = await (await fetch("data/beverello.geojson", { cache: "no-cache" })).json(); }
  catch (e) { $("#r-title").textContent = "Dati in aggiornamento"; $("#r-sub").textContent = "Riprova tra qualche minuto."; return; }

  const col = (hex, a = 1) => C.Color.fromCssColorString(hex).withAlpha(a);
  const pos = (ring) => C.Cartesian3.fromDegreesArray(ring.flat());
  const num = (v) => { const n = parseFloat(String(v || "").replace(",", ".")); return isFinite(n) ? n : null; };
  const heightOf = (p) => num(p.height) || (num(p["building:levels"]) ? num(p["building:levels"]) * 3.4 : null) || (p.building === "roof" ? 6 : 10);
  const ferryEntities = [];

  for (const f of gj.features) {
    const p = f.properties, g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
    if (p.building && polys) {
      const terminal = p.amenity === "ferry_terminal" || /terminal|marittim|beverello/i.test(p.name || "");
      for (const pc of polys) viewer.entities.add({ polygon: {
        hierarchy: new C.PolygonHierarchy(pos(pc[0])), height: 0, extrudedHeight: heightOf(p),
        material: terminal ? col("#9CC8E8", .96) : col("#EFE8DA", .93), outline: false } });
      continue;
    }
    if (/^(pier|quay|breakwater|groyne)$/.test(p.man_made || "")) {
      if (polys) for (const pc of polys) viewer.entities.add({ polygon: { hierarchy: new C.PolygonHierarchy(pos(pc[0])), height: 0, extrudedHeight: 1.6, material: col("#CFC3AA") } });
      else if (g.type === "LineString") viewer.entities.add({ corridor: { positions: pos(g.coordinates), width: num(p.width) || 7, height: 0, extrudedHeight: 1.6, material: col("#CFC3AA") } });
      continue;
    }
    if (p.route === "ferry" && g.type === "LineString") {
      ferryEntities.push(viewer.entities.add({ polyline: { positions: pos(g.coordinates), width: 2.5, clampToGround: true,
        material: new C.PolylineDashMaterialProperty({ color: col("#0E7BC4", .8), dashLength: 14 }) } }));
    }
  }
  $("#t-ferry").addEventListener("change", (e) => ferryEntities.forEach((en) => (en.show = e.target.checked)));

  // ---------- Motore di routing pedonale ----------
  const WALK = /^(footway|pedestrian|path|steps|living_street|service|residential|unclassified|tertiary|secondary|primary|corridor|platform|track|cycleway)$/;
  const key = (c) => c[0].toFixed(7) + "," + c[1].toFixed(7);
  const R = 6371000, rad = Math.PI / 180;
  const dist = (a, b) => { const x = (b[0] - a[0]) * rad * Math.cos((a[1] + b[1]) / 2 * rad), y = (b[1] - a[1]) * rad; return Math.sqrt(x * x + y * y) * R; };
  const nodes = new Map(), adj = new Map();
  const addN = (c) => { const k = key(c); if (!nodes.has(k)) { nodes.set(k, c); adj.set(k, []); } return k; };
  for (const f of gj.features) {
    const p = f.properties, g = f.geometry;
    if (g.type !== "LineString" || !p.highway || !WALK.test(p.highway)) continue;
    if (p.access === "private" || p.access === "no" || p.foot === "no") continue;
    const cs = g.coordinates;
    for (let i = 1; i < cs.length; i++) {
      const a = addN(cs[i - 1]), b = addN(cs[i]), d = dist(cs[i - 1], cs[i]) * (p.highway === "steps" ? 1.4 : 1);
      adj.get(a).push([b, d]); adj.get(b).push([a, d]);
    }
  }
  // componente connessa più grande
  const comp = new Map(); let best = null, bestSize = 0, cid = 0;
  for (const k of nodes.keys()) {
    if (comp.has(k)) continue; cid++; let size = 0; const st = [k]; comp.set(k, cid);
    while (st.length) { const u = st.pop(); size++; for (const [v] of adj.get(u)) if (!comp.has(v)) { comp.set(v, cid); st.push(v); } }
    if (size > bestSize) { bestSize = size; best = cid; }
  }
  const snap = (pt) => { let bk = null, bd = Infinity; for (const [k, c] of nodes) if (comp.get(k) === best) { const d = dist(c, pt); if (d < bd) { bd = d; bk = k; } } return [bk, bd]; };
  function dijkstra(s, t) {
    const D = new Map([[s, 0]]), P = new Map(), H = [[0, s]], done = new Set();
    const push = (x) => { H.push(x); let i = H.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (H[j][0] <= H[i][0]) break; [H[i], H[j]] = [H[j], H[i]]; i = j; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[i], H[m]] = [H[m], H[i]]; i = m; } } return top; };
    while (H.length) {
      const [d, u] = pop(); if (done.has(u)) continue; done.add(u); if (u === t) break;
      for (const [v, w] of adj.get(u)) { const nd = d + w; if (nd < (D.get(v) ?? Infinity)) { D.set(v, nd); P.set(v, u); push([nd, v]); } }
    }
    if (!D.has(t)) return null;
    const path = [t]; while (path[0] !== s) path.unshift(P.get(path[0]));
    return path.map((k) => nodes.get(k));
  }

  const startPt = [CFG.start.lon, CFG.start.lat], destPt = [CFG.dest.lon, CFG.dest.lat];
  const [sk, sd] = snap(startPt), [tk, td] = snap(destPt);
  let route = sk && tk ? dijkstra(sk, tk) : null;
  if (!route) { $("#r-title").textContent = "Percorso non disponibile"; $("#r-sub").textContent = "I dati pedonali di quest'area sono incompleti."; return; }
  route = [startPt, ...route, destPt];
  const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + dist(route[i - 1], route[i]));
  const total = cum[cum.length - 1], mins = Math.max(1, Math.round(total / (CFG.walkSpeedKmh * 1000 / 60)));

  // indicazioni: svolte con cambio di direzione > 40°
  const brg = (a, b) => Math.atan2((b[0] - a[0]) * Math.cos(a[1] * rad), b[1] - a[1]) / rad;
  const steps = [{ at: 0, txt: "Parti da " + CFG.start.name }];
  let lastAt = 0;
  for (let i = 1; i < route.length - 1; i++) {
    if (dist(route[i - 1], route[i]) < 4) continue;
    let j = i + 1; while (j < route.length - 1 && dist(route[i], route[j]) < 12) j++;
    let dA = brg(route[i], route[j]) - brg(route[i - 1], route[i]); dA = ((dA + 540) % 360) - 180;
    if (Math.abs(dA) > 40 && cum[i] - lastAt > 25) {
      steps.push({ at: cum[i], txt: `Dopo ${Math.round((cum[i] - lastAt) / 10) * 10} m gira a ${dA > 0 ? "destra" : "sinistra"}` }); lastAt = cum[i];
    }
  }
  steps.push({ at: total, txt: `Arrivo al ${CFG.dest.name} · ${CFG.dest.sub}`, last: true });
  const shown = steps.length > 6 ? [steps[0], ...steps.slice(1, -1).filter((_, i, a) => i % Math.ceil(a.length / 4) === 0), steps[steps.length - 1]] : steps;

  $("#r-title").textContent = `A piedi fino al ${CFG.dest.name}`;
  $("#r-sub").textContent = `${Math.round(total / 10) * 10} m da ${CFG.start.name} · percorso calcolato sui camminamenti reali`;
  $("#r-badge").textContent = `${mins} min`;
  const renderSteps = (m) => { $("#r-steps").innerHTML = shown.map((s, i) => `<li class="${s.last ? "last " : ""}${m >= s.at && (i === shown.length - 1 || m < shown[i + 1].at) ? "now" : m > s.at ? "done" : ""}"><span>${i + 1}</span>${s.txt}</li>`).join(""); };
  renderSteps(-1);

  // ---------- Disegno percorso, partenza, moli ----------
  viewer.entities.add({ polyline: { positions: pos(route), width: 9, clampToGround: true,
    material: new C.PolylineGlowMaterialProperty({ glowPower: 0.22, color: col("#0E7BC4") }) } });
  const label = (pt, text, bg, fg, h = 18) => viewer.entities.add({
    position: C.Cartesian3.fromDegrees(pt[0], pt[1], h),
    point: { pixelSize: 12, color: col(bg), outlineColor: C.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: { text, font: "700 14px Inter, sans-serif", fillColor: col(fg), showBackground: true, backgroundColor: col(bg),
      backgroundPadding: new C.Cartesian2(9, 6), pixelOffset: new C.Cartesian2(0, -24), disableDepthTestDistance: Number.POSITIVE_INFINITY }
  });
  label(startPt, CFG.start.name, "#0A1A33", "#FFFFFF");
  for (const d of CFG.docks) label([d.lon, d.lat], d.name, "#FFFFFF", "#4E5D73", 8);
  label(destPt, CFG.dest.name.toUpperCase() + " · Procida 10:40", "#F2B33D", "#0A1A33", 22);

  // ---------- Camminata simulata ----------
  const walker = viewer.entities.add({
    position: C.Cartesian3.fromDegrees(startPt[0], startPt[1], 3),
    point: { pixelSize: 18, color: col("#0E7BC4"), outlineColor: C.Color.WHITE, outlineWidth: 4, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: { text: "Giulia", font: "700 12px Inter, sans-serif", fillColor: C.Color.WHITE, showBackground: true, backgroundColor: col("#0E7BC4"),
      pixelOffset: new C.Cartesian2(0, 22), disableDepthTestDistance: Number.POSITIVE_INFINITY }
  });
  const at = (m) => { let i = 1; while (i < cum.length - 1 && cum[i] < m) i++; const a = route[i - 1], b = route[i], seg = cum[i] - cum[i - 1] || 1, t = Math.min(1, Math.max(0, (m - cum[i - 1]) / seg)); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, brg(a, b)]; };
  let raf = null, t0 = 0, follow = false;
  function tick(ts) {
    if (!t0) t0 = ts;
    const k = Math.min(1, (ts - t0) / (CFG.demoSeconds * 1000)), m = k * total, [lon, lat, h] = at(m);
    walker.position = C.Cartesian3.fromDegrees(lon, lat, 3);
    $("#r-bar").style.width = (k * 100).toFixed(1) + "%";
    $("#r-badge").textContent = k < 1 ? `${Math.max(0, Math.round((total - m) / 10) * 10)} m` : "Arrivata";
    renderSteps(m);
    if (follow) viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(lon - Math.sin(h * rad) * 0.0012, lat - Math.cos(h * rad) * 0.0009, 120),
      orientation: { heading: C.Math.toRadians(h), pitch: C.Math.toRadians(-30), roll: 0 } });
    if (k < 1) raf = requestAnimationFrame(tick);
    else { raf = null; $("#b-go").textContent = "Rivedi la guida"; toast(`Sei arrivata al ${CFG.dest.name}: mostra la carta d'imbarco`); }
  }
  $("#b-go").addEventListener("click", () => {
    cancelAnimationFrame(raf); t0 = 0; follow = true; $("#b-go").textContent = "Guida in corso…";
    toast("Guida avviata: segui la linea blu"); raf = requestAnimationFrame(tick);
  });
  $("#b-view").addEventListener("click", () => { follow = false; home(); });
  setTimeout(home, 300);
})();
