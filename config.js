// Impostazioni del prototipo. Le coordinate dei moli sono indicative.
window.N360 = {
  cesium: "https://cdn.jsdelivr.net/npm/cesium@1.123.0/Build/Cesium/",
  view: { lon: 14.2552, lat: 40.8366, height: 420, heading: 20, pitch: -38 },
  start: { name: "Metro Municipio", lon: 14.2531, lat: 40.8394 },
  dest:  { name: "Molo B", sub: "Aliscafo per Procida · 10:40", lon: 14.2566, lat: 40.8366 },
  docks: [],            // etichette dei moli, aggiunte dopo aver letto i dati
  walkSpeedKmh: 4.5,
  demoSeconds: 30       // durata dell'animazione della camminata
};
