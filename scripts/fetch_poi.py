"""Scarica da OpenStreetMap le posizioni reali dei luoghi principali di Napoli per la Mappa 3D."""
import json, os, time, urllib.parse, urllib.request
BB = "40.815,14.170,40.875,14.290"
Q = f"""
[out:json][timeout:120];
(
  nwr["name"~"Archeologico Nazionale|Capodimonte|Sansevero|Palazzo Reale|Teatro di San Carlo|Castel Nuovo|Maschio Angioino|Castel dell.Ovo|Certosa di San Martino|Piazza del Plebiscito|Palapartenope|Maradona|Rotonda Diaz|Galleria Umberto|Gregorio Armeno|Arena Flegrea|Duomo di Napoli|Cattedrale di Santa Maria Assunta|Castel Sant.Elmo|Napoli Sotterranea|Villa Comunale"]({BB});
  node["railway"="station"]["name"~"^(Municipio|Toledo|Garibaldi|Montesanto|Mergellina|Museo|Dante|Edenlandia|Mostra|Napoli Centrale)$"]({BB});
);
out tags center;
"""
SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
def main():
    body = urllib.parse.urlencode({"data": Q}).encode()
    for s in SERVERS:
        try:
            req = urllib.request.Request(s, data=body, headers={"User-Agent": "napoli360-prototipo"})
            with urllib.request.urlopen(req, timeout=150) as r: d = json.load(r); break
        except Exception as e:
            print("errore", s, e); os.makedirs("data", exist_ok=True); open("data/poi_error.txt", "a").write(f"{s}: {e}\n"); time.sleep(5)
    else:
        os.makedirs("data", exist_ok=True); open("data/poi_error.txt", "w").write("Overpass non raggiungibile"); raise SystemExit(1)
    out = []
    for el in d["elements"]:
        t = el.get("tags", {}); c = el.get("center") or {"lat": el.get("lat"), "lon": el.get("lon")}
        if c.get("lat") is None: continue
        out.append({"name": t.get("name"), "lat": round(c["lat"], 6), "lon": round(c["lon"], 6), "osm": f'{el["type"]}/{el["id"]}',
                    "kind": t.get("tourism") or t.get("historic") or t.get("amenity") or t.get("leisure") or t.get("building") or t.get("railway") or t.get("place") or t.get("highway")})
    os.makedirs("data", exist_ok=True)
    json.dump({"attribution": "© OpenStreetMap contributors, ODbL", "poi": out}, open("data/poi.json", "w"), ensure_ascii=False, separators=(",", ":"))
    print(len(out), "luoghi")
if __name__ == "__main__": main()
