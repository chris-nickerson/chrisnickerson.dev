import positions from "./positions.json";
import easternLight from "./relief-east.webp";
import easternLightSmall from "./relief-east-small.webp";

const model = document.querySelector<HTMLElement>(".model")!;
const controls = document.querySelector<HTMLElement>(".instruments")!;
const light = document.querySelector<HTMLInputElement>("#light")!;
const direction = document.querySelector<HTMLOutputElement>("#direction")!;
const caption = document.querySelector<HTMLElement>("#caption")!;
const detail = document.querySelector<HTMLElement>("#detail")!;

const east = new Image(1800, 1130);
east.className = "east";
east.alt = "";
model.append(east);
light.addEventListener("input", () => {
  if (!east.hasAttribute("src") && light.valueAsNumber > 0) {
    east.sizes = model.querySelector("img")!.sizes;
    east.srcset = `${easternLightSmall} 900w, ${easternLight} 1800w`;
    east.src = easternLight;
  }
  const mix = light.valueAsNumber;
  east.style.opacity = String(mix / 100);
  direction.value =
    mix === 0 ? "West" : mix === 100 ? "East" : `${100 - mix}% W · ${mix}% E`;
  light.setAttribute("aria-valuetext", direction.value);
});

const descriptions = {
  memory: "The southern berth on the field-station shore.",
  workshop: "The eastern berth, across the water from the island.",
  dock: "The berth off the island’s western shore.",
};
type Place = keyof typeof positions;
const buttons = Array.from(
  controls.querySelectorAll<HTMLButtonElement>("[data-view]"),
);
const overviewCaption = caption.textContent;
const overviewDetail = detail.textContent;
function locate(place: Place | "overview") {
  const zoom = place === "overview" ? 1 : 2.45;
  const [x, y] = place === "overview" ? [50, 50] : positions[place];
  model.style.transform = `translate(${50 - x * zoom}%, ${50 - y * zoom}%) scale(${zoom})`;
  model.style.setProperty("--pin-scale", String(1 / zoom));
  for (const button of buttons) {
    const active = button.dataset.view === place;
    button.setAttribute("aria-pressed", String(active));
    if (active)
      caption.textContent =
        place === "overview" ? overviewCaption : button.lastChild!.textContent;
  }
  model.querySelectorAll<HTMLButtonElement>(".pin").forEach((pin) => {
    pin.hidden = place !== "overview" && pin.dataset.view !== place;
  });
  detail.textContent =
    place === "overview" ? overviewDetail : descriptions[place];
}
for (const button of buttons) {
  const place = button.dataset.view as Place | "overview";
  button.addEventListener("click", () => locate(place));
  if (place === "overview") continue;
  const [x, y] = positions[place];
  const pin = document.createElement("button");
  pin.type = "button";
  pin.className = "pin";
  pin.dataset.view = place;
  pin.style.left = `${x}%`;
  pin.style.top = `${y}%`;
  pin.textContent = button.firstElementChild!.textContent;
  pin.setAttribute("aria-label", `Locate ${button.lastChild!.textContent}`);
  pin.addEventListener("click", () => locate(place));
  model.append(pin);
}
locate("overview");
controls.hidden = false;
