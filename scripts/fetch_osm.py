"""Scarica da OpenStreetMap (Overpass API) i dati reali dell'area del Molo Beverello
e li salva come GeoJSON in data/beverello.geojson. Eseguito da GitHub Actions."""
import json, os, sys, time, urllib.parse, urllib.request, datetime

BBOX = (40.8330, 14.2470, 40.8425, 14.2620)  # sud, ovest, nord, est
Q = f"""
[out:json][timeout:90];
(
  way["building"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  relation["building"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  way["man_made"~"^(pier|breakwater|quay|groyne)$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  relation["man_made"~"^(pier|breakwater)$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  way["highway"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  way["railway"="platform"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  way["route"="ferry"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  node["railway"~"^(subway_entrance|station)$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  node["public_transport"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  nwr["amenity"="ferry_terminal"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  nwr["mooring"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out tags geom;
"""
SERVERS = ["https://overpass-api.de/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter",
           "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]

def fetch():
    body = urllib.parse.urlencode({"data": Q}).encode()
    for s in SERVERS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(s, data=body, headers={"User-Agent": "napoli360-prototipo (studenti universitari)"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    return json.load(r)
            except Exception as e:
                print("errore", s, e, file=sys.stderr); time.sleep(5)
    raise SystemExit("Overpass non raggiungibile")

def ll(geom): return [[round(p["lon"], 7), round(p["lat"], 7)] for p in geom]

def main():
    d = fetch(); feats = []
    for el in d["elements"]:
        tags = el.get("tags", {}); props = dict(tags); props["osm"] = f'{el["type"]}/{el["id"]}'
        if el["type"] == "node":
            g = {"type": "Point", "coordinates": [el["lon"], el["lat"]]}
        elif el["type"] == "way":
            c = ll(el.get("geometry", []))
            if len(c) < 2: continue
            area = c[0] == c[-1] and len(c) >= 4 and ("building" in tags or tags.get("area") == "yes" or tags.get("man_made") in ("pier", "quay", "breakwater") or "amenity" in tags)
            g = {"type": "Polygon", "coordinates": [c]} if area else {"type": "LineString", "coordinates": c}
        else:
            rings = [ll(m["geometry"]) for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
            rings = [r for r in rings if len(r) >= 4 and r[0] == r[-1]]
            if not rings: continue
            g = {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
        feats.append({"type": "Feature", "properties": props, "geometry": g})
    out = {"type": "FeatureCollection", "bbox": [BBOX[1], BBOX[0], BBOX[3], BBOX[2]],
           "generated": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"),
           "attribution": "© OpenStreetMap contributors, ODbL", "features": feats}
    os.makedirs("data", exist_ok=True)
    with open("data/beverello.geojson", "w") as f: json.dump(out, f, separators=(",", ":"))
    print(len(feats), "elementi salvati")

if __name__ == "__main__": main()
