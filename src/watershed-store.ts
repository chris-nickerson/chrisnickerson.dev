import { SAVE_KEY, type Watershed } from "./hydrology";

export class WatershedStore {
  available = true;
  private incompatible = false;
  private previous: string | null = null;

  constructor(
    private readonly storage: () => Pick<Storage, "getItem" | "setItem">,
  ) {}

  private adopt(watershed: Watershed, stored: string | null) {
    this.previous = stored;
    this.incompatible = false;
    if (stored === null) {
      watershed.clear();
      this.available = true;
      return true;
    }
    try {
      this.available = watershed.restore(JSON.parse(stored));
      this.incompatible = !this.available;
      return this.available;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      this.available = true;
      return false;
    }
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

  save(watershed: Watershed, reset = false) {
    try {
      const storage = this.storage();
      if (!reset) {
        const stored = storage.getItem(SAVE_KEY);
        if (stored !== this.previous) {
          return this.adopt(watershed, stored);
        }
        if (this.incompatible) return false;
      }
      const snapshot = JSON.stringify(watershed.snapshot());
      if (snapshot !== this.previous || reset)
        storage.setItem(SAVE_KEY, snapshot);
      this.incompatible = false;
      this.previous = snapshot;
      this.available = true;
    } catch {
      this.available = false;
    }
    return false;
  }
}
