/* NAPOLI 360 · Port Vision AI · Molo Beverello in 3D
   Esterno: dati OpenStreetMap + motore di routing pedonale (Dijkstra) dalla metro all'ingresso del terminal.
   Interno: pianta 3D indicativa costruita dentro la sagoma reale della Stazione marittima (OSM way/1326131662),
   con zone, varchi verso i pontili reali e cartelli riconosciuti lungo il percorso (approccio AutoMapping).
   3D: CesiumJS; se c'è il token Cesium ion, contesto fotorealistico Google Photorealistic 3D Tiles. */
(async function () {
  const C = Cesium, CFG = window.N360;
  const $ = (s) => document.querySelector(s);
  const toast = (m, ms = 2600) => { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), ms); };
  const col = (hex, a = 1) => C.Color.fromCssColorString(hex).withAlpha(a);
  const ICON = {
    up: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
    right: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20v-7a3 3 0 0 1 3-3h8"/><path d="m14 6 4 4-4 4"/></svg>',
    left: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 20v-7a3 3 0 0 0-3-3H6"/><path d="m10 6-4 4 4 4"/></svg>',
    sign: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="8" width="10" height="8" rx="1"/></svg>',
    door: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.6v16.2a1 1 0 0 1-1.2 1L5 20V5.6a2 2 0 0 1 1.6-2l4-.8A2 2 0 0 1 13 4.6Z"/></svg>',
    done: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
  };

  // ---------- Viewer ----------
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
  sc.screenSpaceCameraController.minimumZoomDistance = 15; sc.screenSpaceCameraController.maximumZoomDistance = 3000;
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);

  // ---------- Contesto fotorealistico (Cesium ion → Google Photorealistic 3D Tiles) ----------
  let PHOTO = false, H0 = 0, tileset = null;
  if (CFG.ionToken) {
    try {
      C.Ion.defaultAccessToken = CFG.ionToken;
      tileset = await C.Cesium3DTileset.fromIonAssetId(2275207, { showCreditsOnScreen: true, maximumScreenSpaceError: 12 });
      sc.primitives.add(tileset); sc.globe.show = false; PHOTO = true; H0 = 47; document.body.classList.add("photo");
      const probe = C.Cartographic.fromDegrees(CFG.dest.lon - 0.0003, CFG.dest.lat + 0.0003);
      const h = await Promise.race([sc.sampleHeightMostDetailed([probe]).then((r) => r[0].height), new Promise((r) => setTimeout(() => r(null), 8000))]);
      if (h && isFinite(h) && h > 20 && h < 90) H0 = h;
    } catch (e) { console.warn("3D fotorealistico non disponibile", e); tileset = null; toast("3D fotorealistico non disponibile: uso la mappa standard"); }
  }

  // ---------- Dati reali ----------
  let gj;
  try { gj = await (await fetch("data/beverello.geojson", { cache: "no-cache" })).json(); }
  catch (e) { $("#r-now").textContent = "Dati in aggiornamento"; $("#r-sub").textContent = "Riprova tra qualche minuto."; return; }
  const R = 6371000, rad = Math.PI / 180;
  const dist = (a, b) => { const x = (b[0] - a[0]) * rad * Math.cos((a[1] + b[1]) / 2 * rad), y = (b[1] - a[1]) * rad; return Math.sqrt(x * x + y * y) * R; };
  const brg = (a, b) => Math.atan2((b[0] - a[0]) * Math.cos(a[1] * rad), b[1] - a[1]) / rad;
  const P3 = (ll, h = 0) => C.Cartesian3.fromDegrees(ll[0], ll[1], h + H0);
  const pos = (ring, h = 0) => C.Cartesian3.fromDegreesArrayHeights(ring.flatMap((c) => [c[0], c[1], h + H0]));
  const num = (v) => { const n = parseFloat(String(v || "").replace(",", ".")); return isFinite(n) ? n : null; };
  const heightOf = (p) => num(p.height) || (num(p["building:levels"]) ? num(p["building:levels"]) * 3.4 : null) || (p.building === "roof" ? 6 : 12);
  const center = [CFG.dest.lon, CFG.dest.lat];
  const outdoorEnts = [], terminalEnts = [], indoorEnts = [];
  const addOut = (e) => (outdoorEnts.push(e), e), addIn = (e) => (e.show = false, indoorEnts.push(e), e);

  // edifici OSM (solo senza contesto fotorealistico)
  for (const f of gj.features) {
    const p = f.properties, g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
    if (!p.building || !polys || PHOTO) continue;
    const isTerm = p.osm === CFG.terminalOsm;
    const far = dist(polys[0][0][0], center) > 450;
    for (const pc of polys) {
      const e = viewer.entities.add({ polygon: { hierarchy: new C.PolygonHierarchy(pos(pc[0])), height: H0, extrudedHeight: H0 + heightOf(p),
        material: isTerm ? col("#3E9BE0", .55) : col("#FFFFFF", far ? .18 : .32), outline: false } });
      (isTerm ? terminalEnts : outdoorEnts).push(e);
    }
  }

  // ---------- Geometria del terminal (coordinate locali in metri) ----------
  const term = gj.features.find((f) => f.properties.osm === CFG.terminalOsm);
  const ringLL = term.geometry.coordinates[0];
  const lon0 = ringLL[0][0], lat0 = ringLL[0][1], kx = Math.cos(lat0 * rad) * 111320, ky = 110540;
  const toXY = (c) => [(c[0] - lon0) * kx, (c[1] - lat0) * ky], toLL = (p) => [lon0 + p[0] / kx, lat0 + p[1] / ky];
  const poly = ringLL.slice(0, -1).map(toXY);
  const Nv = poly.reduce((a, b) => (b[1] > a[1] ? b : a)), Sv = poly.reduce((a, b) => (b[1] < a[1] ? b : a));
  const AX = [Sv[0] - Nv[0], Sv[1] - Nv[1]], LEN = Math.hypot(AX[0], AX[1]), U = [AX[0] / LEN, AX[1] / LEN], NR = [-U[1], U[0]]; // NR = verso i pontili (est)
  const tOf = (p) => ((p[0] - Nv[0]) * U[0] + (p[1] - Nv[1]) * U[1]) / LEN;
  const add2 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s];
  function section(t) {
    const O = add2(Nv, U, t * LEN), ss = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const fa = (a[0] - O[0]) * U[0] + (a[1] - O[1]) * U[1], fb = (b[0] - O[0]) * U[0] + (b[1] - O[1]) * U[1];
      if ((fa <= 0 && fb > 0) || (fa > 0 && fb <= 0)) { const r = fa / (fa - fb), q = [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]; ss.push((q[0] - O[0]) * NR[0] + (q[1] - O[1]) * NR[1]); }
    }
    if (ss.length < 2) return null; ss.sort((x, y) => x - y);
    const s0 = ss[0], s1 = ss[ss.length - 1];
    return { O, s0, s1, w: s1 - s0, mid: add2(O, NR, (s0 + s1) / 2), west: add2(O, NR, s0), east: add2(O, NR, s1) };
  }
  function clip(P, g) {
    const out = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ga = g(a), gb = g(b);
      if (ga >= 0) out.push(a);
      if ((ga >= 0) !== (gb >= 0)) { const r = ga / (ga - gb); out.push([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]); }
    }
    return out;
  }
  const zonePoly = (t1, t2) => clip(clip(poly, (p) => tOf(p) - t1), (p) => t2 - tOf(p));
  const HEAD = Math.atan2(U[0], U[1]) / rad; // direzione dell'asse (verso sud)
  const orient = (ll, deg) => C.Transforms.headingPitchRollQuaternion(P3(ll), new C.HeadingPitchRoll(C.Math.toRadians(deg), 0, 0));

  // pontili reali (OSM) e varchi sul lato est
  const piers = gj.features.filter((f) => f.properties.amenity === "ferry_terminal" && /^Pier (6|7|8|9|10)$/.test(f.properties.name || ""))
    .map((f) => { const n = f.properties.name.replace("Pier ", ""), xy = toXY(f.geometry.coordinates); return { n, ll: f.geometry.coordinates, xy, t: Math.min(.95, Math.max(.05, tOf(xy))) }; })
    .sort((a, b) => a.t - b.t);
  const pierB = piers.find((p) => p.n === "9") || piers[Math.floor(piers.length / 2)];

  // ---------- Costruzione dell'interno ----------
  const ZONES = [
    { n: "Ingresso", t1: 0, t2: 0.1, c: "#D3DDE8" },
    { n: "Biglietterie", t1: 0.1, t2: 0.27, c: "#B9DAF2" },
    { n: "Sala d'attesa e varchi", t1: 0.27, t2: 0.72, c: "#F6DC9E" },
    { n: "Bar e servizi", t1: 0.72, t2: 0.87, c: "#E0CDAA" },
    { n: "Uscita sud", t1: 0.87, t2: 1, c: "#D3DDE8" }
  ];
  addIn(viewer.entities.add({ polygon: { hierarchy: new C.PolygonHierarchy(pos(poly.map(toLL))), height: H0 - 0.6, extrudedHeight: H0 + 0.02, material: col("#F3F1EC") } }));
  for (const z of ZONES) {
    const zp = zonePoly(z.t1 + 0.003, z.t2 - 0.003); if (zp.length < 3) continue;
    addIn(viewer.entities.add({ polygon: { hierarchy: new C.PolygonHierarchy(pos(zp.map(toLL))), height: H0 + 0.03, extrudedHeight: H0 + 0.12, material: col(z.c) } }));
    const s = section((z.t1 + z.t2) / 2);
    if (s) addIn(viewer.entities.add({ position: P3(toLL(add2(s.mid, NR, -s.w * 0.18)), 3.4), label: { text: z.n.toUpperCase(), font: "800 12px Inter, sans-serif", fillColor: col("#0A1A33"), outlineColor: C.Color.WHITE, outlineWidth: 4, style: C.LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: new C.DistanceDisplayCondition(0, 420) } }));
  }
  // pareti esterne vetrate
  addIn(viewer.entities.add({ wall: { positions: pos([...poly, poly[0]].map(toLL)), minimumHeights: Array(poly.length + 1).fill(H0), maximumHeights: Array(poly.length + 1).fill(H0 + 5),
    material: col("#7FC3EC", .38), outline: true, outlineColor: col("#5E9CC4", .9) } }));
  // tramezzi tra le zone, con passaggio centrale
  for (const z of ZONES.slice(1)) {
    const s = section(z.t1); if (!s) continue;
    const gap = Math.min(4, s.w * 0.3), m = (s.s0 + s.s1) / 2;
    for (const [a, b] of [[s.s0, m - gap / 2], [m + gap / 2, s.s1]]) if (b - a > 0.6)
      addIn(viewer.entities.add({ wall: { positions: pos([toLL(add2(s.O, NR, a)), toLL(add2(s.O, NR, b))]), minimumHeights: [H0, H0], maximumHeights: [H0 + 3, H0 + 3], material: col("#C6D0DB", .95) } }));
  }
  const box = (xy, dims, color, h0 = 0, rotDeg = HEAD) => addIn(viewer.entities.add({ position: P3(toLL(xy), h0 + dims[2] / 2), orientation: orient(toLL(xy), rotDeg),
    box: { dimensions: new C.Cartesian3(dims[0], dims[1], dims[2]), material: col(color) } }));
  const tagIn = (xy, text, bg, fg, h = 4, near = 260) => addIn(viewer.entities.add({ position: P3(toLL(xy), h), label: { text, font: "700 12px Inter, sans-serif", fillColor: col(fg), showBackground: true, backgroundColor: col(bg), backgroundPadding: new C.Cartesian2(8, 5), verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: new C.DistanceDisplayCondition(0, near) } }));
  // biglietterie (lato ovest)
  for (const t of [0.13, 0.17, 0.21, 0.25]) { const s = section(t); if (s) box(add2(s.west, NR, 1.6), [1.0, 3.2, 1.1], "#0A1A33"); }
  { const s = section(0.19); if (s) tagIn(add2(s.west, NR, 2), "Biglietterie aliscafi", "#0A1A33", "#FFFFFF", 3.2); }
  // tabellone partenze
  const sTab = section(0.29); if (sTab) { box(sTab.mid, [0.3, 4.2, 1.6], "#11161F", 2.2); tagIn(sTab.mid, "PARTENZE · 10:40 Procida → Molo B", "#11161F", "#F2B33D", 4.6, 320); }
  // file di sedute
  for (let t = 0.34; t <= 0.66; t += 0.045) { const s = section(t); if (!s) continue; for (const o of [-0.22, 0.02]) box(add2(s.mid, NR, s.w * o), [4.2, 0.7, 0.5], "#3E4A5C"); }
  // bar e servizi
  { const s = section(0.79); if (s) { box(add2(s.west, NR, 1.6), [1.0, 6, 1.1], "#7A5C25"); tagIn(add2(s.west, NR, 2), "Bar · servizi", "#FFFFFF", "#4E5D73", 3); } }
  // varchi verso i pontili (lato est)
  const gates = piers.map((p) => {
    const s = section(p.t); if (!s) return null;
    const isB = p === pierB, inner = add2(s.east, NR, -1.2), outer = add2(s.east, NR, 2.5);
    box(add2(s.east, NR, -0.4), [3, 0.5, 2.6], isB ? "#F2B33D" : "#8FA2B8");
    tagIn(add2(s.east, NR, -0.6), isB ? "VARCO MOLO B · pontile 9" : "Varco pontile " + p.n, isB ? "#F2B33D" : "#FFFFFF", isB ? "#0A1A33" : "#4E5D73", 3.4, isB ? 600 : 110);
    return { ...p, inner, outer, s };
  }).filter(Boolean);
  const gateB = gates.find((g) => g.n === pierB.n);

  // ---------- Esterno: routing pedonale dalla metro all'ingresso nord del terminal ----------
  const WALK = /^(footway|pedestrian|path|steps|living_street|service|residential|unclassified|tertiary|secondary|primary|platform|track|cycleway)$/;
  const key = (c) => c[0].toFixed(7) + "," + c[1].toFixed(7);
  const nodes = new Map(), adj = new Map();
  const addN = (c) => { const k = key(c); if (!nodes.has(k)) { nodes.set(k, c); adj.set(k, []); } return k; };
  for (const f of gj.features) {
    const p = f.properties, g = f.geometry;
    if (g.type !== "LineString" || !p.highway || !WALK.test(p.highway) || p.indoor === "yes") continue;
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
  const entranceOut = toLL(add2(Nv, U, -5));
  const startPt = [CFG.start.lon, CFG.start.lat];
  let outRoute = dijkstra(snap(startPt), snap(entranceOut));
  if (!outRoute) { $("#r-now").textContent = "Percorso non disponibile"; return; }
  outRoute = [startPt, ...outRoute, entranceOut];

  // percorso interno: ingresso → biglietterie → tabellone → sala → varco B → pontile 9
  const inXY = [add2(Nv, U, -5), section(0.04).mid, section(0.12).mid, section(0.2).mid, sTab ? add2(sTab.mid, NR, -2.5) : section(0.29).mid];
  for (let t = 0.33; t < gateB.t - 0.02; t += 0.04) inXY.push(add2(section(t).mid, NR, section(t).w * 0.12));
  inXY.push(add2(gateB.s.mid, NR, gateB.s.w * 0.15), gateB.inner, gateB.outer, pierB.xy);
  const inRoute = inXY.map(toLL);

  const mkRoute = (r) => { const cum = [0]; for (let i = 1; i < r.length; i++) cum.push(cum[i - 1] + dist(r[i - 1], r[i])); return { r, cum, total: cum[cum.length - 1] }; };
  const OUT = mkRoute(outRoute), IN = mkRoute(inRoute);
  const mOf = (RT, ll) => { let bi = 0, bd = Infinity; RT.r.forEach((p, i) => { const d = dist(p, ll); if (d < bd) { bd = d; bi = i; } }); return RT.cum[bi]; };

  // indicazioni esterne
  const outSteps = [{ at: 0, dir: "up", txt: "Esci dalla metro e prosegui verso il porto" }];
  { let lastAt = 0; const r = OUT.r, cum = OUT.cum;
    for (let i = 1; i < r.length - 1; i++) {
      if (dist(r[i - 1], r[i]) < 4) continue;
      let j = i + 1; while (j < r.length - 1 && dist(r[i], r[j]) < 12) j++;
      let dA = brg(r[i], r[j]) - brg(r[i - 1], r[i]); dA = ((dA + 540) % 360) - 180;
      if (Math.abs(dA) > 40 && cum[i] - lastAt > 25) { outSteps.push({ at: Math.max(0, cum[i] - 15), dir: dA > 0 ? "right" : "left", txt: `Tra poco gira a ${dA > 0 ? "destra" : "sinistra"}` }); lastAt = cum[i]; }
    } }
  outSteps.push({ at: OUT.total - 20, dir: "door", txt: "L'ingresso della Stazione marittima è davanti a te" });
  outSteps.push({ at: OUT.total, dir: "done", txt: "Sei all'ingresso del terminal", last: true });
  // indicazioni interne (con cartelli riconosciuti)
  const mBig = mOf(IN, toLL(section(0.18).mid)), mTab = mOf(IN, toLL(sTab ? sTab.mid : section(0.29).mid)), mGate = mOf(IN, toLL(gateB.inner));
  const inSteps = [
    { at: 0, dir: "door", txt: "Entra dall'ingresso nord della Stazione marittima" },
    { at: mBig - 14, dir: "sign", txt: "Cartello «Biglietterie» riconosciuto: posizione aggiornata", sign: "Biglietterie" },
    { at: mBig + 4, dir: "up", txt: "Hai già il biglietto: prosegui dritto" },
    { at: mTab - 8, dir: "sign", txt: "Tabellone riconosciuto: Procida 10:40 · Molo B", sign: "Tabellone partenze" },
    ...(mGate - mTab > 40 ? [{ at: mTab + 6, dir: "up", txt: "Attraversa la sala d'attesa" }] : []),
    { at: mGate - 16, dir: "left", txt: "Varco del Molo B sulla sinistra: segui il giallo", sign: "Varco Molo B" },
    { at: IN.total - 6, dir: "up", txt: "Esci sul pontile 9" },
    { at: IN.total, dir: "done", txt: "Sei al Molo B: mostra la carta d'imbarco", last: true }
  ].sort((a, b) => a.at - b.at);
  // cartelli riconosciuti (marcatori AutoMapping)
  [[toLL(add2(section(0.19).west, NR, 0.6)), 3], [toLL(sTab ? sTab.mid : section(0.29).mid), 3.2], [toLL(add2(gateB.s.east, NR, -0.3)), 3.1]]
    .forEach(([ll, h]) => addIn(viewer.entities.add({ position: P3(ll, h), point: { pixelSize: 14, color: col("#2EA6FF"), outlineColor: C.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY } })));

  // ---------- Disegno percorsi e indicatori ----------
  const routeLine = (RT, indoor) => (indoor ? addIn : addOut)(viewer.entities.add({ polyline: { positions: pos(RT.r, indoor ? 0.25 : 0), width: indoor ? 10 : 12, clampToGround: !indoor, classificationType: C.ClassificationType.BOTH,
    material: new C.PolylineOutlineMaterialProperty({ color: col("#0E7BC4"), outlineColor: C.Color.WHITE, outlineWidth: 3 }) } }));
  routeLine(OUT, false); routeLine(IN, true);
  const tag = (ll, text, bg, fg, h, near) => viewer.entities.add({ position: P3(ll, h),
    label: { text, font: "700 13px Inter, sans-serif", fillColor: col(fg), showBackground: true, backgroundColor: col(bg), backgroundPadding: new C.Cartesian2(9, 6),
      verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: near ? new C.DistanceDisplayCondition(0, near) : undefined } });
  addOut(viewer.entities.add({ position: P3(startPt, 1), point: { pixelSize: 14, color: col("#0A1A33"), outlineColor: C.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
  addOut(tag(startPt, "M  " + CFG.start.name, "#0A1A33", "#FFFFFF", 14));
  addOut(tag(entranceOut, "Ingresso terminal", "#FFFFFF", "#0B6AA9", 10));
  addOut(viewer.entities.add({ position: P3(pierB.ll, 16), cylinder: { length: 28, topRadius: 0, bottomRadius: 5, material: col("#F2B33D", .9) } }));
  viewer.entities.add({ position: P3(pierB.ll, 34), label: { text: "MOLO B · Procida 10:40", font: "700 13px Inter, sans-serif", fillColor: col("#0A1A33"), showBackground: true, backgroundColor: col("#F2B33D"), backgroundPadding: new C.Cartesian2(9, 6), verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY } });

  // ---------- Stato e interfaccia ----------
  let mode = "out", RT = OUT, STEPS = outSteps;
  const stepAt = (m) => { let k = 0; for (let i = 0; i < STEPS.length; i++) if (m >= STEPS[i].at) k = i; return k; };
  const setNow = (k) => {
    const s = STEPS[k]; $("#r-now").textContent = s.txt; $("#r-ico").innerHTML = ICON[s.dir]; $("#r-ico").classList.toggle("done", s.dir === "done");
    $("#r-steps").innerHTML = STEPS.map((x, i) => `<li class="${x.last ? "last " : ""}${i === k ? "now" : i < k ? "done" : ""}"><span>${i + 1}</span>${x.txt}</li>`).join("");
    if (s.sign) toast("Cartello riconosciuto: " + s.sign + " · posizione aggiornata", 2200);
  };
  const minsOf = (m) => Math.max(1, Math.round(m / (CFG.walkSpeedKmh * 1000 / 60)));
  function intro() {
    $("#r-ico").innerHTML = ICON[mode === "out" ? "up" : "door"]; $("#r-ico").classList.remove("done");
    $("#r-now").textContent = mode === "out" ? "A piedi fino al terminal" : "Dentro il terminal fino al Molo B";
    $("#r-sub").textContent = mode === "out" ? `${Math.round(OUT.total / 10) * 10} m da ${CFG.start.name} · camminamenti reali OSM` : `${Math.round(IN.total / 5) * 5} m · biglietterie, sala d'attesa, varco giallo`;
    $("#r-badge").textContent = `${minsOf(RT.total)} min`; $("#r-bar").style.width = "0%";
    $("#r-steps").innerHTML = STEPS.map((x, i) => `<li class="${x.last ? "last" : ""}"><span>${i + 1}</span>${x.txt}</li>`).join("");
    $("#b-go").textContent = mode === "out" ? "Simula il percorso" : "Simula il percorso interno";
    $("#b-in").textContent = mode === "out" ? "Entra nel terminal" : "Torna all'esterno";
    $("#b-in").hidden = false; $("#modechip").textContent = mode === "out" ? "Esterno · dalla metro al terminal" : "Interno · Stazione marittima (pianta indicativa)";
    $("#lg-sign").hidden = mode === "out";
  }

  // ---------- Camera ----------
  function overview(dur = 1.4) {
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    if (mode === "out") {
      const s = C.BoundingSphere.fromPoints(pos(OUT.r)), c = C.Cartographic.fromCartesian(s.center);
      viewer.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromRadians(c.longitude, c.latitude - 0.00065 * rad, H0), s.radius),
        { offset: new C.HeadingPitchRange(C.Math.toRadians(345), C.Math.toRadians(-48), s.radius * 4.2), duration: dur });
    } else {
      const ctr = toLL(add2(section(0.36).mid, NR, 6));
      viewer.camera.flyToBoundingSphere(new C.BoundingSphere(P3(ctr), 60),
        { offset: new C.HeadingPitchRange(C.Math.toRadians(HEAD + 15), C.Math.toRadians(-58), 150), duration: dur });
    }
  }

  // ---------- Modalità interno: taglio del modello fotorealistico sul terminal ----------
  let clipping = null;
  if (tileset) {
    try {
      if (C.ClippingPolygonCollection && C.ClippingPolygonCollection.isSupported(sc)) {
        const grow = poly.map((p) => { const s = section(Math.min(.999, Math.max(.001, tOf(p)))); const m = s ? s.mid : p; const d = [p[0] - m[0], p[1] - m[1]], L = Math.hypot(d[0], d[1]) || 1; return add2(p, [d[0] / L, d[1] / L], 1.5); });
        clipping = new C.ClippingPolygonCollection({ polygons: [new C.ClippingPolygon({ positions: pos(grow.map(toLL)) })], enabled: false });
        tileset.clippingPolygons = clipping;
      }
    } catch (e) { clipping = null; }
  }

  // ---------- Guida simulata ----------
  const walker = viewer.entities.add({ position: P3(OUT.r[0], 2),
    point: { pixelSize: 18, color: col("#0E7BC4"), outlineColor: C.Color.WHITE, outlineWidth: 4, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: { text: "Tu", font: "700 12px Inter, sans-serif", fillColor: C.Color.WHITE, showBackground: true, backgroundColor: col("#0E7BC4"), pixelOffset: new C.Cartesian2(0, 24), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
  const at = (m) => { const { r, cum } = RT; let i = 1; while (i < cum.length - 1 && cum[i] < m) i++; const a = r[i - 1], b = r[i], t = Math.min(1, Math.max(0, (m - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1))); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const ahead = (m) => { const a = at(m), b = at(Math.min(RT.total, m + (mode === "out" ? 30 : 12))); return dist(a, b) > 0.5 ? brg(a, b) : null; };
  let raf = null, t0 = 0, head = 200, lastK = -1;
  function setMode(m) {
    cancelAnimationFrame(raf); raf = null;
    mode = m; RT = m === "out" ? OUT : IN; STEPS = m === "out" ? outSteps : inSteps;
    indoorEnts.forEach((e) => (e.show = m === "in")); terminalEnts.forEach((e) => (e.show = m === "out"));
    outdoorEnts.forEach((e) => { if (!e.polygon) e.show = m === "out"; });
    if (tileset) { if (clipping) clipping.enabled = m === "in"; else { tileset.show = m === "out"; sc.globe.show = m === "in"; } }
    walker.position = P3(RT.r[0], 2); intro(); overview();
  }
  function tick(ts) {
    if (!t0) t0 = ts;
    const dur = mode === "out" ? CFG.demoSeconds : 26;
    const k = Math.min(1, (ts - t0) / (dur * 1000)), m = k * RT.total, ll = at(m);
    const p = P3(ll, mode === "out" ? 2 : 1.2); walker.position = p;
    const h = ahead(m); if (h !== null) { const d = ((h - head + 540) % 360) - 180; head += d * (mode === "out" ? 0.05 : 0.08); }
    viewer.camera.lookAt(p, new C.HeadingPitchRange(C.Math.toRadians(head), C.Math.toRadians(mode === "out" ? -32 : -38), mode === "out" ? 110 : 34));
    $("#r-bar").style.width = (k * 100).toFixed(1) + "%";
    $("#r-badge").textContent = k < 1 ? `${Math.max(0, Math.round((RT.total - m) / 5) * 5)} m` : "Arrivo";
    const sk = stepAt(m); if (sk !== lastK) { lastK = sk; setNow(sk); }
    if (k < 1) { raf = requestAnimationFrame(tick); return; }
    raf = null; $("#b-go").textContent = "Rivedi";
    if (mode === "out") { $("#b-in").hidden = false; $("#r-sub").textContent = "Prosegui all'interno: biglietterie, sala d'attesa e varco del Molo B"; }
    else toast("Sei al Molo B: buon viaggio a Procida!");
  }
  $("#b-go").addEventListener("click", () => { cancelAnimationFrame(raf); t0 = 0; lastK = -1; head = brg(RT.r[0], RT.r[Math.min(3, RT.r.length - 1)]); $("#b-go").textContent = "Guida in corso…"; raf = requestAnimationFrame(tick); });
  $("#b-view").addEventListener("click", () => { cancelAnimationFrame(raf); raf = null; $("#b-go").textContent = mode === "out" ? "Simula il percorso" : "Simula il percorso interno"; overview(); });
  $("#b-in").addEventListener("click", () => setMode(mode === "out" ? "in" : "out"));
  $("#t-bld")?.addEventListener("change", (e) => outdoorEnts.forEach((x) => { if (x.polygon) x.show = e.target.checked; }));
  if (PHOTO && $(".tgl")) $(".tgl").hidden = true;

  intro(); overview(0);
  if (location.hash === "#interno") setMode("in");
})();
