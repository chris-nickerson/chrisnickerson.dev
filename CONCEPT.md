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

## What the renderer spends

The vermilion-and-linen biplane stays legible against slate mountains and turquoise water. Its ailerons, rigging, and floats need to hold up when the pilot orbits the aircraft at a dock. Static parts sharing a material are batched. Moving parts keep their hinges. [Aircraft model](src/aircraft.ts) · [Model inspection](evidence/aircraft-final.json)

Clouds render at a lower resolution and are composited against the full-resolution scene depth to keep mountain edges sharp. A frozen camera sweep traced shoreline shimmer to depth precision and overlapping terrain. Moving the near clip to eight metres, removing the overlap, and filtering distant surface detail reduced mean near-shore pixel variation by about 43% on that sweep. [Composite](src/composite.ts) · [World geometry and materials](src/world.ts) · [Shoreline measurements](evidence/shore-optimized-variation.json)

Preparing the shadow pass at startup trades a longer first load for a smoother first touchdown. On the same Mac and seed-42 desktop flight, the worst measured touchdown frame fell from 133 ms to 33 ms while time to ready rose from 888 ms to 1,123 ms. These are local runs with a fixed input path. Portrait measurements used touch emulation. [Before](evidence/migration-timing-before.json) · [After](evidence/migration-timing-after.json)

Terrain tiles share their index buffers, and the renderer culls shoreline stones and reeds separately at each destination. Visible runoff follows the frame clock while the watershed updates its strength every hydrology step. [Matched desktop and phone measurements](evidence/shore-rendering-performance.json)
