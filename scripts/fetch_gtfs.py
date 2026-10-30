"""Scarica i GTFS ufficiali di ANM e EAV e li riduce per il calcolo dei percorsi del prototipo NAPOLI 360.
- data/transit.json: metro, ferrovie (Cumana, Circumflegrea, Circumvesuviana), funicolari · prossimi 21 giorni
- data/bus.json: bus e tram ANM/EAV nell'area di Napoli · oggi e domani
Licenze: ANM (dati pubblicati su anm.it), EAV (Italian Open Data License 2.0, eavsrl.it/open-data)."""
import csv, io, json, os, sys, urllib.request, zipfile, datetime
FEEDS = [("A", "ANM", ["https://www.anm.it/google/google-transit.zip", "http://www.anm.it/google/google-transit.zip"]),
         ("E", "EAV", ["https://www.wimob.it/cfile/download.php?file=google-transit.zip"])]
BBOX = (40.74, 14.02, 40.97, 14.48)  # area metropolitana di Napoli (per i bus)
RAIL = {"0": False, "1": True, "2": True, "7": True, "12": True, "3": False, "11": False}
def tsec(t):
    h, m, s = (int(x) for x in t.strip().split(":")); return h * 3600 + m * 60 + s
def rows(z, name):
    if name not in z.namelist(): return []
    return csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig"))
def get(urls):
    for u in urls:
        try: return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 napoli360-prototipo"}), timeout=240).read()
        except Exception as e: print("errore", u, e, file=sys.stderr)
    return None
def main():
    today = datetime.date.today()
    out = {"rail": {"routes": {}, "stops": {}, "services": {}, "patterns": []}, "bus": {"routes": {}, "stops": {}, "services": {}, "patterns": []}}
    srcs = []
    for P, name, urls in FEEDS:
        data = get(urls)
        if not data: print("feed non disponibile", name); continue
        z = zipfile.ZipFile(io.BytesIO(data)); srcs.append(name)
        routes = {r["route_id"]: r for r in rows(z, "routes.txt")}
        cls = {rid: ("rail" if RAIL.get(r.get("route_type", "3").strip(), False) else "bus") for rid, r in routes.items()}
        win = {"rail": [today + datetime.timedelta(d) for d in range(21)], "bus": [today + datetime.timedelta(d) for d in range(2)]}
        act = {}
        cal = list(rows(z, "calendar.txt")); cdates = list(rows(z, "calendar_dates.txt"))
        alld = {d.strftime("%Y%m%d") for d in win["rail"]}
        for c in cal:
            a, b = datetime.datetime.strptime(c["start_date"], "%Y%m%d").date(), datetime.datetime.strptime(c["end_date"], "%Y%m%d").date()
            wd = [c["monday"], c["tuesday"], c["wednesday"], c["thursday"], c["friday"], c["saturday"], c["sunday"]]
            for d in win["rail"]:
                if a <= d <= b and wd[d.weekday()].strip() == "1": act.setdefault(c["service_id"], set()).add(d.strftime("%Y%m%d"))
        for c in cdates:
            if c["date"] in alld:
                if c["exception_type"].strip() == "1": act.setdefault(c["service_id"], set()).add(c["date"])
                else: act.get(c["service_id"], set()).discard(c["date"])
        busd = {d.strftime("%Y%m%d") for d in win["bus"]}
        trips = {}
        for t in rows(z, "trips.txt"):
            c = cls.get(t["route_id"]); ds = act.get(t["service_id"], set())
            if c and (ds if c == "rail" else ds & busd): trips[t["trip_id"]] = t
        st = {}
        for r in rows(z, "stop_times.txt"):
            if r["trip_id"] in trips:
                a = r["arrival_time"] or r["departure_time"]; d = r["departure_time"] or r["arrival_time"]
                if not a: continue
                st.setdefault(r["trip_id"], []).append((int(r["stop_sequence"]), r["stop_id"], tsec(a), tsec(d)))
        freq = {}
        for f in rows(z, "frequencies.txt"):
            if f["trip_id"] in trips: freq.setdefault(f["trip_id"], []).append((tsec(f["start_time"]), tsec(f["end_time"]), int(f["headway_secs"])))
        stops = {s["stop_id"]: s for s in rows(z, "stops.txt")}
        inb = lambda s: BBOX[0] <= float(stops[s]["stop_lat"]) <= BBOX[2] and BBOX[1] <= float(stops[s]["stop_lon"]) <= BBOX[3]
        pats = {}
        for tid, v in st.items():
            v.sort(); t = trips[tid]; c = cls[t["route_id"]]
            seq = tuple(s for _, s, _, _ in v)
            if c == "bus" and not any(s in stops and inb(s) for s in seq): continue
            k = (c, t["route_id"], seq); base = v[0][3]
            p = pats.setdefault(k, {"r": P + ":" + t["route_id"], "h": (t.get("trip_headsign") or "").strip(), "s": [P + ":" + s for s in seq], "o": [[a - base, d - base] for _, _, a, d in v], "t": []})
            starts = [base] if tid not in freq else [x for (s0, s1, h) in freq[tid] for x in range(s0, s1, h)]
            for x in starts: p["t"].append([P + ":" + t["service_id"], x])
            for s in seq:
                if s in stops: out[c]["stops"][P + ":" + s] = {"n": stops[s]["stop_name"].strip(), "lat": round(float(stops[s]["stop_lat"]), 6), "lon": round(float(stops[s]["stop_lon"]), 6)}
            out[c]["routes"][P + ":" + t["route_id"]] = {"s": (routes[t["route_id"]].get("route_short_name") or "").strip() or (routes[t["route_id"]].get("route_long_name") or "").strip()[:12],
                "l": (routes[t["route_id"]].get("route_long_name") or "").strip(), "c": (routes[t["route_id"]].get("route_color") or "").strip(), "type": routes[t["route_id"]]["route_type"].strip(), "a": name}
        for (c, _, _), p in pats.items():
            p["t"].sort(key=lambda x: x[1]); out[c]["patterns"].append(p)
            for sid, _ in p["t"]:
                ds = act.get(sid.split(":", 1)[1], set())
                out[c]["services"][sid] = sorted(ds if c == "rail" else ds & busd)
        print(name, "ok:", sum(1 for k in pats if k[0] == "rail"), "percorsi ferro/metro,", sum(1 for k in pats if k[0] == "bus"), "percorsi bus")
    if not srcs:
        os.makedirs("data", exist_ok=True); open("data/transit_error.txt", "w").write("GTFS non raggiungibili"); raise SystemExit(1)
    gen = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ")
    os.makedirs("data", exist_ok=True)
    for c, fn in (("rail", "transit.json"), ("bus", "bus.json")):
        o = out[c]; o["source"] = " + ".join(srcs) + " · GTFS ufficiali"; o["generated"] = gen
        json.dump(o, open("data/" + fn, "w"), ensure_ascii=False, separators=(",", ":"))
        print(fn, len(o["stops"]), "fermate", len(o["patterns"]), "percorsi", os.path.getsize("data/" + fn) // 1024, "KB")
    if os.path.exists("data/transit_error.txt"): os.remove("data/transit_error.txt")
if __name__ == "__main__": main()
