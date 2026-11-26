/** Nonblocking GPU timings. No readback, no gl.finish, and no query polling stalls. */
export class RenderMetrics {
  private gl: WebGL2RenderingContext;
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: WebGLQuery[] = [];
  private active?: WebGLQuery;
  private cpuStart = 0;
  private cpu: number[] = [];
  private gpu: number[] = [];
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  }
  begin() {
    const gl = this.gl,
      ext = this.ext;
    if (ext) {
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (this.pending.length) {
        const q = this.pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        this.pending.shift();
        if (!disjoint)
          this.record(this.gpu, gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
      }
      if (disjoint) {
        this.pending.forEach((q) => gl.deleteQuery(q));
        this.pending.length = 0;
      }
      if (this.pending.length < 6) {
        this.active = gl.createQuery() ?? undefined;
        if (this.active) gl.beginQuery(ext.TIME_ELAPSED_EXT, this.active);
      }
    }
    this.cpuStart = performance.now();
  }
  end() {
    this.record(this.cpu, performance.now() - this.cpuStart);
    if (this.active && this.ext) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this.active);
      this.active = undefined;
    }
  }
  private record(samples: number[], value: number) {
    samples.push(value);
    if (samples.length > 180) samples.shift();
  }
  stats() {
    const summary = (samples: number[]) => {
      if (!samples.length) return null;
      const sorted = [...samples].sort((a, b) => a - b);
      return {
        medianMs: sorted[Math.floor(sorted.length * 0.5)],
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      };
    };
    return {
      cpuSubmit: summary(this.cpu),
      gpu: summary(this.gpu),
      gpuTimerAvailable: !!this.ext,
    };
  }
}
