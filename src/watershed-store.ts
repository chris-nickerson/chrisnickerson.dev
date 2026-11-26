import { SAVE_KEY, type Watershed } from "./hydrology";

export class WatershedStore {
  available = true;
  private previous: string | null = null;

  constructor(
    private readonly storage: () => Pick<Storage, "getItem" | "setItem">,
  ) {}

  private adopt(watershed: Watershed, stored: string | null) {
    let snapshot: unknown;
    if (stored !== null) {
      try {
        snapshot = JSON.parse(stored);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    watershed.clear();
    if (snapshot !== undefined) watershed.restore(snapshot);
    this.previous = stored;
  }

  refresh(watershed: Watershed) {
    try {
      const stored = this.storage().getItem(SAVE_KEY);
      if (stored !== this.previous) this.adopt(watershed, stored);
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  save(watershed: Watershed, reset = false) {
    try {
      const storage = this.storage();
      if (!reset) {
        const stored = storage.getItem(SAVE_KEY);
        if (stored !== this.previous) {
          this.adopt(watershed, stored);
          this.available = true;
          return;
        }
      }
      const snapshot = JSON.stringify(watershed.snapshot());
      if (snapshot !== this.previous || reset)
        storage.setItem(SAVE_KEY, snapshot);
      this.previous = snapshot;
      this.available = true;
    } catch {
      this.available = false;
    }
  }
}
