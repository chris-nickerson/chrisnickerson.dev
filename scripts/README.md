# Browser checks

Run commands from the repository root. Install the browsers and video recorder once with `npx playwright install chromium webkit`.

`npm run verify` builds the site, starts a local production preview on a free port, runs the Chromium checks, and closes the server. It then starts a local dev server for the stability replay and writes its measurements and depth screenshots under the capture directory. The production preview covers navigation, desktop keyboard and portrait touch flight, persistence, sound opt-in, reduced motion, and graphics fallback. `npm run verify:webkit` exercises desktop and portrait WebKit. Set `BASE_URL` to run the production browser checks against an existing server. The stability replay always runs against the local source tree. Set `BROWSER_CHANNEL=chrome` to use installed Google Chrome.

## Choose a focused check

For the **preview** checks below, run `npm run build` and leave `npm run preview` running (default port 4173). For **dev**, leave `npm run dev` running (default port 5173). The dev checks use individual TypeScript modules for fixtures and inspection. If Vite chooses another port, set `BASE_URL` to the printed address.

| Change                              | Server  | Command                             |
| ----------------------------------- | ------- | ----------------------------------- |
| Biography, links, dialog focus      | Dev     | `node scripts/verify-personal.mjs`  |
| Aircraft selection and float landings | Dev   | `node scripts/verify-hangar.mjs`    |
| Guided arrival and story access     | Preview | `node scripts/verify-arrival.mjs`   |
| Manual landing, taxi, takeoff       | Preview | `node scripts/verify-landing.mjs`   |
| Touch orbit and aircraft framing    | Preview | `node scripts/verify-camera.mjs`    |
| Water delivery and grove completion | Preview | `node scripts/verify-rainrun.mjs`   |
| Seeded flock encounters             | Dev     | `node scripts/verify-migration.mjs` |

## Inspect rendering

Run `python3 scripts/paint-eclipse.py` to repaint both eclipse images after changing the relief or the shared framing in `src/eclipse-framing.json`. The painter uses NumPy and Pillow. Run `node scripts/verify-opening-preview.mjs` for a fresh production build and the opening checks in Chromium and WebKit.

Run `python3 scripts/bake-flight-chart.py` from the repo root to regenerate the fallback chart after a terrain change. It uses the terrain sampler, NumPy and Pillow. The chart covers eight world metres per pixel, with the world origin at pixel (810, 400).

Use the preview for [render timings](verify-graphics.mjs) and the [adaptive-quality check](verify-quality.mjs). Use the dev server for the [aircraft studio](verify-aircraft.mjs), the [fixed-clock motion check](diagnose-stability.mjs), or the [shoreline sweep](diagnose-shore.mjs). The [shoreline analysis](analyze-shore.py) compares matching sweeps and needs Python, Pillow, and NumPy.

Run `node --import tsx scripts/measure-render-setup.mjs <checkout>` to time terrain tiling, shoreline generation and repeated updates of a fully wet watershed. Each checkout needs its dependencies installed. Compare the geometry hashes and visible vertex counts alongside the medians. To replay the seed used for the shore rendering comparison, run `BASE_URL='http://127.0.0.1:4173/?seed=937' node scripts/verify-graphics.mjs` against each production preview.

To compare two revisions, run `node --import tsx scripts/measure-migration.mjs <dev-server-url> <label>` against each dev server. The script replays the same aircraft poses. To record a seed-42 desktop and portrait flight with browser audio, put FFmpeg on your path and run `node scripts/record-migration.mjs migration-final flight 42` against the preview.

New reports and captures go in the ignored `evidence/local/` directory. Set `CAPTURE_DIR` to keep runs side by side. The [design notes](../CONCEPT.md) link the [tracked reports](../evidence/) they cite. The design notes do not cite the other tracked reports.
