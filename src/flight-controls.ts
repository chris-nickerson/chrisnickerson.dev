import type { Simulation } from "./simulation";

interface FlightControls {
  simulation: () => Simulation | undefined;
  dialogOpen: () => boolean;
  setPilot: (pilot: boolean) => void;
  togglePause: () => void;
  toggleView: () => void;
  scene: HTMLElement;
  joystick: HTMLElement;
  spray: HTMLElement;
}

export function bindFlightControls({
  simulation,
  dialogOpen,
  setPilot,
  togglePause,
  toggleView,
  scene,
  joystick,
  spray,
}: FlightControls) {
  const keys = new Map<string, string>();
  const steeringKeys = [
    "a",
    "d",
    "s",
    "w",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
  ];
  const controlKeys = [...steeringKeys, "=", "-"];
  let stick: { pointer: number; roll: number; pitch: number } | undefined;
  let sprayPointer: number | undefined;
  let spaceDown = false;
  const knob = joystick.querySelector("i")!;
  function updateSteering() {
    const sim = simulation();
    if (!sim) return;
    const held = new Set(keys.values());
    sim.input.roll =
      stick?.roll ??
      Number(held.has("d") || held.has("arrowright")) -
        Number(held.has("a") || held.has("arrowleft"));
    sim.input.pitch =
      stick?.pitch ??
      Number(held.has("w") || held.has("arrowup")) -
        Number(held.has("s") || held.has("arrowdown"));
    sim.input.throttle = Number(held.has("=")) - Number(held.has("-"));
  }
  function holdWater() {
    const sim = simulation();
    if (sim) sim.heldWater = spaceDown || sprayPointer !== undefined;
  }
  function releaseHeldControls() {
    keys.clear();
    spaceDown = false;
    if (stick && joystick.hasPointerCapture(stick.pointer))
      joystick.releasePointerCapture(stick.pointer);
    if (sprayPointer !== undefined && spray.hasPointerCapture(sprayPointer))
      spray.releasePointerCapture(sprayPointer);
    stick = undefined;
    sprayPointer = undefined;
    knob.style.transform = "";
    holdWater();
    updateSteering();
  }
  window.addEventListener("keydown", (e) => {
    const sim = simulation();
    if (
      dialogOpen() ||
      !sim ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement
    )
      return;
    const k = e.key.toLowerCase();
    if (k === "escape") {
      setPilot(false);
      return;
    }
    if (
      document.activeElement === document.body &&
      steeringKeys.includes(k) &&
      sim.flight.assisted &&
      !sim.arrival &&
      !sim.map
    )
      setPilot(true);
    if (document.activeElement !== scene) return;
    if (sim.arrival && k !== "p" && k !== "r") return;
    if (
      [" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) &&
      !(e.target instanceof HTMLButtonElement)
    )
      e.preventDefault();
    if (e.repeat) return;
    if (k === "r") {
      sim.resetView();
      return;
    }
    if (k === "p") {
      togglePause();
      return;
    }
    if (k === "m") {
      toggleView();
      return;
    }
    if (k === " " && !(e.target instanceof HTMLButtonElement)) {
      spaceDown = true;
      holdWater();
    }
    if (controlKeys.includes(k)) {
      if (sim.flight.assisted) setPilot(true);
      keys.set(e.code || k, k);
      updateSteering();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code) {
      if (keys.delete(event.code)) updateSteering();
    } else {
      for (const [code, key] of keys) {
        if (key === event.key.toLowerCase()) keys.delete(code);
      }
      updateSteering();
    }
    if (event.key === " " && spaceDown) {
      spaceDown = false;
      holdWater();
    }
  });
  function releaseControls() {
    releaseHeldControls();
    simulation()?.stopWater();
  }
  window.addEventListener("blur", releaseControls);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseControls();
  });

  function moveStick(event: PointerEvent) {
    if (!stick || stick.pointer !== event.pointerId) return;
    const r = joystick.getBoundingClientRect();
    stick.roll = Math.max(
      -1,
      Math.min(1, (event.clientX - r.left - r.width / 2) / 40),
    );
    stick.pitch = Math.max(
      -1,
      Math.min(1, (r.top + r.height / 2 - event.clientY) / 40),
    );
    knob.style.transform = `translate(${stick.roll * 32}px,${-stick.pitch * 32}px)`;
    updateSteering();
  }
  joystick.addEventListener("pointerdown", (event) => {
    if (stick || !simulation()) return;
    joystick.setPointerCapture(event.pointerId);
    stick = { pointer: event.pointerId, roll: 0, pitch: 0 };
    moveStick(event);
  });
  joystick.addEventListener("pointermove", moveStick);
  spray.addEventListener("pointerdown", (event) => {
    if (!simulation() || sprayPointer !== undefined) return;
    spray.setPointerCapture(event.pointerId);
    sprayPointer = event.pointerId;
    holdWater();
  });
  for (const type of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const) {
    joystick.addEventListener(type, (event) => {
      if (event.pointerId !== stick?.pointer) return;
      stick = undefined;
      knob.style.transform = "";
      updateSteering();
    });
    spray.addEventListener(type, (event) => {
      if (event.pointerId !== sprayPointer) return;
      sprayPointer = undefined;
      holdWater();
    });
  }
  return { releaseControls, releaseHeldControls };
}
