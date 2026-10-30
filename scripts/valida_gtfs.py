"""Controllo automatico della qualità degli orari: esegue il validatore ufficiale MobilityData (gtfs-validator)
sui GTFS di ANM ed EAV e aggiunge alcuni controlli propri. Risultato: data/qualita.json e i rapporti HTML in data/qualita/."""
import json, os, glob, shutil, subprocess, datetime
JAR = "/tmp/gtfs-validator-cli.jar"
os.makedirs("data/qualita", exist_ok=True)
today = datetime.date.today().strftime("%Y%m%d")
tomorrow7 = [(datetime.date.today() + datetime.timedelta(d)).strftime("%Y%m%d") for d in range(7)]
def own_checks(agency):
    res = {"corse_oggi": 0, "giorni_senza_servizio_prossimi_7": [], "fermate": 0, "fermate_accessibili_dichiarate": 0}
    for fn in ("data/transit.json", "data/bus.json"):
        if not os.path.exists(fn): continue
        d = json.load(open(fn)); pref = {"ANM": "A:", "EAV": "E:"}[agency]
        for p in d["patterns"]:
            if not p["r"].startswith(pref): continue
            res["corse_oggi"] += sum(1 for sid, _ in p["t"] if today in d["services"].get(sid, []))
        for k, st in d["stops"].items():
            if k.startswith(pref):
                res["fermate"] += 1; res["fermate_accessibili_dichiarate"] += 1 if st.get("w") == 1 else 0
        if fn == "data/transit.json":
            days = set()
            for p in d["patterns"]:
                if p["r"].startswith(pref):
                    for sid, _ in p["t"]: days |= set(d["services"].get(sid, []))
            res["giorni_senza_servizio_prossimi_7"] = [x for x in tomorrow7 if x not in days]
    return res
out = {"generated": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), "validator": os.environ.get("VALIDATOR_VERSION", ""), "feeds": []}
for z in sorted(glob.glob("/tmp/gtfs/*.zip")):
    name = os.path.basename(z)[:-4]; od = f"/tmp/val/{name}"
    f = {"name": name, "ok": False, "errori": None, "avvisi": None, "info": None, "principali": [], "html": None, "controlli": own_checks(name)}
    if os.path.exists(JAR):
        try:
            subprocess.run(["java", "-jar", JAR, "-i", z, "-o", od], check=False, timeout=900, capture_output=True)
            rep = json.load(open(f"{od}/report.json"))
            ns = rep.get("notices", [])
            cnt = lambda sev: sum(n.get("totalNotices", 0) for n in ns if n.get("severity") == sev)
            f.update(ok=True, errori=cnt("ERROR"), avvisi=cnt("WARNING"), info=cnt("INFO"))
            f["principali"] = [{"codice": n.get("code"), "gravita": n.get("severity"), "quanti": n.get("totalNotices", 0)}
                               for n in sorted(ns, key=lambda n: ({"ERROR": 0, "WARNING": 1}.get(n.get("severity"), 2), -n.get("totalNotices", 0)))[:6]]
            fi = (rep.get("summary") or {}).get("feedInfo") or {}
            f["validita"] = {k: fi.get(k) for k in ("feedServiceWindowStart", "feedServiceWindowEnd", "feedStartDate", "feedEndDate") if fi.get(k)}
            if os.path.exists(f"{od}/report.html"): shutil.copy(f"{od}/report.html", f"data/qualita/{name}.html"); f["html"] = f"data/qualita/{name}.html"
        except Exception as e:
            f["nota"] = "validatore non eseguito: " + str(e)[:200]
    else:
        f["nota"] = "validatore non disponibile in questa esecuzione"
    out["feeds"].append(f)
json.dump(out, open("data/qualita.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False)[:1500])
