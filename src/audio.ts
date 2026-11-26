export class Soundscape {
  private ctx?: AudioContext;
  private master?: GainNode;
  private engine?: OscillatorNode;
  private filter?: BiquadFilterNode;
  private windGain?: GainNode;
  private motorGain?: GainNode;
  private waterNoise?: GainNode;
  private nextCall = 3;
  enabled = false;
  async toggle() {
    if (!this.ctx) {
      const ctx = (this.ctx = new AudioContext());
      const gain = (this.master = ctx.createGain());
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
        data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        brown = (brown + Math.random() * 0.04 - 0.02) / 1.02;
        data[i] = brown * 3;
      }
      const wind = ctx.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;
      const filter = (this.filter = ctx.createBiquadFilter());
      filter.type = "lowpass";
      filter.frequency.value = 650;
      wind.connect(filter);
      this.windGain = ctx.createGain();
      filter.connect(this.windGain).connect(gain);
      const wash = ctx.createBiquadFilter();
      wash.type = "bandpass";
      wash.frequency.value = 880;
      wash.Q.value = 0.7;
      this.waterNoise = ctx.createGain();
      this.waterNoise.gain.value = 0;
      wind.connect(wash).connect(this.waterNoise).connect(gain);
      wind.start();
      const motor = (this.engine = ctx.createOscillator());
      motor.type = "sawtooth";
      motor.frequency.value = 45;
      const motorFilter = ctx.createBiquadFilter();
      motorFilter.type = "lowpass";
      motorFilter.frequency.value = 145;
      const motorGain = (this.motorGain = ctx.createGain());
      motorGain.gain.value = 0.045;
      motor.connect(motorFilter).connect(motorGain).connect(gain);
      motor.start();
    }
    const ctx = this.ctx;
    try {
      await ctx.resume();
    } catch (error) {
      if (this.ctx === ctx) throw error;
      return false;
    }
    if (this.ctx !== ctx) return false;
    this.enabled = !this.enabled;
    this.master!.gain.setTargetAtTime(
      this.enabled ? 0.22 : 0,
      this.ctx.currentTime,
      0.5,
    );
    return this.enabled;
  }
  stop() {
    this.enabled = false;
    void this.ctx?.close();
    this.ctx = undefined;
  }
  groveReached() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    for (const [i, hz] of [523.25, 659.25, 783.99].entries()) {
      const note = this.ctx.createOscillator(),
        envelope = this.ctx.createGain();
      note.type = "sine";
      note.frequency.value = hz;
      const at = now + i * 0.13;
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(0.1, at + 0.035);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 1.3);
      note.connect(envelope).connect(this.master!);
      note.start(at);
      note.stop(at + 1.35);
      note.onended = () => {
        note.disconnect();
        envelope.disconnect();
      };
    }
  }
  private trumpet(distance: number, pan: number, time: number) {
    const ctx = this.ctx!;
    if (time < this.nextCall || distance > 800) return;
    this.nextCall =
      (time > 65 ? 9 : 0) +
      time +
      3.3 +
      2.8 * (0.5 + 0.5 * Math.sin(time * 3.4));
    const voice = ctx.createOscillator(),
      filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain(),
      stereo = ctx.createStereoPanner();
    const now = ctx.currentTime,
      delay = distance / 345;
    const level = 0.21 / (1 + (distance / 160) ** 1.7);
    const base = 326 + 44 * Math.sin(time * 1.07);
    voice.type = "sawtooth";
    filter.type = "lowpass";
    filter.frequency.value = 680 + 600 / (1 + distance / 100);
    stereo.pan.value = Math.max(-1, Math.min(1, pan)) * 0.85;
    const at = now + delay;
    envelope.gain.value = 0.0001;
    for (const [offset, length, strength, hz] of [
      [0, 0.15, 0.58, base],
      [0.19, 0.32, 1, base * 1.09],
    ]) {
      const t = at + offset;
      voice.frequency.setValueAtTime(hz * 0.83, t);
      voice.frequency.exponentialRampToValueAtTime(hz, t + 0.045);
      voice.frequency.exponentialRampToValueAtTime(hz * 0.86, t + length);
      envelope.gain.setValueAtTime(0.0001, t);
      envelope.gain.exponentialRampToValueAtTime(level * strength, t + 0.045);
      envelope.gain.exponentialRampToValueAtTime(0.0001, t + length);
    }
    voice
      .connect(filter)
      .connect(envelope)
      .connect(stereo)
      .connect(this.master!);
    voice.start(at);
    voice.stop(at + 0.52);
    voice.onended = () => {
      voice.disconnect();
      filter.disconnect();
      envelope.disconnect();
      stereo.disconnect();
    };
  }
  update(
    speed: number,
    paused: boolean,
    surface?: {
      water: boolean;
      throttle: number;
      exposure: number;
      distance: number;
      pan: number;
      time: number;
    },
  ) {
    if (!this.ctx) return;
    if (surface && this.enabled && !paused) {
      this.windGain!.gain.setTargetAtTime(
        surface.water
          ? 0.19 + 0.46 * surface.exposure + 0.28 * Math.min(1, speed / 18)
          : 1,
        this.ctx.currentTime,
        0.6,
      );
      this.trumpet(surface.distance, surface.pan, surface.time);
      this.motorGain!.gain.setTargetAtTime(
        surface.water ? surface.throttle * 0.045 : 0.045,
        this.ctx.currentTime,
        0.35,
      );
      this.waterNoise!.gain.setTargetAtTime(
        surface.water
          ? (0.15 + surface.exposure * 2) * Math.min(1, speed / 18)
          : 0,
        this.ctx.currentTime,
        0.3,
      );
    }
    this.engine!.frequency.setTargetAtTime(
      30 + speed * 0.38,
      this.ctx.currentTime,
      0.3,
    );
    this.filter!.frequency.setTargetAtTime(
      300 + speed * 7,
      this.ctx.currentTime,
      0.3,
    );
    this.master!.gain.setTargetAtTime(
      this.enabled && !paused ? 0.22 : 0,
      this.ctx.currentTime,
      0.3,
    );
  }
}
