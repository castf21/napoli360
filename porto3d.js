/* NAPOLI 360 · Port Vision AI · Molo Beverello in 3D
   Dati: OpenStreetMap (data/beverello.geojson) · 3D: CesiumJS · Routing: Dijkstra sui camminamenti OSM */
(async function () {
  const C = Cesium, CFG = window.N360;
  const $ = (s) => document.querySelector(s);
  const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2600); };
  const col = (hex, a = 1) => C.Color.fromCssColorString(hex).withAlpha(a);
  const ICON = {
    up: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
    right: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20v-7a3 3 0 0 1 3-3h8"/><path d="m14 6 4 4-4 4"/></svg>',
    left: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 20v-7a3 3 0 0 0-3-3H6"/><path d="m10 6-4 4 4 4"/></svg>',
    done: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
  };

  // ---------- Mappa: base chiara CARTO (dati OSM) per far risaltare 3D e percorso ----------
  C.Ion.defaultAccessToken = undefined;
  const viewer = new C.Viewer("map", {
    baseLayer: new C.ImageryLayer(new C.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19, credit: "Immagini © Esri, Maxar, Earthstar Geographics" })),
    terrainProvider: new C.EllipsoidTerrainProvider(),
    baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false
  });
  window.__n360 = viewer;
  const sc = viewer.scene;
  sc.globe.baseColor = col("#D4E6F2"); sc.skyAtmosphere.show = false; sc.skyBox.show = false; sc.sun.show = false; sc.moon.show = false;
  sc.backgroundColor = col("#EAF2F8"); sc.fog.enabled = false; sc.highDynamicRange = false;
  sc.screenSpaceCameraController.minimumZoomDistance = 40; sc.screenSpaceCameraController.maximumZoomDistance = 3000;
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);

  // ---------- Dati reali ----------
  let gj;
  try { gj = await (await fetch("data/beverello.geojson", { cache: "no-cache" })).json(); }
  catch (e) { $("#r-now").textContent = "Dati in aggiornamento"; $("#r-sub").textContent = "Riprova tra qualche minuto."; return; }
  const pos = (ring, h = 0) => C.Cartesian3.fromDegreesArrayHeights(ring.flatMap((c) => [c[0], c[1], h]));
  const num = (v) => { const n = parseFloat(String(v || "").replace(",", ".")); return isFinite(n) ? n : null; };
  const heightOf = (p) => num(p.height) || (num(p["building:levels"]) ? num(p["building:levels"]) * 3.4 : null) || (p.building === "roof" ? 6 : 12);
  const R = 6371000, rad = Math.PI / 180;
  const dist = (a, b) => { const x = (b[0] - a[0]) * rad * Math.cos((a[1] + b[1]) / 2 * rad), y = (b[1] - a[1]) * rad; return Math.sqrt(x * x + y * y) * R; };
  const center = [CFG.dest.lon, CFG.dest.lat];
  const buildings = [];

  for (const f of gj.features) {
    const p = f.properties, g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
    if (p.building && polys) {
      const terminal = p.amenity === "ferry_terminal" || /terminal|marittim|beverello/i.test(p.name || "");
      const far = dist(polys[0][0][0], center) > 450;
      for (const pc of polys) buildings.push(viewer.entities.add({ polygon: {
        hierarchy: new C.PolygonHierarchy(pos(pc[0])), height: 0, extrudedHeight: heightOf(p),
        material: terminal ? col("#3E9BE0", .55) : col("#FFFFFF", far ? .18 : .32),
        outline: false } }));
      if (terminal) viewer.entities.add({ position: C.Cartesian3.fromDegrees(polys[0][0][0][0] + 0.0001, polys[0][0][0][1] - 0.0002, heightOf(p) + 6),
        label: { text: "Stazione marittima", font: "600 12px Inter, sans-serif", fillColor: col("#0B6AA9"), outlineColor: C.Color.WHITE, outlineWidth: 3,
          style: C.LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: new C.DistanceDisplayCondition(0, 900) } });
      continue;
    }
    if (/^(pier|quay|breakwater|groyne)$/.test(p.man_made || "")) {
      // le banchine sono già visibili nell'immagine satellitare
      continue;
    }
  }
  const ferries = gj.features.filter((f) => f.properties.route === "ferry" && f.geometry.type === "LineString").map((f) =>
    viewer.entities.add({ polyline: { positions: pos(f.geometry.coordinates), width: 2, clampToGround: true,
      material: new C.PolylineDashMaterialProperty({ color: col("#0E7BC4", .45), dashLength: 12 }) } }));

  // ---------- Motore di routing pedonale ----------
  const WALK = /^(footway|pedestrian|path|steps|living_street|service|residential|unclassified|tertiary|secondary|primary|corridor|platform|track|cycleway)$/;
  const key = (c) => c[0].toFixed(7) + "," + c[1].toFixed(7);
  const nodes = new Map(), adj = new Map();
  const addN = (c) => { const k = key(c); if (!nodes.has(k)) { nodes.set(k, c); adj.set(k, []); } return k; };
  for (const f of gj.features) {
    const p = f.properties, g = f.geometry;
    if (g.type !== "LineString" || !p.highway || !WALK.test(p.highway)) continue;
    if (p.access === "private" || p.access === "no" || p.foot === "no") continue;
    const cs = g.coordinates;
    for (let i = 1; i < cs.length; i++) { const a = addN(cs[i - 1]), b = addN(cs[i]), d = dist(cs[i - 1], cs[i]) * (p.highway === "steps" ? 1.4 : 1); adj.get(a).push([b, d]); adj.get(b).push([a, d]); }
  }
  const comp = new Map(); let best = null, bestSize = 0, cid = 0;
  for (const k of nodes.keys()) {
    if (comp.has(k)) continue; cid++; let size = 0; const st = [k]; comp.set(k, cid);
    while (st.length) { const u = st.pop(); size++; for (const [v] of adj.get(u)) if (!comp.has(v)) { comp.set(v, cid); st.push(v); } }
    if (size > bestSize) { bestSize = size; best = cid; }
  }
  const snap = (pt) => { let bk = null, bd = Infinity; for (const [k, c] of nodes) if (comp.get(k) === best) { const d = dist(c, pt); if (d < bd) { bd = d; bk = k; } } return bk; };
  function dijkstra(s, t) {
    const D = new Map([[s, 0]]), P = new Map(), H = [[0, s]], done = new Set();
    const push = (x) => { H.push(x); let i = H.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (H[j][0] <= H[i][0]) break; [H[i], H[j]] = [H[j], H[i]]; i = j; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[i], H[m]] = [H[m], H[i]]; i = m; } } return top; };
    while (H.length) { const [d, u] = pop(); if (done.has(u)) continue; done.add(u); if (u === t) break;
      for (const [v, w] of adj.get(u)) { const nd = d + w; if (nd < (D.get(v) ?? Infinity)) { D.set(v, nd); P.set(v, u); push([nd, v]); } } }
    if (!D.has(t)) return null;
    const path = [t]; while (path[0] !== s) path.unshift(P.get(path[0])); return path.map((k) => nodes.get(k));
  }
  const startPt = [CFG.start.lon, CFG.start.lat], destPt = [CFG.dest.lon, CFG.dest.lat];
  let route = dijkstra(snap(startPt), snap(destPt));
  if (!route) { $("#r-now").textContent = "Percorso non disponibile"; return; }
  route = [startPt, ...route, destPt];
  const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + dist(route[i - 1], route[i]));
  const total = cum[cum.length - 1], mins = Math.max(1, Math.round(total / (CFG.walkSpeedKmh * 1000 / 60)));

  // ---------- Indicazioni ----------
  const brg = (a, b) => Math.atan2((b[0] - a[0]) * Math.cos(a[1] * rad), b[1] - a[1]) / rad;
  const steps = [{ at: 0, dir: "up", txt: "Esci dalla metro e prosegui verso il porto" }];
  let lastAt = 0;
  for (let i = 1; i < route.length - 1; i++) {
    if (dist(route[i - 1], route[i]) < 4) continue;
    let j = i + 1; while (j < route.length - 1 && dist(route[i], route[j]) < 12) j++;
    let dA = brg(route[i], route[j]) - brg(route[i - 1], route[i]); dA = ((dA + 540) % 360) - 180;
    if (Math.abs(dA) > 40 && cum[i] - lastAt > 25) { steps.push({ at: cum[i] - 15, dir: dA > 0 ? "right" : "left", txt: `Tra poco gira a ${dA > 0 ? "destra" : "sinistra"}` }); lastAt = cum[i]; }
  }
  steps.push({ at: total - 25, dir: "up", txt: `Il ${CFG.dest.name} è davanti a te` });
  steps.push({ at: total, dir: "done", txt: `Sei al ${CFG.dest.name}: mostra la carta d'imbarco`, last: true });
  const stepAt = (m) => { let k = 0; for (let i = 0; i < steps.length; i++) if (m >= steps[i].at) k = i; return k; };
  const setNow = (k, m) => {
    const s = steps[k]; $("#r-now").textContent = s.txt; $("#r-ico").innerHTML = ICON[s.dir]; $("#r-ico").classList.toggle("done", s.dir === "done");
    $("#r-steps").innerHTML = steps.map((x, i) => `<li class="${x.last ? "last " : ""}${i === k ? "now" : i < k ? "done" : ""}"><span>${i + 1}</span>${x.txt}</li>`).join("");
  };
  $("#r-now").textContent = `A piedi fino al ${CFG.dest.name}`;
  $("#r-sub").textContent = `${Math.round(total / 10) * 10} m da ${CFG.start.name} · camminamenti reali`;
  $("#r-badge").textContent = `${mins} min`;
  $("#r-steps").innerHTML = steps.map((x, i) => `<li class="${x.last ? "last" : ""}"><span>${i + 1}</span>${x.txt}</li>`).join("");

  // ---------- Percorso e indicatori ----------
  viewer.entities.add({ polyline: { positions: pos(route), width: 12, clampToGround: true,
    material: new C.PolylineOutlineMaterialProperty({ color: col("#0E7BC4"), outlineColor: C.Color.WHITE, outlineWidth: 3 }) } });
  const tag = (pt, text, bg, fg, h, near) => viewer.entities.add({ position: C.Cartesian3.fromDegrees(pt[0], pt[1], h),
    label: { text, font: "700 13px Inter, sans-serif", fillColor: col(fg), showBackground: true, backgroundColor: col(bg), backgroundPadding: new C.Cartesian2(9, 6),
      verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: near ? new C.DistanceDisplayCondition(0, near) : undefined } });
  // partenza
  viewer.entities.add({ position: C.Cartesian3.fromDegrees(startPt[0], startPt[1], 1), point: { pixelSize: 14, color: col("#0A1A33"), outlineColor: C.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
  tag(startPt, "M  " + CFG.start.name, "#0A1A33", "#FFFFFF", 14);
  // altri pontili
  for (const d of CFG.docks) {
    viewer.entities.add({ position: C.Cartesian3.fromDegrees(d.lon, d.lat, 2), point: { pixelSize: 8, color: C.Color.WHITE, outlineColor: col("#4E5D73"), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: new C.DistanceDisplayCondition(0, 350) } });
    tag([d.lon, d.lat], d.name.replace("Pontile ", "P"), "#FFFFFF", "#4E5D73", 6, 140);
  }
  // Molo B: colonna gialla + etichetta
  viewer.entities.add({ position: C.Cartesian3.fromDegrees(destPt[0], destPt[1], 14), cylinder: { length: 28, topRadius: 0, bottomRadius: 5, material: col("#F2B33D", .9) } });
  viewer.entities.add({ position: C.Cartesian3.fromDegrees(destPt[0], destPt[1], 0.5), ellipse: { semiMajorAxis: 14, semiMinorAxis: 14, height: 0.5, material: col("#F2B33D", .35) } });
  tag(destPt, "MOLO B · Procida 10:40", "#F2B33D", "#0A1A33", 32);
  $("#t-bld").addEventListener("change", (e) => buildings.forEach((x) => (x.show = e.target.checked)));

  // ---------- Camera ----------
  const routeSphere = C.BoundingSphere.fromPoints(pos(route));
  const overview = (dur = 1.4) => {
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    const c = C.Cartographic.fromCartesian(routeSphere.center);
    const target = new C.BoundingSphere(C.Cartesian3.fromRadians(c.longitude, c.latitude - 0.00065 * rad * 1, 0), routeSphere.radius);
    viewer.camera.flyToBoundingSphere(target, { offset: new C.HeadingPitchRange(C.Math.toRadians(345), C.Math.toRadians(-48), routeSphere.radius * 4.2), duration: dur });
  };
  overview(0);

  // ---------- Guida simulata ----------
  const walker = viewer.entities.add({ position: C.Cartesian3.fromDegrees(startPt[0], startPt[1], 2),
    point: { pixelSize: 18, color: col("#0E7BC4"), outlineColor: C.Color.WHITE, outlineWidth: 4, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: { text: "Tu", font: "700 12px Inter, sans-serif", fillColor: C.Color.WHITE, showBackground: true, backgroundColor: col("#0E7BC4"),
      pixelOffset: new C.Cartesian2(0, 24), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
  const at = (m) => { let i = 1; while (i < cum.length - 1 && cum[i] < m) i++; const a = route[i - 1], b = route[i], seg = cum[i] - cum[i - 1] || 1, t = Math.min(1, Math.max(0, (m - cum[i - 1]) / seg)); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const ahead = (m) => { const a = at(m), b = at(Math.min(total, m + 30)); return dist(a, b) > 1 ? brg(a, b) : null; };
  let raf = null, t0 = 0, head = 200, lastK = -1;
  function tick(ts) {
    if (!t0) t0 = ts;
    const k = Math.min(1, (ts - t0) / (CFG.demoSeconds * 1000)), m = k * total, [lon, lat] = at(m);
    const p = C.Cartesian3.fromDegrees(lon, lat, 2); walker.position = p;
    const h = ahead(m); if (h !== null) { let d = ((h - head + 540) % 360) - 180; head += d * 0.05; }
    viewer.camera.lookAt(p, new C.HeadingPitchRange(C.Math.toRadians(head), C.Math.toRadians(-32), 110));
    $("#r-bar").style.width = (k * 100).toFixed(1) + "%";
    $("#r-badge").textContent = k < 1 ? `${Math.max(0, Math.round((total - m) / 10) * 10)} m` : "Arrivo";
    const sk = stepAt(m); if (sk !== lastK) { lastK = sk; setNow(sk, m); }
    if (k < 1) raf = requestAnimationFrame(tick);
    else { raf = null; $("#b-go").textContent = "Rivedi"; $("#b-in").hidden = false; $("#r-sub").textContent = "Ora prosegui dentro il terminal con la guida AR"; toast(`Sei al ${CFG.dest.name}`); }
  }
  $("#b-go").addEventListener("click", () => {
    cancelAnimationFrame(raf); t0 = 0; lastK = -1; head = 200; $("#b-in").hidden = true; $("#b-go").textContent = "Guida in corso…";
    raf = requestAnimationFrame(tick);
  });
  window.N360route = { route, cum, total, dist, brg };
  $("#b-view").addEventListener("click", () => { cancelAnimationFrame(raf); raf = null; $("#b-go").textContent = "Avvia la guida"; overview(); });
})();
