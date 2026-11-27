# After Rain

Chris Nickerson’s portfolio opens over an alpine inlet. **Get to know me** opens three stops for Chris’s story, selected projects, and life outside work. **Hangar** lets you choose the Survey Biplane, Alder Courier, or Marlin Twin. **Go flying** hands you the controls. The terrain, aircraft, swans, and sound are built in code. [Visit the portfolio](https://chrisnickerson.dev).

## Run it

Use the Node version in [`.node-version`](.node-version). From the repository root, run these commands.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. The dev server also listens on your local network, so the Network URL opens the site on a phone.

## Replay a flight

Add `?seed=42` for the field-station cove, `?seed=43` for the windward slope, or `?seed=44` for the island channel. The seed fixes the departure point and the flock’s route. Physics advances in fixed 60 Hz steps, so the automatic flight for a seed is the same on every load. Without a seed, each visit draws a new one.

The watershed remembers soil moisture in `localStorage`. Each tab saves a complete snapshot. When another tab writes or clears the save, running flights [adopt the snapshot](src/watershed-store.ts). The focused flight saves its soil changes, including evaporation, and flushes pending changes when it loses focus. An unfocused tab skips evaporation-only writes. A tab that discovers a conflicting save before receiving the storage event discards its unsaved changes and continues from the stored watershed. An unreadable newer save stays in storage until an explicit reset. To start with dry ground, use a fresh browser profile or choose **Reset the watershed** in the Watershed view.

## Read the source

- **Profile.** Edit the biography, notes, and links in [`profile.ts`](src/profile.ts). Blank lines separate paragraphs. The workshop stories, page metadata, and no-JavaScript copy live in [`index.html`](index.html). [`profile-view.ts`](src/profile-view.ts) prepares the personal content during startup. Visitors can open it from the keyboard skip link or after the eight-second loading timeout.
- **Page and controls.** [`index.html`](index.html) holds every element, and [`main.ts`](src/main.ts) wires them by id. [Flight controls](src/flight-controls.ts) track held keys and touch pointers. The entry module owns the dialogs and `updateUI`, which redraws the panels from the simulation about three times a second. Controls marked `data-flight-control` and destination buttons marked `data-visit` stay disabled until the flight starts. If WebGL is lost, `fallback` ends the active flight, and `updateUI` without one shows the same static profile and chart as a browser without WebGL.
- **Flight.** Start with `Simulation.animate`. Each physics tick advances `Flight` or a guided `Arrival`. A pilot reaches the water through `Flight.touchDown` and leaves it through `Flight.liftOff`. Between ticks, `FlightPresentation` supplies one pose for the aircraft and its [camera framing](src/camera-framing.ts). [Adaptive quality](src/adaptive-quality.ts) adjusts rendering resolution using frame times and GPU measurements when available. [Simulation loop](src/simulation.ts) · [Flight dynamics](src/flight.ts) · [Guided arrival](src/arrival.ts) · [Presentation](src/flight-presentation.ts)
- **Travel.** **Fly in**, a rain run, and **Back to the sky** each place the aircraft and then call `Simulation.cutTo`, which moves the camera, trail, and terrain detail with it.
- **Water.** [`water-release.ts`](src/water-release.ts) owns the falling drops and the aiming mark that predicts them. A drop that lands feeds the [rain run](src/rainrun.ts) and the [watershed](src/hydrology.ts).
- **The inlet.** Terrain height comes from [`terrain.ts`](src/terrain.ts), and [`world.ts`](src/world.ts) builds what the renderer draws from it. Swans follow a seeded route in [`migration.ts`](src/migration.ts). The [design notes](CONCEPT.md) explain the landing, water, and rendering decisions with the tests and measurements behind them.

## Check a change

```sh
npm test          # simulation tests and the page contract, no browser needed
npm run typecheck # check the application, tests, and TypeScript tools
npm run build     # type-check and build the static site in dist/
```

Pull requests run `npm ci`, `npm test`, and `npm run build` on the Node version in `.node-version`.

`npm test` replays flights, landings, water, and swans through the same modules the page runs. It also checks the string references between files: ids the source looks up by literal, `data-*` hooks, and the `#id` selectors and `Simulation` members the browser scripts use. Selectors by role or class are only checked in the browser.

For browser-facing changes, install Playwright’s browsers once with `npx playwright install chromium webkit`. Run `npm run verify` for Chromium or `npm run verify:webkit` for WebKit. Each command builds and serves its own production preview. The Chromium command also runs the stability studio locally to exercise frame interpolation and map-boundary recovery.

| You changed | Run |
| --- | --- |
| Flight, landing, arrival, or water physics | `npm test`, then the focused check for that feature in the [scripts guide](scripts/README.md) |
| The page, styles, dialogs, or controls | `npm test`, then `npm run verify` |
| Shaders, geometry, or render settings | `npm run verify`, then the render timings in the [scripts guide](scripts/README.md) |
| The profile | `npm run verify`, which reads [`profile.ts`](src/profile.ts) for the text it expects |

The site runs entirely in the browser. Three.js ships with its [license notice](public/THIRD_PARTY_NOTICES.txt).
