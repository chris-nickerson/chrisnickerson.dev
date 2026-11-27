import positions from "./positions.json";
import eastPlate from "./relief-east.webp";
import eastPlateSmall from "./relief-east-small.webp";

type View = keyof typeof positions | "overview";

const model = document.querySelector<HTMLElement>(".model")!;
const controls = document.querySelector<HTMLElement>(".instruments")!;
const light = document.querySelector<HTMLInputElement>("#light")!;
const direction = document.querySelector<HTMLOutputElement>("#direction")!;
const caption = document.querySelector<HTMLElement>("#caption")!;
const detail = document.querySelector<HTMLElement>("#detail")!;

const west = model.querySelector("img")!;
const east = new Image(1800, 1130);
east.className = "east";
east.alt = "";
east.sizes = west.sizes;
model.append(east);
function updateLighting() {
  const mix = light.valueAsNumber;
  if (mix > 0 && !east.src) {
    east.srcset = `${eastPlateSmall} 900w, ${eastPlate} 1800w`;
    east.src = eastPlate;
  }
  east.style.opacity = String(mix / 100);
  direction.value =
    mix === 0 ? "West" : mix === 100 ? "East" : `${100 - mix}% W · ${mix}% E`;
  light.setAttribute("aria-valuetext", direction.value);
}
light.addEventListener("input", updateLighting);
window.addEventListener("pageshow", updateLighting);
updateLighting();

const overview = { caption: caption.textContent, detail: detail.textContent };
const name = (button: HTMLButtonElement) =>
  button.lastChild!.textContent!.trim();
const buttons = Array.from(
  controls.querySelectorAll<HTMLButtonElement>("[data-view]"),
);
const pins = buttons.flatMap((button) => {
  const view = button.dataset.view as View;
  button.addEventListener("click", () => show(view));
  if (view === "overview") return [];
  const [x, y] = positions[view];
  const pin = document.createElement("button");
  pin.type = "button";
  pin.className = "pin";
  pin.dataset.view = view;
  pin.style.left = `${x}%`;
  pin.style.top = `${y}%`;
  pin.textContent = button.firstElementChild!.textContent;
  pin.setAttribute("aria-label", `Locate ${name(button)}`);
  pin.addEventListener("click", () => show(view));
  model.append(pin);
  return [pin];
});

function show(view: View) {
  const zoom = view === "overview" ? 1 : 2.45;
  const [x, y] = view === "overview" ? [50, 50] : positions[view];
  model.style.transform = `translate(${50 - x * zoom}%, ${50 - y * zoom}%) scale(${zoom})`;
  model.style.setProperty("--pin-scale", String(1 / zoom));
  for (const button of buttons)
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  for (const pin of pins)
    pin.hidden = view !== "overview" && pin.dataset.view !== view;
  const selected = buttons.find((button) => button.dataset.view === view)!;
  caption.textContent = view === "overview" ? overview.caption : name(selected);
  detail.textContent = selected.dataset.detail ?? overview.detail;
}

show("overview");
controls.hidden = false;
