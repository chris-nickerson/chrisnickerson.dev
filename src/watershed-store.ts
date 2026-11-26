import { SAVE_KEY, type Watershed } from "./hydrology";

export class WatershedStore {
  available = true;
  private incompatible = false;
  private savedDelivery: number | undefined = 0;
  private previous: string | null = null;

  constructor(
    private readonly storage: () => Pick<Storage, "getItem" | "setItem">,
    private readonly isFocused: () => boolean = () => false,
  ) {}

  private adopt(watershed: Watershed, stored: string | null) {
    this.previous = stored;
    this.incompatible = false;
    this.savedDelivery = undefined;
    this.available = true;
    if (stored === null) {
      watershed.clear();
      this.savedDelivery = 0;
      return true;
    }
    let data: unknown;
    try {
      data = JSON.parse(stored);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return false;
    }
    if (
      typeof data === "object" &&
      data !== null &&
      "version" in data &&
      typeof data.version === "number" &&
      Number.isInteger(data.version) &&
      data.version > 1
    ) {
      this.incompatible = true;
      this.available = false;
      return false;
    }
    if (!watershed.restore(data)) return false;
    this.savedDelivery = watershed.delivered;
    return true;
  }

  refresh(watershed: Watershed) {
    try {
      const stored = this.storage().getItem(SAVE_KEY);
      if (stored !== this.previous) return this.adopt(watershed, stored);
    } catch {
      this.available = false;
    }
    return false;
  }

  save(
    watershed: Watershed,
    reason: "periodic" | "blur" | "reset" = "periodic",
  ) {
    try {
      const storage = this.storage();
      if (reason !== "reset") {
        const stored = storage.getItem(SAVE_KEY);
        if (stored !== this.previous) {
          return this.adopt(watershed, stored);
        }
        if (this.incompatible) return false;
        if (
          reason === "periodic" &&
          this.savedDelivery === watershed.delivered &&
          !this.isFocused()
        ) {
          this.available = true;
          return false;
        }
      }
      const snapshot = JSON.stringify(watershed.snapshot());
      if (snapshot !== this.previous || reason === "reset")
        storage.setItem(SAVE_KEY, snapshot);
      this.incompatible = false;
      this.savedDelivery = watershed.delivered;
      this.previous = snapshot;
      this.available = true;
    } catch {
      this.available = false;
    }
    return false;
  }
}
