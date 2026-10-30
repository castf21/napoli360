"""Scarica il GTFS ufficiale ANM e ne estrae metropolitana e funicolari (orari programmati dei prossimi 21 giorni)
in data/transit.json, per il calcolo dei percorsi nel prototipo NAPOLI 360."""
import csv, io, json, os, sys, urllib.request, zipfile, datetime
URLS = ["https://www.anm.it/google/google-transit.zip", "http://www.anm.it/google/google-transit.zip"]
def tsec(t):
    h, m, s = (int(x) for x in t.strip().split(":")); return h * 3600 + m * 60 + s
def rows(z, name):
    if name not in z.namelist(): return []
    return csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig"))
def main():
    data = None
    for u in URLS:
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "napoli360-prototipo"})
            data = urllib.request.urlopen(req, timeout=180).read(); break
        except Exception as e: print("errore", u, e, file=sys.stderr)
    if not data:
        os.makedirs("data", exist_ok=True); open("data/transit_error.txt", "w").write("GTFS ANM non raggiungibile"); raise SystemExit(1)
    z = zipfile.ZipFile(io.BytesIO(data))
    routes = {r["route_id"]: r for r in rows(z, "routes.txt") if r.get("route_type", "").strip() in ("1", "7", "2", "12")}
    trips = {t["trip_id"]: t for t in rows(z, "trips.txt") if t["route_id"] in routes}
    st = {}
    for r in rows(z, "stop_times.txt"):
        if r["trip_id"] in trips:
            st.setdefault(r["trip_id"], []).append((int(r["stop_sequence"]), r["stop_id"], tsec(r["arrival_time"] or r["departure_time"]), tsec(r["departure_time"] or r["arrival_time"])))
    freq = {}
    for f in rows(z, "frequencies.txt"):
        if f["trip_id"] in trips: freq.setdefault(f["trip_id"], []).append((tsec(f["start_time"]), tsec(f["end_time"]), int(f["headway_secs"])))
    used = set(s for v in st.values() for _, s, _, _ in v)
    stops = {}
    for s in rows(z, "stops.txt"):
        if s["stop_id"] in used: stops[s["stop_id"]] = {"n": s["stop_name"].strip(), "lat": round(float(s["stop_lat"]), 6), "lon": round(float(s["stop_lon"]), 6), "p": s.get("parent_station", "") or ""}
    # calendario: date di servizio nei prossimi 21 giorni
    today = datetime.date.today(); days = [today + datetime.timedelta(d) for d in range(21)]
    act = {}
    for c in rows(z, "calendar.txt"):
        a, b = datetime.datetime.strptime(c["start_date"], "%Y%m%d").date(), datetime.datetime.strptime(c["end_date"], "%Y%m%d").date()
        wd = [c["monday"], c["tuesday"], c["wednesday"], c["thursday"], c["friday"], c["saturday"], c["sunday"]]
        for d in days:
            if a <= d <= b and wd[d.weekday()] == "1": act.setdefault(c["service_id"], set()).add(d.strftime("%Y%m%d"))
    for c in rows(z, "calendar_dates.txt"):
        if c["date"] in {d.strftime("%Y%m%d") for d in days}:
            if c["exception_type"].strip() == "1": act.setdefault(c["service_id"], set()).add(c["date"])
            else: act.get(c["service_id"], set()).discard(c["date"])
    pats = {}
    for tid, v in st.items():
        v.sort(); t = trips[tid]
        if not act.get(t["service_id"]): continue
        seq = tuple(s for _, s, _, _ in v); k = (t["route_id"], seq)
        base = v[0][3]; offs = [[a - base, d - base] for _, _, a, d in v]
        starts = [base] if tid not in freq else [x for (s0, s1, h) in freq[tid] for x in range(s0, s1, h)]
        p = pats.setdefault(k, {"r": t["route_id"], "h": t.get("trip_headsign", "").strip(), "s": list(seq), "o": offs, "t": []})
        for x in starts: p["t"].append([t["service_id"], x])
    out = {"source": "ANM · GTFS ufficiale (www.anm.it)", "generated": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"),
           "routes": {k: {"s": r.get("route_short_name", "").strip(), "l": r.get("route_long_name", "").strip(), "c": (r.get("route_color") or "").strip(), "type": r["route_type"].strip()} for k, r in routes.items()},
           "stops": stops, "services": {k: sorted(v) for k, v in act.items() if v}, "patterns": list(pats.values())}
    for p in out["patterns"]: p["t"].sort(key=lambda x: x[1])
    os.makedirs("data", exist_ok=True)
    json.dump(out, open("data/transit.json", "w"), ensure_ascii=False, separators=(",", ":"))
    if os.path.exists("data/transit_error.txt"): os.remove("data/transit_error.txt")
    print(len(routes), "linee", len(stops), "fermate", len(out["patterns"]), "percorsi")
if __name__ == "__main__": main()
