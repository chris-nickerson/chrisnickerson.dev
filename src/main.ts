import { bindFlightControls } from "./flight-controls";
import "./style.css";
import { animateEclipse } from "./eclipse";
import { placeContent, populateProfile, renderStory } from "./profile-view";
import { fleet, isAircraftId, type AircraftId } from "./fleet";
import { Soundscape } from "./audio";
import type { Quality, Simulation } from "./simulation";
import type { PlaceId } from "./places";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
animateEclipse();
const experience = $("experience"),
  sound = new Soundscape();
let sim: Simulation | undefined;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let toastTimer = 0;
let dialogSession:
  | { dialog: HTMLDialogElement; pauseOnClose: boolean }
  | undefined;
let announcedGrove = -1;
let announcedLanding = 0;
function toast(text: string) {
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => $("toast").classList.remove("visible"),
    3500,
  );
}
populateProfile();
const aircraftKey = "chris-home.aircraft";
let chosenAircraft: AircraftId = "survey";
try {
  const saved = localStorage.getItem(aircraftKey);
  if (isAircraftId(saved)) chosenAircraft = saved;
} catch {
  /* The hangar also works without local storage. */
}
const hangarOptions = $("hangar-options");
for (const [id, model] of Object.entries(fleet)) {
  const card = document.createElement("button");
  card.type = "button";
  card.dataset.aircraft = id;
  card.setAttribute("aria-pressed", String(id === chosenAircraft));
  const preview = document.createElement("img");
  preview.src = `${import.meta.env.BASE_URL}images/aircraft-${id}.webp`;
  preview.alt = "";
  preview.loading = "lazy";
  preview.width = 560;
  preview.height = 340;
  const caption = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = model.name;
  const description = document.createElement("small");
  description.textContent = model.description;
  caption.append(name, description);
  card.append(preview, caption);
  hangarOptions.append(card);
}
hangarOptions.addEventListener("click", (event) => {
  const card = (event.target as HTMLElement).closest("button");
  const id = card?.dataset.aircraft;
  if (!sim || !isAircraftId(id)) return;
  sim.selectAircraft(id);
  chosenAircraft = id;
  try {
    localStorage.setItem(aircraftKey, id);
  } catch {
    /* Session selection remains active. */
  }
  hangarOptions
    .querySelectorAll("button")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.aircraft === id),
      ),
    );
  $("scene").setAttribute(
    "aria-label",
    `${fleet[id].name} over an alpine inlet`,
  );
  closeDialog();
  if (!sim.flight.assisted && !sim.arrival)
    $("scene").focus({ preventScroll: true });
  toast(fleet[id].name);
});
function closeDialog() {
  if (!dialogSession) return;
  const { dialog, pauseOnClose } = dialogSession;
  dialogSession = undefined;
  dialog.close();
  sim?.setPaused(pauseOnClose);
  updateUI();
}
function openDialog(id: string) {
  releaseControls();
  const dialog = $(id) as HTMLDialogElement;
  const pauseOnClose =
    dialogSession?.pauseOnClose ?? sim?.paused ?? reduced.matches;
  dialogSession?.dialog.close();
  dialogSession = { dialog, pauseOnClose };
  sim?.setPaused(true);
  sound.update(sim?.flight.speed ?? 50, true);
  dialog.showModal();
  dialog.scrollTop = 0;
}
document
  .querySelectorAll<HTMLButtonElement>("[data-open]")
  .forEach((button) =>
    button.addEventListener("click", () => openDialog(button.dataset.open!)),
  );
