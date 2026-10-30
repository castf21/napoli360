/* NAPOLI 360 · Navi in tempo reale nel Golfo (AIS via aisstream.io, istantanea aggiornata ~ogni 10 minuti da GitHub Actions) */
window.N360Ships = function (viewer, opt = {}) {
  const C = Cesium, URL = "https://raw.githubusercontent.com/castf21/napoli360/live/ships.json";
  const BEV = [14.25475, 40.8373523], rad = Math.PI / 180;
  const dist = (a, b) => { const x = (b[0] - a[0]) * rad * Math.cos((a[1] + b[1]) / 2 * rad), y = (b[1] - a[1]) * rad; return Math.sqrt(x * x + y * y) * 6371000; };
  const brg = (a, b) => (Math.atan2((b[0] - a[0]) * Math.cos(a[1] * rad), b[1] - a[1]) / rad + 360) % 360;
  const FERRY = /SNAV|CAREMAR|ALILAURO|NLG|MEDMAR|GESCAB|LAURO|NAVIGAZIONE LIBERA|CAPRI|ISCHIA|PROCIDA|SORRENTO|JET|FAST|MAZZELLA|DELCOMAR|TOPLINE/i;
  function kind(st, name) {
    const t = st && st.type;
    if (t >= 40 && t <= 49) return ["Aliscafo / mezzo veloce", "#0E7BC4", true];
    if (t >= 60 && t <= 69) return ["Traghetto / passeggeri", "#0E7BC4", true];
    if (!t && FERRY.test(name || "")) return ["Probabile mezzo passeggeri", "#0E7BC4", true];
    if (t >= 70 && t <= 89) return ["Nave mercantile", "#7F8C8D", false];
    if (t === 36 || t === 37) return ["Vela / diporto", "#16A085", false];
    if (t === 30) return ["Pesca", "#B07A1A", false];
    if (t === 31 || t === 32 || t === 52) return ["Rimorchiatore", "#7F8C8D", false];
    return ["Imbarcazione", "#95A5A6", false];
  }
  const ds = new C.CustomDataSource("navi"); viewer.dataSources.add(ds);
  let data = null, onlyFerries = !!opt.onlyFerries;
  function eta(s) {
    if (!s.sog || s.sog < 3 || s.cog == null) return null;
    const p = [s.lon, s.lat], d = dist(p, BEV); if (d > 45000 || d < 400) return null;
    let diff = Math.abs(((brg(p, BEV) - s.cog + 540) % 360) - 180); if (diff > 30) return null;
    return Math.round(d / (s.sog * 0.5144) / 60);
  }
  function info(id) {
    const s = data.ships[id], st = data.static[id] || {}, name = st.n || "MMSI " + id, [k] = kind(st, name), e = eta(s);
    const age = Math.round((Date.now() - Date.parse(s.t)) / 60000);
    return { id, name, kind: k, sog: s.sog != null ? s.sog.toFixed(1) + " nodi" : "—", dest: st.dest || "", eta: e, age, lat: s.lat, lon: s.lon };
  }
  function render() {
    ds.entities.removeAll(); if (!data) return;
    for (const [id, s] of Object.entries(data.ships)) {
      const st = data.static[id] || {}, name = st.n || "", [k, col, ferry] = kind(st, name);
      if (onlyFerries && !ferry) continue;
      const moving = s.sog != null && s.sog > 1.5, e = eta(s);
      ds.entities.add({ id: "ship-" + id, position: C.Cartesian3.fromDegrees(s.lon, s.lat, (opt.h || 0) + 2),
        point: { pixelSize: ferry ? 13 : 8, color: C.Color.fromCssColorString(col), outlineColor: C.Color.WHITE, outlineWidth: ferry ? 3 : 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: ferry || moving ? { text: (ferry ? "⛴ " : "") + (name || "nave") + (e ? ` · Beverello ~${e}′` : ""), font: "700 11.5px Inter, sans-serif", fillColor: C.Color.WHITE, showBackground: true,
          backgroundColor: C.Color.fromCssColorString(col).withAlpha(.9), backgroundPadding: new C.Cartesian2(6, 3), pixelOffset: new C.Cartesian2(0, -14), verticalOrigin: C.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: new C.DistanceDisplayCondition(0, ferry ? 60000 : 12000) } : undefined });
    }
    if (opt.onUpdate) opt.onUpdate(api);
  }
  async function load() {
    try { const r = await fetch(URL + "?t=" + Math.floor(Date.now() / 60000), { cache: "no-store" }); if (!r.ok) throw 0; data = await r.json(); render(); }
    catch (e) { data = null; if (opt.onUpdate) opt.onUpdate(api); }
  }
  const api = {
    get ok() { return !!data; },
    get updated() { return data ? new Date(data.generated) : null; },
    count() { return data ? Object.keys(data.ships).filter((id) => kind(data.static[id], (data.static[id] || {}).n)[2]).length : 0; },
    show(v) { ds.show = v; }, setOnlyFerries(v) { onlyFerries = v; render(); },
    info, isShip: (en) => en && typeof en.id === "string" && en.id.startsWith("ship-"),
    idOf: (en) => en.id.slice(5),
    arrivals() { if (!data) return []; return Object.keys(data.ships).map(info).filter((x) => x.eta).sort((a, b) => a.eta - b.eta); }
  };
  load(); setInterval(load, 120000);
  return api;
};
