# Road Atlanta reconstruction

The centreline now uses 230 geographic vertices instead of the previous 31 hand-drawn controls. Local metres are computed using an equirectangular projection at the venue latitude; the outline is not scaled to force a particular lap length. The sampled spline measures approximately 4,090 m. Both the browser and authoritative lap validation import this same route.

Source: https://github.com/markthebault/open-racetrack-db at commit `2ca6e8834c6f3d9d23b9d53f2e56138e970f082b`, `data/united-states/road-atlanta-9292566/layouts/road-atlanta.geojson` and `data/elevation/us-road-atlanta-9292566.json`. Trace © OpenStreetMap contributors, ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/ . The derived coordinates and original trace are distributed in `public/data/road-atlanta-source.json` and its JavaScript companion under ODbL. No supplemental restricted border geometry is included.

Elevation: Mapzen Terrain Tiles, global elevation courtesy of USGS and NOAA. Source grid sampled 2026-10-03, zoom 12, approximately 79 m spacing, integer metre heights. Provider details: https://github.com/tilezen/joerd/blob/master/docs/attribution.md . Terrain and road heights use bilinear interpolation with a 260 m local height datum. These are coarse ground elevations, not a road survey. Source geometry and direction are marked provisional; timing location is estimated. Pit alignment, widths, kerbs, vegetation, bridge placement near the final crest, structures, and GT3-style car are procedural approximations. No millimetre accuracy, LiDAR, photogrammetry, licensed manufacturer model, or measured GT3 telemetry is claimed.

Physics: vendored `cannon-es` 0.20.0 from the published npm distribution (MIT licence alongside module), https://github.com/pmndrs/cannon-es . A 1,320 kg chassis uses four 72 kN/m springs, 6,100 Ns/m dampers, 2.68 m wheelbase and 1.94 m track. A saturated bicycle steering model supplies finite tyre grip and side-slip, while the Cannon body integrates suspension heave, roll and pitch at 120 Hz. Kerb wheel contacts apply a spatial rumble profile. Parameters are representative tuning values, not a validated manufacturer's model. This is a driving-game model, not a full motorsport simulator.

Old record and session namespaces are intentionally retired for the new geometry and handling. Existing records remain stored but are not compared with these laps.

Rendering also vendors Three.js 0.160.1 (MIT, licence alongside module) so the racing and clubhouse renderers no longer require runtime CDN access. Both vendored packages retain their upstream notices.

Centreline interpolation uses centripetal Catmull–Rom followed by 800 equally spaced arc-length samples, with four visual subdivisions per sample. This prevents sparse geographic control points from stretching the rendered kerb stripes.

## Visual reference pass

The user's image is used as a camera, lighting, surface and HUD reference, not as Road Atlanta geographic evidence (it depicts the Le Mans Dunlop bridge). Kerbs now use blue and yellow paint.

Detailed car: Ferrari 458 Italia by **vicent091036**, distributed in the Three.js r160 examples, https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6 and https://github.com/mrdoob/three.js/blob/r160/examples/models/gltf/ferrari.glb . Local copy `public/assets/gt-coupe.glb`; modifications are material/paint changes and added wing, closed roof, splitter, skirts and diffuser. This is a modified road-car asset, not a homologated Ferrari GT3 or the Porsche shown in the reference. The original procedural car remains a fallback constructor. Author attribution appears in the driving view.

Additional Three.js r160 example assets: `textures/equirectangular/venice_sunset_1k.hdr` (original HDR Haven/Poly Haven environment), `textures/terrain/grasslight-big.jpg`. Their source URLs are under https://github.com/mrdoob/three.js/tree/r160/examples . Loaders are from Three.js 0.160.1, MIT; Draco decoder retains the Apache 2.0 licence in its directory. Assets and decoder are served locally with no runtime third-party requests. Foliage silhouettes are generated locally.