document.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) => {
  dialog.querySelector(".close")!.addEventListener("click", closeDialog);
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        closeDialog();
    }
  });
  dialog.addEventListener("close", () => {
    // Replacing one sheet queues its close event after the next sheet opens.
    if (dialogSession?.dialog === dialog && !dialog.open) closeDialog();
  });
});
function endLoading() {
  document.documentElement.classList.remove("awaiting-flight");
}
$("skip").addEventListener("click", (event) => {
  event.preventDefault();
  endLoading();
  openDialog("about");
  $("about-heading").focus();
});
function updateUI() {
  const flight = sim?.flight,
    arrival = sim?.arrival,
    map = !!sim?.map,
    landed = !!sim?.landed;
  const pilot = !!flight && !flight.assisted;
  experience.classList.toggle("visiting", !!arrival);
  experience.classList.toggle("piloting", pilot);
  experience.classList.toggle("map-view", map);
  (document.querySelector(".introduction") as HTMLElement).inert = pilot;
  $("pilot-help").hidden = !pilot;
  $("touch-controls").hidden = !pilot || map;
  $("fly").querySelector("span")!.textContent = pilot
    ? "You’re flying"
    : "Go flying";
  $("watershed-panel").hidden = !map;
  $("view").setAttribute("aria-pressed", String(map));
  $("view").querySelector("span")!.textContent = map
    ? "Back to flight"
    : "Watershed";
  $("place-panel").hidden = !arrival || arrival.stage === "approach";
  $("autopilot").hidden = arrival ? arrival.stage !== "approach" : !pilot;
  $("autopilot").textContent = arrival ? "Back to the sky" : "Let it fly";
  experience.classList.toggle("on-water", landed);
  experience.classList.toggle(
    "settled-water",
    landed &&
      !!flight &&
      flight.waterTime > 7 &&
      !flight.shoreBlocked &&
      !flight.takingOff,
  );
  experience.classList.toggle(
    "landing-approach",
    !!sim?.manualApproach && !landed,
  );
  $("reset-view").hidden = !sim?.lookingAround;
  $("pilot-power").hidden = !!arrival || map || !pilot;
  $("landing-panel").hidden =
    !!arrival || map || (!landed && !sim?.manualApproach);
  updateRainUI();
  const paused = !!sim?.paused,
    water = !!sim?.manualWater;
  $("pause").setAttribute("aria-pressed", String(paused));
  $("pause").setAttribute(
    "aria-label",
    paused ? "Resume simulation" : "Pause simulation",
  );
  $("pause").querySelector("span")!.textContent = paused ? "Resume" : "Pause";
  $("water").setAttribute("aria-pressed", String(water));
  $("water").querySelector("span")!.textContent = water
    ? "Water flowing"
    : "Release water";
  if (!sim || !flight) return;
  if (document.activeElement !== $("throttle"))
    $<HTMLInputElement>("throttle").value = String(
      Math.round(flight.throttle * 100),
    );
  $("power-value").textContent = `${Math.round(flight.throttle * 100)}%`;
  $("takeoff").hidden = !landed;
  $<HTMLButtonElement>("takeoff").disabled = flight.takingOff;
  $("takeoff").textContent = flight.takingOff ? "Gathering speed…" : "Take off";
  const nearby = sim.nearestLandingPlace();
  $("landing-story").hidden = !landed || !nearby || flight.speed > 12;
  $("landing-story").textContent = nearby
    ? placeContent[nearby].action
    : "Read the story";
  $("landing-kicker").textContent = landed
    ? nearby
      ? placeContent[nearby].title
      : "The inlet"
    : "Your approach · " + placeContent[sim.manualApproach ?? "memory"].title;
  $("landing-title").textContent = landed
    ? flight.takingOff
      ? "Back to the sky."
      : "On the water."
    : "Set it down gently.";
  $("landing-guidance").textContent = landed
    ? flight.shoreBlocked
      ? "Shallow water ahead. Steer back toward the inlet."
      : flight.takingOff
        ? "Full power. Let the floats run, then lift away."
        : matchMedia("(pointer: coarse)").matches
          ? "Power idled. Use the stick to steer."
          : "Use A / D to steer. Add power to taxi."
    : flight.position.y < 26
      ? "Gently lift the nose. Let the floats meet the water."
      : "Ease the power down. Level the wings and descend toward the open water.";
  if (landed && flight.landingCount !== announcedLanding) {
    announcedLanding = flight.landingCount;
    toast(
      flight.touchdownSink < 3
        ? "Nice landing."
        : "On the floats. Let the water slow you down.",
    );
  }
  $("altitude").textContent = Math.round(flight.position.y).toString();
  $("airspeed").textContent = Math.round(flight.speed * 1.94384).toString();
  $("compass-needle").style.transform =
    `rotate(${(flight.heading * 180) / Math.PI}deg)`;
  $("world-status").textContent = arrival
    ? arrival.stage === "approach"
      ? "On final approach · " + placeContent[arrival.place].title
      : "On the water · " + placeContent[arrival.place].title
    : landed
      ? flight.takingOff
        ? "Taking off · you can still steer"
        : "On the water · you have the controls"
      : sim.paused
        ? "Paused"
        : map
          ? "Watershed map"
          : !flight.assisted
            ? "You have the controls"
            : "Automatic flight";
  $("watered").textContent = sim.watershed.wateredCells.toString();
  $("released").textContent = Math.round(
    sim.watershed.delivered,
  ).toLocaleString();
  $("persistence-note").textContent = sim.storageAvailable
    ? "Soil moisture is saved on this device."
    : "This browser can’t save soil moisture between visits.";
  $("performance").textContent =
    `${sim.paused ? "Paused" : Math.round(sim.fps) + " fps"} · ${sim.world.treeCount.toLocaleString()} trees · ${sim.renderer.getPixelRatio().toFixed(2)}× render scale`;
  sound.update(
    flight.speed,
    sim.paused || document.hidden,
    sim.soundPosition(),
  );
}
function updateRainUI() {
  const active = !!sim?.rainRun.active,
    hidden = !active || !!sim?.map;
  $("rain-panel").hidden = hidden;
  experience.classList.toggle("rain-running", active);
  $("water-aim").hidden = hidden;
  $("grove-label").hidden = hidden;
  if (!sim || !active) return;
  const run = sim.rainRun;
  if (run.complete && announcedGrove !== run.index) {
    announcedGrove = run.index;
    sound.groveReached();
    toast(`${run.grove.name} is taking root.`);
  }
  $("rain-count").textContent = `Grove ${run.index + 1} of 3`;
  $("rain-name").textContent = run.finished
    ? "All three groves watered"
    : run.grove.name;
  $("rain-instruction").textContent = run.complete
    ? "This grove has enough water."
    : run.missed
      ? "You passed the grove. Try another pass."
      : sim.watering
        ? "Releasing water."
        : run.aimed
          ? "Right here. Hold Space or Spray."
          : "Bring the small cross into the outlined grove.";
  const percent = Math.round(run.progress * 100);
  $("rain-progress-fill").style.width = `${percent}%`;
  document
    .querySelector(".rain-progress")!
    .setAttribute("aria-valuenow", String(percent));
  $("rain-percent").textContent = `${percent}% watered`;
  $("rain-next").hidden = !run.complete;
  $("rain-next").textContent = run.finished
    ? "Land at the field station"
    : "Next grove";
  $("rain-retry").hidden = run.complete || !run.missed;
  const guide = sim.rainGuide();
  for (const [id, p] of [
    ["water-aim", guide.aim],
    ["grove-label", guide.grove],
  ] as const) {
    $(id).hidden =
      !p.visible ||
      sim.map ||
      (id === "grove-label" && (guide.distance < 350 || run.complete));
    $(id).style.left = `${p.x}px`;
    $(id).style.top = `${p.y}px`;
  }
  $("water-aim").classList.toggle("on-target", run.aimed);
  $("grove-label-name").textContent = run.complete
    ? "Taking root"
    : run.grove.name;
  $("grove-distance").textContent = `${Math.round(guide.distance / 10) * 10} m`;
}
async function travel(move: (simulation: Simulation) => void) {
  if (!sim) return;
  closeDialog();
  $("travel-veil").classList.add("cover");
  await new Promise<void>((resolve) =>
    setTimeout(resolve, reduced.matches ? 0 : 380),
  );
  if (!sim) return;
  move(sim);
  updateUI();
  requestAnimationFrame(() => $("travel-veil").classList.remove("cover"));
}
function startRainRun(index = 0, fresh = false) {
  return travel((simulation) => {
    if (fresh) announcedGrove = -1;
    simulation.startRainRun(index, fresh);
    setPilot(true);
  });
}
$("start-run").addEventListener("click", () => startRainRun(0, true));
$("rain-next").addEventListener("click", () => {
  if (!sim) return;
  if (sim.rainRun.finished) visit("memory");
  else startRainRun(sim.rainRun.index + 1);
});
$("rain-retry").addEventListener("click", () => {
  if (sim) startRainRun(sim.rainRun.index);
});
$("end-run").addEventListener("click", () => setPilot(false));
function setPilot(pilot: boolean) {
  if (!sim) return;
  if (sim.landed && !pilot) {
    sim.flight.setThrottle(0);
    releaseControls();
    sim.resetView();
    updateUI();
    return;
  }
  if (sim.arrival) {
    depart();
    return;
  }
  if (!pilot) releaseControls();
  sim.setPilot(pilot);
  if (pilot) {
    sim.setPaused(false);
    if (sim.map) sim.setMap(false);
    $("scene").focus({ preventScroll: true });
    toast(
      matchMedia("(pointer:coarse)").matches
        ? "Use the stick to bank, climb, or descend."
        : "W / S to climb and descend. A / D to bank.",
    );
  }
  updateUI();
}
function toggleView() {
  if (!sim || sim.arrival) return;
  sim.setMap(!sim.map);
  updateUI();
}
function togglePause() {
  if (!sim) return;
  sim.setPaused(!sim.paused);
  updateUI();
}
function toggleWater() {
  if (!sim || sim.arrival || sim.flight.onWater) return;
  sim.toggleWater();
  if (sim.manualWater && sim.paused)
    toast("Resume the simulation to release water.");
  else if (sim.manualWater) toast("Aim for the hillside to water it.");
  updateUI();
}
$("autopilot").addEventListener("click", () => setPilot(false));
$("fly").addEventListener("click", () => setPilot(true));
$("view").addEventListener("click", toggleView);
$("pause").addEventListener("click", togglePause);
$("water").addEventListener("click", toggleWater);
$("fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await experience.requestFullscreen();
  } catch {
    toast("Full screen is not available in this browser.");
  }
});
document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  $("fullscreen").setAttribute("aria-pressed", String(active));
  $("fullscreen").setAttribute(
    "aria-label",
    active ? "Exit full screen" : "Enter full screen",
  );
});
function showSound(enabled: boolean) {
  $("sound").setAttribute("aria-pressed", String(enabled));
  $("sound").setAttribute(
    "aria-label",
    enabled ? "Disable sound" : "Enable sound",
  );
  $("sound").querySelector("span")!.textContent = enabled
    ? "Sound on"
    : "Sound off";
}
$("sound").addEventListener("click", async () => {
  try {
    showSound(await sound.toggle());
    updateUI();
  } catch {
    toast("Sound isn’t available in this browser.");
  }
});
$("quality").addEventListener("change", (e) => {
  sim?.setQuality((e.target as HTMLSelectElement).value as Quality);
  updateUI();
});
$("grow").addEventListener("click", () => {
  if (!sim) return;
  sim.growing = !sim.growing;
  $("grow").setAttribute("aria-pressed", String(sim.growing));
  $("growth-label").textContent = sim.growing
    ? "Normal speed"
    : "Watch it grow";
  if (sim.paused) {
    sim.setPaused(false);
    updateUI();
  }
});
$("reset-world").addEventListener("click", () => {
  sim?.clear();
  toast("Watershed reset.");
  updateUI();
});
function readStory(id: PlaceId) {
  renderStory(id);
  $("story-visit").onclick = () => visit(id);
  openDialog("story");
}
function visit(id: PlaceId) {
  if (!sim) {
    toast("The flight is still loading. You can read the story now.");
    readStory(id);
    return;
  }
  return travel((simulation) => {
    simulation.visit(id, "fly-in");
    const c = placeContent[id];
    $("place-title").textContent = c.title;
    $("place-subtitle").textContent = c.subtitle;
    $("place-copy").textContent = c.copy;
    $("place-read").textContent = c.action;
    $("scene").focus({ preventScroll: true });
  });
}
function depart() {
  return travel((simulation) => simulation.depart());
}
$("reset-view").addEventListener("click", () => {
  sim?.resetView();
  $("scene").focus({ preventScroll: true });
});
$("takeoff").addEventListener("click", () => {
  sim?.flight.requestTakeoff();
  sim?.setPaused(false);
  $("scene").focus({ preventScroll: true });
  updateUI();
});
$("landing-story").addEventListener("click", () => {
  const id = sim?.nearestLandingPlace();
  if (id) readStory(id);
});
$("throttle").addEventListener("input", () => {
  if (sim) {
    sim.flight.setThrottle(Number($<HTMLInputElement>("throttle").value) / 100);
    updateUI();
  }
});
$("throttle").addEventListener("pointerup", () =>
  $("scene").focus({ preventScroll: true }),
);
$("place-read").addEventListener("click", () => {
  if (sim?.arrival) readStory(sim.arrival.place);
});
$("leave-place").addEventListener("click", depart);
document
  .querySelectorAll<HTMLButtonElement>("[data-visit]")
  .forEach((b) =>
    b.addEventListener("click", () => visit(b.dataset.visit as PlaceId)),
  );
