# NAPOLI 360 · Port Vision AI · prototipo 3D del Molo Beverello

Prototipo dimostrativo del progetto **NAPOLI 360** (corso di Creazione d'Impresa e Start-up Innovative).
- `index.html`: l'app (home, assistente Partenope, guida nel terminal, eventi, mobilità).
- `porto3d.html`: Port Vision AI, il Molo Beverello in 3D con dati reali e il percorso a piedi dalla metro Municipio al molo d'imbarco.

## Come è fatto
| Parte | Strumento | Licenza |
|---|---|---|
| Dati di moli, banchine, edifici e percorsi pedonali | OpenStreetMap (Overpass API) | ODbL · © OpenStreetMap contributors |
| Mappa e vista 3D | CesiumJS · base cartografica CARTO | Apache 2.0 · © CARTO |
| Calcolo del percorso | algoritmo di Dijkstra sui camminamenti OSM (`app.js`) | — |
| Interfaccia | stile «Mediterraneo» di NAPOLI 360 | — |

## Aggiornamento automatico
Il workflow `.github/workflows/pubblica.yml` scarica i dati aggiornati di OpenStreetMap (`scripts/fetch_osm.py`),
li salva in `data/beverello.geojson` e pubblica il sito con GitHub Pages a ogni modifica e ogni lunedì.

## Avvertenze
Prototipo con dati di esempio per orari, avvisi e moli: i nomi dei moli sono indicativi.
Non usare per la navigazione reale: segui sempre segnaletica e personale del porto.
