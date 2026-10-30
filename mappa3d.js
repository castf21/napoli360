/* NAPOLI 360 · Mappa 3D della città: luoghi reali (coordinate OpenStreetMap, vedi data/poi.json) su CesiumJS */
(async function () {
  const C = Cesium, CFG = window.N360, $ = (s) => document.querySelector(s);
  const col = (h, a = 1) => C.Color.fromCssColorString(h).withAlpha(a);
  const CAT = { porto: ["Porto", "#0E7BC4"], cultura: ["Cultura", "#B07A1A"], eventi: ["Eventi", "#D94A39"], mobilita: ["Mobilità", "#13704C"] };
  // [nome, categoria, lat, lon, quota stimata del suolo (m), descrizione]
  const P = [
    ["Molo Beverello", "porto", 40.8373523, 14.25475, 2, "Aliscafi e traghetti per Capri, Ischia e Procida · Stazione marittima del 2024", true],
    ["Molo Angioino · crociere", "porto", 40.8376704, 14.2572892, 2, "Terminal delle navi da crociera, accanto alla Stazione Marittima"],
    ["Museo Archeologico Nazionale", "cultura", 40.8536, 14.2505, 40, "Collezione Farnese e i tesori di Pompei ed Ercolano"],
    ["Cappella Sansevero", "cultura", 40.849305, 14.254919, 25, "Il Cristo velato di Giuseppe Sanmartino"],
    ["Museo di Capodimonte", "cultura", 40.867031, 14.250584, 150, "Reggia e pinacoteca nel Real Bosco"],
    ["Castel Nuovo · Maschio Angioino", "cultura", 40.838308, 14.253294, 5, "Castello del XIII secolo, a due passi dal Beverello"],
    ["Teatro di San Carlo", "cultura", 40.837349, 14.249803, 10, "Dal 1737, il più antico teatro d'opera attivo d'Europa"],
    ["Palazzo Reale", "cultura", 40.836465, 14.250569, 10, "Residenza dei re di Napoli su Piazza del Plebiscito"],
    ["Piazza del Plebiscito", "cultura", 40.835876, 14.248654, 10, "La piazza simbolo della città"],
    ["Galleria Umberto I", "cultura", 40.83851, 14.249349, 12, "Galleria ottocentesca in ferro e vetro"],
    ["Castel dell'Ovo", "cultura", 40.82775, 14.248053, 3, "Il castello più antico, sull'isolotto di Megaride"],
    ["Certosa di San Martino", "cultura", 40.843143, 14.24124, 230, "Museo e presepe Cuciniello sulla collina del Vomero"],
    ["Castel Sant'Elmo", "cultura", 40.84372, 14.239286, 250, "Fortezza stellata con vista sul golfo"],
    ["Duomo di Napoli", "cultura", 40.852653, 14.259773, 25, "Cattedrale di Santa Maria Assunta e Cappella di San Gennaro"],
    ["Via San Gregorio Armeno", "cultura", 40.850406, 14.257616, 25, "La strada dei presepi"],
    ["Napoli Sotterranea", "cultura", 40.851079, 14.256847, 25, "Cunicoli greco-romani sotto il centro storico"],
    ["Palapartenope", "eventi", 40.820641, 14.177482, 15, "Concerti e spettacoli · Elodie il 4 maggio 2027"],
    ["Stadio Maradona", "eventi", 40.827966, 14.192892, 15, "Concerti estivi 2027: Geolier, Ultimo, Achille Lauro…"],
    ["Arena Flegrea", "eventi", 40.825981, 14.185884, 15, "Tosca del Teatro di San Carlo a luglio 2027"],
    ["America's Cup · Race Village", "eventi", 40.831751, 14.230453, 2, "Rotonda Diaz, Via Caracciolo · 22 maggio – 19 luglio 2027"],
    ["Metro Municipio", "mobilita", 40.839393, 14.252836, 8, "Linea 1 · la fermata più vicina al Molo Beverello"],
    ["Metro Toledo", "mobilita", 40.842437, 14.248874, 15, "Linea 1 · una delle stazioni dell'arte"],
    ["Metro Dante", "mobilita", 40.848942, 14.25012, 25, "Linea 1 · centro storico"],
    ["Metro Museo", "mobilita", 40.853424, 14.251697, 40, "Linea 1 · Museo Archeologico Nazionale"],
    ["Montesanto", "mobilita", 40.847217, 14.245176, 30, "Cumana, Circumflegrea e funicolare"],
    ["Napoli Centrale · Garibaldi", "mobilita", 40.853024, 14.27314, 10, "Stazione ferroviaria e Linea 1"],
    ["Mergellina", "mobilita", 40.830597, 14.217367, 10, "Linea 2 e porticciolo"],
    ["Mostra · Stadio Maradona", "mobilita", 40.824337, 14.193656, 15, "Cumana e Linea 2 per stadio e Mostra d'Oltremare"]
  ];

  C.Ion.defaultAccessToken = undefined;
  const viewer = new C.Viewer("map", {
    baseLayer: new C.ImageryLayer(new C.UrlTemplateImageryProvider({ url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maximumLevel: 19, credit: "Immagini © Esri, Maxar, Earthstar Geographics" })),
    terrainProvider: new C.EllipsoidTerrainProvider(), baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false
  });
  const sc = viewer.scene;
  sc.skyAtmosphere.show = true; sc.fog.enabled = true; sc.highDynamicRange = false; sc.globe.baseColor = col("#D4E6F2");
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
  let H0 = 0;
  if (CFG.ionToken) {
    try {
      C.Ion.defaultAccessToken = CFG.ionToken;
      const ts = await C.Cesium3DTileset.fromIonAssetId(2275207, { showCreditsOnScreen: true, maximumScreenSpaceError: 16 });
      sc.primitives.add(ts); sc.globe.show = false; H0 = 47; document.body.classList.add("photo");
    } catch (e) { console.warn(e); }
  }

  let filter = "tutto", sel = null;
  // navi in tempo reale (AIS)
  const SH = window.N360Ships ? window.N360Ships(viewer, { h: H0, onUpdate: () => { if (filter === "navi") renderList(); } }) : null;
  function showShip(id) {
    const s = SH.info(id); sel = null;
    $("#p-cat").textContent = "Nave · AIS in tempo reale"; $("#p-cat").style.color = "#0E7BC4";
    $("#p-name").textContent = s.name;
    $("#p-desc").textContent = `${s.kind} · ${s.sog}${s.dest ? " · destinazione " + s.dest : ""}${s.eta ? " · arrivo stimato al Beverello tra ~" + s.eta + " min" : ""} · posizione di ${s.age} min fa`;
    $("#p-go").hidden = true; $("#p-route").hidden = true;
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(s.lon, s.lat, H0), 80), { offset: new C.HeadingPitchRange(0, C.Math.toRadians(-35), 1400), duration: 1.6 });
  }
  const ents = P.map((p, i) => {
    const [name, cat, lat, lon, z] = p, c = CAT[cat][1];
    return viewer.entities.add({ id: "p" + i, position: C.Cartesian3.fromDegrees(lon, lat, H0 + z + 25),
      point: { pixelSize: 11, color: col(c), outlineColor: C.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: name, font: "700 12px Inter, sans-serif", fillColor: C.Color.WHITE, showBackground: true, backgroundColor: col(c, .92), backgroundPadding: new C.Cartesian2(7, 4),
        pixelOffset: new C.Cartesian2(0, -16), verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new C.NearFarScalar(4000, 1, 14000, 0.45), scaleByDistance: new C.NearFarScalar(800, 1, 7000, 0.8) } });
  });

  const overview = (dur = 1.6) => viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(14.236, 40.786, H0 + 2300), orientation: { heading: C.Math.toRadians(8), pitch: C.Math.toRadians(-30), roll: 0 }, duration: dur });
  function select(i) {
    sel = i; const [name, cat, lat, lon, z, desc, port] = P[i];
    $("#p-cat").textContent = CAT[cat][0]; $("#p-cat").style.color = CAT[cat][1];
    $("#p-name").textContent = name; $("#p-desc").textContent = desc; $("#p-go").hidden = !port;
    const key = Object.keys(window.N360_PLACES || {}).find((k) => window.N360_PLACES[k].lat === lat && window.N360_PLACES[k].lon === lon);
    $("#p-route").hidden = port || !key || cat === "mobilita"; if (key) $("#p-route").href = "percorso.html?to=" + key + "&back=mappa3d.html";
    $$(".pbtn").forEach((b) => b.setAttribute("aria-current", String(+b.dataset.i === i)));
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(lon, lat, H0 + z), 60),
      { offset: new C.HeadingPitchRange(C.Math.toRadians(cat === "eventi" ? 20 : 0), C.Math.toRadians(-32), 520), duration: 1.6 });
  }
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  function renderList() {
    if (filter === "navi") {
      ents.forEach((e) => (e.show = false));
      if (!SH || !SH.ok) { $("#plist").innerHTML = '<span class="cap">Posizioni delle navi non ancora disponibili.</span>'; return; }
      const arr = SH.arrivals();
      $("#plist").innerHTML = (arr.length ? arr.map((x) => `<button class="pbtn" data-ship="${x.id}">⛴ ${x.name} · ~${x.eta}′</button>`).join("") : '<span class="cap">Nessuna nave diretta al Beverello in questo momento.</span>')
        + `<span class="cap" style="align-self:center;white-space:nowrap">· aggiornato alle ${SH.updated.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>`;
      return;
    }
    const items = P.map((p, i) => [p, i]).filter(([p]) => filter === "tutto" || p[1] === filter);
    $("#plist").innerHTML = items.map(([p, i]) => `<button class="pbtn" data-i="${i}" aria-current="${i === sel}">${p[0]}</button>`).join("");
    ents.forEach((e, i) => (e.show = filter === "tutto" || P[i][1] === filter));
  }
  $("#chips").innerHTML = [["tutto", "Tutto", "#0A1A33"], ...Object.entries(CAT).map(([k, v]) => [k, v[0], v[1]]), ["navi", "⛴ Navi live", "#0E7BC4"]]
    .map(([k, n, c]) => `<button class="chip" data-f="${k}" aria-pressed="${k === "tutto"}"><i style="background:${c}"></i>${n}</button>`).join("");
  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-f]"); if (f) { filter = f.dataset.f; $$(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === f))); renderList(); return; }
    const b = e.target.closest("[data-i]"); if (b) select(+b.dataset.i);
    const sh = e.target.closest("[data-ship]"); if (sh && SH) showShip(sh.dataset.ship);
  });
  viewer.selectedEntityChanged.addEventListener((en) => { if (en && /^p\d+$/.test(en.id)) select(+en.id.slice(1)); else if (en && SH && SH.isShip(en)) showShip(SH.idOf(en)); viewer.selectedEntity = undefined; });
  $("#p-all").addEventListener("click", () => overview());
  renderList(); overview(0);
  if (location.hash === "#porto") select(0);
})();