document
  .querySelectorAll<HTMLButtonElement>("[data-story]")
  .forEach((b) =>
    b.addEventListener("click", () => readStory(b.dataset.story as PlaceId)),
  );
const releaseControls = bindFlightControls({
  simulation: () => sim,
  dialogOpen: () => !!dialogSession,
  setPilot, togglePause, toggleView,
  scene: $("scene"), joystick: $("joystick"), spray: $("touch-water"),
});
document.addEventListener("visibilitychange", () =>
  sound.update(sim?.flight.speed ?? 50, document.hidden || !!sim?.paused),
);
function setFlightAvailable(available: boolean) {
  document
    .querySelectorAll<
      HTMLButtonElement | HTMLSelectElement
    >("[data-flight-control], [data-visit]")
    .forEach((control) => (control.disabled = !available));
}
function fallback() {
  const focused = document.activeElement;
  if (sim) {
    sim.stop();
    const finalStats = sim.stats();
    Object.assign(window, {
      __AFTER_RAIN__: { stats: () => structuredClone(finalStats), practiceLanding: () => {} },
    });
    sim = undefined;
  }
  sound.stop();
  if (
    dialogSession &&
    ["hangar", "rain-brief"].includes(dialogSession.dialog.id)
  )
    closeDialog();
  setFlightAvailable(false);
  showSound(false);
  updateUI();
  experience.classList.remove("flight-ready");
  experience.classList.add("fallback-mode");
  $("travel-veil").classList.remove("cover");
  $("story-visit").hidden = true;
  $("fallback-note").hidden = false;
  $("world-status").textContent = "Static view";
  $("performance").textContent = "Graphics unavailable";
  $("scene").hidden = true;
  if (focused?.closest(":disabled, [hidden], dialog:not([open])")) {
    const nextFocus = dialogSession
      ? dialogSession.dialog.querySelector<HTMLButtonElement>(".close")
      : document.querySelector<HTMLButtonElement>(
          '.introduction [data-open="places"]',
        );
    nextFocus?.focus({ preventScroll: true });
  }
}
window.addEventListener("world-context-lost", () => {
  fallback();
  toast("The graphics context was interrupted. Static view is still here.");
});
reduced.addEventListener("change", (e) => {
  if (e.matches) {
    if (dialogSession) dialogSession.pauseOnClose = true;
    sim?.setPaused(true);
    updateUI();
  }
});
document.documentElement.classList.add("profile-ready");
requestAnimationFrame(() =>
  requestAnimationFrame(async () => {
    try {
      if (new URLSearchParams(location.search).has("fallback")) {
        fallback();
        return;
      }
      const { Simulation } = await import("./simulation");
      const started = new Simulation(
        $("scene"),
        reduced.matches,
        chosenAircraft,
      );
      sim = started;
      experience.classList.add("flight-ready");
      $("scene").setAttribute(
        "aria-label",
        `${fleet[chosenAircraft].name} over an alpine inlet`,
      );
      sim.onUpdate = updateUI;
      setFlightAvailable(true);
      if (dialogSession) sim.setPaused(true);
      updateUI();
      Object.assign(window, { __AFTER_RAIN__: {
        stats: () => started.stats(),
        practiceLanding: (id: PlaceId) => {
          if (!sim) return;
          sim.practiceLanding(id);
          setPilot(true);
        },
      }});
    } catch (error) {
      console.error("The world could not start:", error);
      fallback();
    } finally {
      endLoading();
    }
  }),
);
