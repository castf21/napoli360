// Impostazioni del prototipo. Posizioni da OpenStreetMap; l'abbinamento Molo B = pontile 9 è indicativo.
window.N360 = {
  cesium: "https://cdn.jsdelivr.net/npm/cesium@1.123.0/Build/Cesium/",
  view: { lon: 14.2545, lat: 40.8381, height: 380, heading: 25, pitch: -40 },
  start: { name: "Metro Municipio", lon: 14.2534939, lat: 40.8399383 },          // OSM node/8450070548
  dest:  { name: "Molo B", sub: "pontile 9 · aliscafo per Procida 10:40", lon: 14.2550166, lat: 40.8377482 }, // OSM node/10072475980
  docks: [                                                                        // pontili OSM (amenity=ferry_terminal)
    { name: "Pontile 6", lon: 14.2548181, lat: 40.8374525 },
    { name: "Pontile 7", lon: 14.2548849, lat: 40.8375508 },
    { name: "Pontile 8", lon: 14.2549517, lat: 40.8376504 },
    { name: "Pontile 10", lon: 14.2552074, lat: 40.8379191 },
    { name: "Pontile 11", lon: 14.2555562, lat: 40.8379737 }
  ],
  walkSpeedKmh: 4.5,
  demoSeconds: 30
};
