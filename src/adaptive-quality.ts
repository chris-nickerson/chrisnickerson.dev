type GpuTiming = { medianMs: number; p95Ms: number };

export class AdaptiveQuality {
  private frameTimes: number[] = [];
  private elapsed = 0;
  private recoveryWindows = 0;

  get meanFrameMs() {
    return this.frameTimes.length
      ? this.frameTimes.reduce((sum, ms) => sum + ms, 0) /
          this.frameTimes.length
      : 1000 / 60;
  }

  reset() {
    this.frameTimes.length = 0;
    this.elapsed = 0;
    this.recoveryWindows = 0;
  }

  record(seconds: number) {
    this.frameTimes.push(seconds * 1000);
    if (this.frameTimes.length > 180) this.frameTimes.shift();
    this.elapsed += seconds;
  }

  nextRatio(current: number, base: number, readGpu: () => GpuTiming | null) {
    if (this.elapsed <= 8 || this.frameTimes.length <= 90) return current;
    this.elapsed = 0;
    const gpu = readGpu();
    const mean = this.meanFrameMs;
    if (mean > 22 || (gpu && gpu.medianMs > 15)) {
      this.recoveryWindows = 0;
      return Math.min(current, Math.max(0.8, current * 0.82));
    }
    if (current >= base || mean >= 18 || (gpu && gpu.p95Ms >= 10)) {
      this.recoveryWindows = 0;
      return current;
    }
    if (++this.recoveryWindows < 3) return current;
    this.recoveryWindows = 0;
    return Math.min(base, current * 1.1);
  }
}
