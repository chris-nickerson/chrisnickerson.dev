type GpuTiming = { medianMs: number; p95Ms: number };

export class AdaptiveQuality {
  private frameTimes: number[] = [];
  private elapsed = 0;
  private recoveryWindows = 0;
  private unmeasuredCeiling = Infinity;

  get meanFrameMs() {
    return this.frameTimes.length
      ? this.frameTimes.reduce((sum, ms) => sum + ms, 0) /
          this.frameTimes.length
      : 16.7;
  }

  reset() {
    this.unmeasuredCeiling = Infinity;
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
      const lower = Math.min(current, Math.max(0.8, current * 0.82));
      if (!gpu && lower < current)
        this.unmeasuredCeiling = Math.min(
          this.unmeasuredCeiling,
          (current + lower) / 2,
        );
      return lower;
    }
    const ceiling = gpu ? base : Math.min(base, this.unmeasuredCeiling);
    if (current >= ceiling || mean >= 18 || (gpu && gpu.p95Ms >= 10)) {
      this.recoveryWindows = 0;
      return current;
    }
    if (++this.recoveryWindows < 3) return current;
    this.recoveryWindows = 0;
    return Math.min(ceiling, current * 1.1);
  }
}
