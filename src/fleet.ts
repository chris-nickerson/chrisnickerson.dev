export const fleet = {
  survey: {
    name: "Survey Biplane",
    description:
      "An open cockpit, fabric wings, and a laminated timber propeller.",
  },
  alder: {
    name: "Alder Courier",
    description: "A high-wing cabin plane in spruce enamel and warm ivory.",
  },
  marlin: {
    name: "Marlin Twin",
    description:
      "A coastal twin with polished nacelles and a pair of amber-tipped fins.",
  },
} as const;
export type AircraftId = keyof typeof fleet;
export function isAircraftId(value: unknown): value is AircraftId {
  return typeof value === "string" && Object.hasOwn(fleet, value);
}
