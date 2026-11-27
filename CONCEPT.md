# Designing After Rain

The inlet gives the portfolio a place to explore. The opening screen offers a direct route to Chris’s work. Someone who lands at the field station can open the same story from the floats. The field station, workshop, and dock are fictional places.

## An eclipse before the first frame

An eclipse hangs between the peaks while the flight renderer starts. The two illustrations show the same valley with separate landscape and portrait framing. A small flock crosses the light and ripples break up the reflected peaks beneath **Loading**. The eclipse dissolves into the first live frame. Visitors can use the flight controls throughout the dissolve. If the flight module is still downloading after eight seconds, the portfolio opens while the download continues. **Get to know me** opens the personal stories and **Go flying** becomes available when the simulation is ready. If graphics are unavailable, a relief chart accompanies the profile. Losing WebGL during manual flight restores the same profile controls. Reduced motion keeps the opening still and opens the simulation paused. Sound starts with a visitor gesture. [Page](index.html) · [Interaction and startup](src/main.ts) · [Profile checks](scripts/verify-personal.mjs) · [Before and after context loss](evidence/static-flight-recovery.webp)

## Flight, contact, and camera

Physics advances at 60 Hz. On a faster display, drawing the latest physics position used to repeat frames and make the plane judder. The renderer now interpolates the previous and current poses. That costs one tick of visual latency and gives the chase camera the same position the visitor sees. Travel resets the pose history so the aircraft never interpolates across the inlet. [Pose sampler](src/flight-presentation.ts) · [Refresh-rate and travel tests](tests/flight-presentation.test.ts)

The manual landing diagnostic places the aircraft on final approach with a clear water run beside the berth. From there the ordinary solver handles descent, float contact, drag, taxi, and takeoff. An earlier approach lined up with shallow islets. The clearance test now samples the width of the floats along each actual starting path. **Fly in** uses a guided descent beginning 190 metres from the berth. Shortening the transit kept the flare and brought the story within reach in about six seconds. **Read now** opens the story directly. [Manual flight](src/flight.ts) · [Clearance test](tests/manual-landing.test.ts) · [Guided arrival](src/arrival.ts) · [Recorded arrivals](evidence/arrival-verification.json)

## Water and wind

A rain run credits a grove when falling water hits its soil. The aiming guide predicts the impact from the aircraft’s velocity and wind. A 128 × 128 watershed moves surface water downhill, absorbs some into the soil, and feeds vegetation. The browser saves soil moisture and the total delivered. Accelerating ground time lets a visitor see growth during a short flight. [Rain run](src/rainrun.ts) · [Watershed](src/hydrology.ts) · [Collision and aiming tests](tests/rainrun.test.ts)

The seeded opening follows two families of trumpeter swans. They keep their own world clock when the pilot turns away or travels to a berth. Terrain upwind shelters the water and changes the lift along the slopes. Water shading, spray, flight, and sound use the same wind field, so a pilot can see and hear the transition. The posture and synthesized calls draw on the [Trumpeter Swan Society’s field observations](https://www.trumpeterswansociety.org/swan-information/identification/swan-behavior/flight-profiles-and-take-off.html) and [Cornell Lab’s sound descriptions](https://www.allaboutbirds.org/guide/Trumpeter_Swan/sounds).

## Flying the inlet after dark

In a landscape viewport at least 700 pixels tall, the opening autopilot camera sits lower behind the plane and aims toward the break in the clouds. Short screens use the wider chase framing to keep the wings and floats in view as the pilot orbits.

A clearing in the storm sends low light across the conifers, rock faces and lake. Snow collects in hollows sampled from the terrain. Wind exposure changes the waves and the sharpness of the reflected granite. The distant sky uses an original OpenAI ImageGen panorama with blended edges. [Opening comparison](evidence/inlet-light-comparison.webp) · [Sky prompt](evidence/storm-sky-prompt.txt)

**Night flight** puts the moon and a moving aurora over the same inlet. On a low approach, the landing light follows the aircraft and picks out the wave crests ahead of the floats. The lighthouse sweeps the entrance to the dock. Cabin windows, the greenhouse and the marker lights are attached to their buildings and piers, so their reflections stay in place when the pilot turns. The night control works while paused. [Watch a flight](evidence/inlet-after-dark.webp)

## Relief atlas

The atlas samples the flight terrain every six metres and projects the surface and the three berths from the southeast. Two baked lighting directions let the browser blend the shadows as the reader moves the slider. Selecting a berth magnifies the same plate 2.45×. The magnification makes the contour lines easier to follow, with detail limited to the selected 900 or 1,800 pixel image. [Desktop overview](evidence/relief-atlas.webp) · [Quiet dock in eastern light on a phone viewport](evidence/relief-atlas-dock.webp)

On an M4 Pro, Chromium requested a 219,202-byte western plate at 1440 × 900 and a 67,354-byte plate at 390 × 844 with 2× device scale. The corresponding eastern plates cost 210,462 and 67,792 bytes on first use. Opening the flight incurred zero plate requests. In three 120-frame slider sweeps at each viewport, the 95th-percentile frame interval ranged from 16.7 to 16.8 ms. These local measurements used a warm atlas and an emulated phone.

## What the renderer spends

On the public preview of `07b2f80`, three-second samples on an M4 Pro averaged 60 fps in Chromium across daylight flight, night flight and the night dock. At 390 × 844 with phone emulation, the 95th-percentile GPU time was 6.95 ms in daylight, 6.84 ms in night flight and 3.79 ms at the night dock. [Render measurements](evidence/inlet-after-dark-timing.json)

At first, switching to night and dropping below 45 m made Three compile up to 32 programs during flight. The largest frame gap in those tests was 433 ms. Keeping the same lights and station materials in both modes brought the longest gap to 16.8 ms in two development runs at each viewport. Across three fresh browser processes with the driver cache retained, median scene setup grew by 62 ms on desktop and 65 ms in portrait. The first observed desktop setup with the new shaders took 2.73 seconds. [First-flight measurements](evidence/inlet-night-transition.json)

The vermilion-and-linen biplane stays legible against slate mountains and turquoise water. Its ailerons, rigging, and floats need to hold up when the pilot orbits the aircraft at a dock. Static parts sharing a material are batched. Moving parts keep their hinges. [Aircraft model](src/aircraft.ts) · [Model inspection](evidence/aircraft-final.json)

Clouds render at a lower resolution and are composited against the full-resolution scene depth to keep mountain edges sharp. A frozen camera sweep of the earlier renderer traced shoreline shimmer to depth precision and overlapping terrain. Moving the near clip to eight metres, removing the overlap, and filtering distant surface detail reduced mean near-shore pixel variation by about 43% in that earlier version. [Composite](src/composite.ts) · [World geometry and materials](src/world.ts) · [Shoreline measurements](evidence/shore-optimized-variation.json)

Preparing the shadow pass at startup trades a longer first load for a smoother first touchdown. In the earlier seed-42 shadow-pass measurements on one Mac, the worst touchdown frame fell from 133 ms to 33 ms while time to ready rose from 888 ms to 1,123 ms. These are local runs with a fixed input path. Portrait measurements used touch emulation. [Before](evidence/migration-timing-before.json) · [After](evidence/migration-timing-after.json)

Terrain tiles share their index buffers, and the renderer culls shoreline stones and reeds separately at each destination. Visible runoff follows the frame clock while the watershed updates its strength every hydrology step. [Earlier desktop and phone measurements](evidence/shore-rendering-performance.json)
