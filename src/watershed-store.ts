import { SAVE_KEY, type Watershed } from "./hydrology";

export class WatershedStore {
  available = true;
  private previous: string | null = null;

  constructor(
    private readonly storage: () => Pick<Storage, "getItem" | "setItem">,
  ) {}

  load(watershed: Watershed) {
    try {
      this.previous = this.storage().getItem(SAVE_KEY);
    } catch {
      this.available = false;
      return;
    }
    if (this.previous !== null) {
      try {
        watershed.restore(JSON.parse(this.previous));
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
  }

  save(watershed: Watershed, reset = false) {
    try {
      const storage = this.storage();
      const snapshot = JSON.stringify(watershed.snapshot());
      if (
        !reset &&
        (snapshot === this.previous ||
          storage.getItem(SAVE_KEY) !== this.previous)
      )
        return;
      storage.setItem(SAVE_KEY, snapshot);
      this.previous = snapshot;
      this.available = true;
    } catch {
      this.available = false;
    }
  }
}
