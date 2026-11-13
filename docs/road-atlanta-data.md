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

Detailed car: Ferrari 458 Italia by **vicent091036**, distributed in the Three.js r160 examples, https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6 and https://github.com/mrdoob/three.js/blob/r160/examples/models/gltf/ferrari.glb . Local copy `public/assets/gt-coupe.glb`; modifications are material/paint changes and added wing, splitter, skirts and diffuser. This is a modified road-car asset, not a homologated Ferrari GT3 or the Porsche shown in the reference. The original procedural car remains a fallback constructor. Author attribution appears in the driving view.

Additional Three.js r160 example assets: `textures/equirectangular/venice_sunset_1k.hdr` (original HDR Haven/Poly Haven environment), `textures/terrain/grasslight-big.jpg`. Their source URLs are under https://github.com/mrdoob/three.js/tree/r160/examples . Loaders are from Three.js 0.160.1, MIT; Draco decoder retains the Apache 2.0 licence in its directory. Assets and decoder are served locally with no runtime third-party requests. Foliage silhouettes are generated locally.

## Driving and final-sector correction

The first-person camera now sits above the bonnet, ahead of the cabin, with only
the car nose in view. Imported wheel transforms are retained beneath independent
steering pivots and axle rotation. The artificial intersecting roof cap was
removed. Road-relative suspension, individual tyre contact adjustment and direct
heading alignment keep the chassis and wheels consistent on elevation changes.

The previous single pit building was nearly 200 m long: its straight footprint
crossed the curved final sector. Twelve short garage sections now follow the pit
frontage. Their complete footprints are checked against both the entire racing
loop and pit lane, with at least 6 m beyond the racing half-width and 3 m beyond
the pit half-width. Static frontage meshes are batched by material. These are
procedural building approximations, not downloaded or surveyed Road Atlanta 3D
models. The existing mapped centreline and terrain sources remain unchanged.

Blue/yellow kerbs, textured asphalt, HDR reflections and antialiasing are retained.
The sky includes procedural scattered clouds; shadow depth range is tightened,
shadow updates are limited to 30 Hz, the minimap redraws at 10 Hz, and rendering
can lower pixel ratio when CPU rendering cost is high.

The requested video reference is https://www.youtube.com/watch?v=qRf-7GWJIWk .
The environment denied YouTube access during this pass; no claim is made that
this reconstruction matches unseen footage or uses an exact venue model.

Validation: `npm test` includes suspension elevation/steering response and pit
footprint regressions. With a local Wrangler server and Playwright installed,
`NODE_PATH=/workspace/browser-tools/node_modules node scripts/verify-driving-browser.cjs`
checks the loaded, Draco-decoded car, front/rear wheel steering and axle axes,
heading alignment and 160 tyre contacts around the circuit. It also writes chase,
bonnet, bridge, final-corner and pit-frontage screenshots to `/tmp`.

## Pit entry and handling follow-up

The complete pit corridor now clears terrain, main-road grass shoulders and kerb
triangles, including triangles whose vertices lie outside the lane. Its heights
match the adjacent main-road profile at the merges. Pit entry selects the paved
branch and engages the speed limiter automatically; manual P remains available.
Bridge supports also clear both paved routes.

Steering saturation now limits yaw without generating a separate sideways speed.
The chassis fits a plane through four measured tyre contacts; tyre radius comes
from the decoded mesh. Individual wheels follow that plane and the local surface,
with 2.5 cm maximum sprung heave and bounded roll/pitch. Pit asphalt's higher
surface is also used where it overlaps the racing road. Bonnet heading follow is
bounded to expose the nose pivot while keeping the camera attached to the car.

The browser check now raycasts 636 positions across the full pit corridor,
drives through its first quarter using the actual controls, checks 100 ms steering
response, and measures tyre vertices against road planes around the circuit.
This supplements the Node regression suite; it is not vehicle telemetry validation.
Project Chrono was assessed through its official repository README: its documented
native C++/Python/C# interfaces do not provide a drop-in JavaScript replacement.
This pass retains the existing browser runtime and Cannon suspension integration.

## Three-lap multiplayer and assisted handling

Scheduled races now finish after three verified laps; qualifying and the
mandatory ten-second pit stop remain. Every race HUD and roster uses three laps.
Gameplay tyre grip is 1.85, steering range is increased, and braking preserves
96% of cornering grip rather than 72%. Grip averages all four contacts so touching
an apex kerb does not impose one tyre's low grip on the whole chassis. Braking
uses 20 m/s² game tuning with a zero-speed clamp; these are accessibility settings,
not measured GT3 specifications.

Driving telemetry and race-state polling target 100 ms intervals, subject to
network response time. Opponents use timestamped interpolation with a 150 ms
playback buffer, shortest-angle headings and at most 150 ms extrapolation across
missing packets. Older packets are discarded, clock corrections are bounded,
and finished/removed rivals are removed. Speed is included in server snapshots
for animated wheels. Meeting storage updates use a transaction to prevent
concurrent drivers overwriting one another's state.

`verify-multiplayer-browser.cjs` exercises two clients with delayed/out-of-order
HTTP responses and a contact response. The driving browser check also verifies
a 100 km/h braking stop and opponent movement between 10 Hz snapshots. Node tests
cover lap-three completion, steering while braking, kerb grip and packet playback.

Free Practice has been removed from the selector; its legacy entry point redirects
to Time Trial. Time Trial's top-right driving HUD displays real ranked best-lap
times, updates immediately from completed-lap results and polls every five
seconds. It is visible in fullscreen; the minimap sits below it. Empty boards
invite a first recorded lap instead of inventing times. The browser check uses
explicit fixture records to verify formatting, placement and live refresh.
