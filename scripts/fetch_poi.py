"""Scarica da OpenStreetMap le posizioni reali dei luoghi principali di Napoli per la Mappa 3D."""
import json, os, time, urllib.parse, urllib.request
BB = "40.815,14.170,40.875,14.290"
Q = f"""
[out:json][timeout:90];
(
  nwr["tourism"~"^(museum|attraction|gallery)$"]["name"]({BB});
  nwr["historic"~"^(castle|palace|monument|church)$"]["name"]({BB});
  nwr["amenity"~"^(theatre|place_of_worship|ferry_terminal)$"]["name"]({BB});
  nwr["leisure"~"^(stadium|sports_centre|park)$"]["name"]({BB});
  nwr["building"~"^(stadium|cathedral)$"]["name"]({BB});
  node["railway"~"^(station|subway_entrance)$"]["name"]({BB});
  nwr["place"="square"]["name"]({BB});
  nwr["highway"="pedestrian"]["name"~"Rotonda|Caracciolo|Gregorio"]({BB});
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
        except Exception as e: print("errore", s, e); time.sleep(5)
    else: raise SystemExit("Overpass non raggiungibile")
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
