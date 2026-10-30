"""Posizioni reali delle navi nel Golfo di Napoli (AIS) da aisstream.io.
Ascolta il flusso per ~75 secondi, unisce con l'ultima istantanea e salva ships.json (pubblicato sul ramo 'live')."""
import asyncio, json, os, sys, time, datetime, urllib.request
import websockets
KEY = os.environ.get("AISSTREAM_KEY", "").strip()
BOX = [[40.50, 13.80], [40.92, 14.50]]  # Ischia, Procida, Capri, Sorrento, Napoli
RAW = "https://raw.githubusercontent.com/{}/live/ships.json".format(os.environ.get("GITHUB_REPOSITORY", "castf21/napoli360"))
def now(): return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
def load_prev():
    try: return json.load(urllib.request.urlopen(RAW + "?t=" + str(int(time.time())), timeout=20))
    except Exception: return {"ships": {}, "static": {}}
async def listen(ships, static):
    async with websockets.connect("wss://stream.aisstream.io/v0/stream", open_timeout=30) as ws:
        await ws.send(json.dumps({"APIKey": KEY, "BoundingBoxes": [BOX],
                                  "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport", "ShipStaticData", "StaticDataReport"]}))
        end = time.time() + 75; n = 0
        while time.time() < end:
            try: raw = await asyncio.wait_for(ws.recv(), timeout=max(1, end - time.time()))
            except asyncio.TimeoutError: break
            m = json.loads(raw); t = m.get("MessageType"); md = m.get("MetaData") or {}; mm = str(md.get("MMSI") or "")
            if not mm: continue
            body = (m.get("Message") or {}).get(t) or {}
            name = (md.get("ShipName") or "").strip()
            if name: static.setdefault(mm, {})["n"] = name
            if t in ("PositionReport", "StandardClassBPositionReport"):
                lat, lon = body.get("Latitude", md.get("latitude")), body.get("Longitude", md.get("longitude"))
                if lat is None or lon is None or abs(lat) > 90: continue
                hdg = body.get("TrueHeading"); hdg = None if hdg in (None, 511) else hdg
                ships[mm] = {"lat": round(lat, 5), "lon": round(lon, 5), "sog": body.get("Sog"), "cog": body.get("Cog"), "hdg": hdg,
                             "st": body.get("NavigationalStatus"), "t": now()}
                n += 1
            elif t == "ShipStaticData":
                s = static.setdefault(mm, {}); s["type"] = body.get("Type"); s["dest"] = (body.get("Destination") or "").strip()
                if body.get("Name"): s["n"] = body["Name"].strip()
            elif t == "StaticDataReport":
                rb = body.get("ReportB") or {}
                if rb.get("Valid") and rb.get("ShipType") is not None: static.setdefault(mm, {})["type"] = rb.get("ShipType")
        print(n, "posizioni ricevute")
def main():
    if not KEY: print("AISSTREAM_KEY mancante", file=sys.stderr); sys.exit(1)
    prev = load_prev(); static = prev.get("static", {})
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(minutes=45)
    ships = {k: v for k, v in prev.get("ships", {}).items() if datetime.datetime.fromisoformat(v["t"].rstrip("Z")) > cutoff}
    try: asyncio.run(listen(ships, static))
    except Exception as e: print("errore AIS:", e, file=sys.stderr)
    out = {"generated": now(), "source": "AIS via aisstream.io", "box": BOX, "ships": ships, "static": static}
    os.makedirs("/tmp/live", exist_ok=True); json.dump(out, open("/tmp/live/ships.json", "w"), separators=(",", ":"))
    print(len(ships), "navi nell'istantanea,", len(static), "anagrafiche")
if __name__ == "__main__": main()
