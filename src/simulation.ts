import { CameraFraming } from "./camera-framing";
import { WatershedStore } from "./watershed-store";
import { AdaptiveQuality } from "./adaptive-quality";
import { Migration, inletRoute } from "./migration";
import { flightSeed } from "./valley-wind";
import * as T from "three";
import { FlightPresentation } from "./flight-presentation";
import { RenderMetrics } from "./render-metrics";
import { compositeFragment } from "./composite";
import { Flight, type FlightInput } from "./flight";
import { Watershed, GRID } from "./hydrology";
import { createWorld } from "./world";
import { createAircraft } from "./aircraft";
import type { AircraftId } from "./fleet";
import { createWeather, Runoff } from "./weather";
import { createRivers } from "./rivers";
import { createPlaces, places, type PlaceId } from "./places";
import { RainRun, createGroves } from "./rainrun";
import { SurfaceSpray } from "./surface-spray";
import { WaterRelease } from "./water-release";
import { Arrival, type ArrivalEntry } from "./arrival";
import { clamp, terrainHeight, WORLD_SIZE } from "./terrain";

export type Quality = "auto" | "high" | "low";

export class Simulation {
  readonly seed = flightSeed(location.search, Math.random);
  readonly migration: Migration;
  readonly flight = new Flight();
  readonly presentation = new FlightPresentation();
  readonly watershed = new Watershed();
  readonly renderer: T.WebGLRenderer;
  readonly renderMetrics: RenderMetrics;
  readonly scene = new T.Scene();
  // Eight units preserves distant coast depth precision, well inside the chase-camera standoff.
  readonly camera = new T.PerspectiveCamera(49, 1, 8, 35000);
  readonly input: FlightInput = { roll: 0, pitch: 0, throttle: 0 };
  arrival?: Arrival;
  manualApproach?: PlaceId;
  readonly surfaceSpray: SurfaceSpray;
  readonly water: WaterRelease;
  readonly landmarks: ReturnType<typeof createPlaces>;
  readonly rivers: ReturnType<typeof createRivers>;
  readonly weather: ReturnType<typeof createWeather>;
  readonly runoff: Runoff;
  readonly world: ReturnType<typeof createWorld>;
  aircraft: ReturnType<typeof createAircraft>;
  private readonly hangar = new Map<
    AircraftId,
    ReturnType<typeof createAircraft>
  >();
  readonly rainRun = new RainRun();
  readonly groves: ReturnType<typeof createGroves>;
  paused = false;
  map = false;
  heldWater = false;
  private toggledWater = false;
  get manualWater() {
    return this.toggledWater || this.heldWater;
  }
  toggleWater() {
    this.toggledWater = !this.toggledWater;
  }
  stopWater() {
    this.toggledWater = this.heldWater = false;
  }
  watering = false;
  low = false;
  growing = false;
  groundTime = 0;
  ready = false;
  private readonly storage = new WatershedStore(() => localStorage);
  get storageAvailable() {
    return this.storage.available;
  }
  quality: Quality = "auto";
  fps = 60;
  frameTime = 16.7;
  frames = 0;
  elapsed = 0;
  onUpdate?: (s: Simulation) => void;
  private lifetime = new AbortController();
  private frame = 0;
  private last = 0;
  private accumulator = 0;
  private hydroClock = 0;
  private saveClock = 0;
  private uiClock = 0;
  private readonly framing = new CameraFraming(this.camera);
  private orbit = 0;
  private orbitTarget = 0;
  private tilt = 0;
  private tiltTarget = 0;
  private dragPointer?: number;
  private orbitVelocity = 0;
  private surfaceMix = 0;
  private readonly adaptiveQuality = new AdaptiveQuality();
  private route: T.Line;
  private routePoints = new Float32Array(6000 * 3);
  private routeCount = 0;
  private routeClock = 0;
  private marker: T.Mesh;
  private viewMix = 0;
  private basePixelRatio = 1;
  private opaqueTarget = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType,
    depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
  });
  private cloudTarget = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType,
    depthBuffer: false,
  });
  private screenMaterial: T.ShaderMaterial;
  private clearColor = new T.Color();
  private readonly cloudScene = new T.Scene();
  private screenScene = new T.Scene();
  private screenCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  constructor(
    private host: HTMLElement,
    reduced: boolean,
    public aircraftId: AircraftId = "survey",
  ) {
    this.aircraft = createAircraft(aircraftId);
    this.hangar.set(aircraftId, this.aircraft);
    this.low =
      matchMedia("(max-width: 700px)").matches ||
      (navigator.hardwareConcurrency || 8) <= 4;
    this.paused = reduced;
    this.renderer = new T.WebGLRenderer({
      antialias: !this.low,
      alpha: false,
      powerPreference: "high-performance",
    });
    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      this.renderMetrics = new RenderMetrics(gl);
      // Half-float sample counts can differ from the default framebuffer's capabilities.
      const samples = Array.from(
        gl.getInternalformatParameter(
          gl.RENDERBUFFER,
          gl.RGBA16F,
          gl.SAMPLES,
        ) as Int32Array,
      )
        .filter((n) => n > 0 && n <= 4)
        .sort((a, b) => a - b);
      this.opaqueTarget.samples = (this.low ? samples[0] : samples.at(-1)) ?? 0;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.info.autoReset = false;
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.94;
      this.basePixelRatio = Math.min(devicePixelRatio, this.low ? 1.35 : 1.6);
      this.renderer.setPixelRatio(this.basePixelRatio);
      const screenMaterial = (this.screenMaterial = new T.ShaderMaterial({
        uniforms: {
          uImage: { value: this.opaqueTarget.texture },
          uClouds: { value: this.cloudTarget.texture },
          uDepth: { value: this.opaqueTarget.depthTexture },
          uCloudSize: { value: new T.Vector2() },
          uNearFar: { value: new T.Vector2(this.camera.near, this.camera.far) },
          uProjectionInverse: { value: this.camera.projectionMatrixInverse },
          uCameraWorld: { value: this.camera.matrixWorld },
          uCamera: { value: this.camera.position },
        },
        vertexShader:
          "uniform mat4 uProjectionInverse,uCameraWorld;varying vec2 vUv;varying vec3 vRay;void main(){vUv=uv;vRay=mat3(uCameraWorld)*(uProjectionInverse*vec4(position.xy,1.,1.)).xyz;gl_Position=vec4(position.xy,0.,1.);}",
        fragmentShader: compositeFragment,
        depthTest: false,
        depthWrite: false,
      }));
      this.screenScene.add(
        new T.Mesh(new T.PlaneGeometry(2, 2), screenMaterial),
      );
      this.renderer.domElement.setAttribute("aria-hidden", "true");
      this.storage.load(this.watershed);
      this.world = createWorld(this.scene, this.low, this.watershed, this.seed);
      this.flight.valley = this.world.wind;
      this.flight.enterInlet(inletRoute(this.seed).start);
      this.migration = new Migration(this.world.wind, this.low);
      this.scene.add(this.migration.birds.mesh);
      if (this.migration.wakes) this.scene.add(this.migration.wakes.mesh);
      const envScene = new T.Scene();
      envScene.add(this.world.sky.clone());
      const pmrem = new T.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(envScene, 0, 1, 25000).texture;
      this.scene.environmentIntensity = 0.65;
      pmrem.dispose();
      this.scene.add(this.aircraft.root);
      this.landmarks = createPlaces(this.scene);
      this.rivers = createRivers(this.scene);
      this.weather = createWeather(this.cloudScene, this.low);
      this.runoff = new Runoff(this.scene);
      this.groves = createGroves(this.scene, this.rainRun);
      this.surfaceSpray = new SurfaceSpray(this.scene);
      this.water = new WaterRelease(this.scene, (x, z) => {
        this.watershed.deposit(x, z, 1.0);
        this.rainRun.deposit(x, z, 1.0);
      });
      const rg = new T.BufferGeometry();
      rg.setAttribute("position", new T.BufferAttribute(this.routePoints, 3));
      rg.setDrawRange(0, 0);
      this.route = new T.Line(
        rg,
        new T.LineBasicMaterial({
          color: 0xf6c995,
          transparent: true,
          opacity: 0.7,
          depthTest: false,
        }),
      );
      this.route.visible = false;
      this.route.frustumCulled = false;
      this.scene.add(this.route);
      this.marker = new T.Mesh(
        new T.RingGeometry(36, 43, 40),
        new T.MeshBasicMaterial({
          color: 0xffd8a0,
          side: T.DoubleSide,
          depthTest: false,
        }),
      );
      this.marker.rotation.x = -Math.PI / 2;
      this.marker.visible = false;
      this.scene.add(this.marker);
      this.resize();
      this.resetPresentation();
      this.updateCamera(1, true);
      // Prepare the shadow framebuffer and landing material programs at startup.
      // Otherwise their allocation lands in the first frame after float contact.
      this.render(true);
      this.host.append(this.renderer.domElement);
      const options = { signal: this.lifetime.signal };
      this.host.addEventListener("pointerdown", this.pointerDown, options);
      this.host.addEventListener("dblclick", () => this.resetView(), options);
      window.addEventListener("resize", this.resize, options);
      this.renderer.domElement.addEventListener(
        "webglcontextlost",
        (event) => {
          event.preventDefault();
          this.stop();
          window.dispatchEvent(new Event("world-context-lost"));
        },
        options,
      );
      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.hidden) {
            this.save();
            cancelAnimationFrame(this.frame);
            this.frame = 0;
          } else {
            this.last = 0;
            this.frame = requestAnimationFrame(this.animate);
          }
        },
        options,
      );
      window.addEventListener("pagehide", () => this.save(), options);
      this.ready = true;
      this.frame = requestAnimationFrame(this.animate);
    } catch (error) {
      this.release();
      this.renderer.forceContextLoss();
      throw error;
    }
  }
  selectAircraft(id: AircraftId) {
    if (id === this.aircraftId) return;
    const next = this.hangar.get(id) ?? createAircraft(id);
    this.hangar.set(id, next);
    next.root.position.copy(this.aircraft.root.position);
    next.root.quaternion.copy(this.aircraft.root.quaternion);
    this.scene.remove(this.aircraft.root);
    this.scene.add(next.root);
    this.aircraft = next;
    this.aircraftId = id;
    this.render();
  }
  resize = () => {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.camera.aspect = w / h;
    this.camera.fov = w < 600 ? 62 : 49;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const size = this.renderer.getDrawingBufferSize(new T.Vector2());
    this.opaqueTarget.setSize(size.x, size.y);
    this.world.resizeReflection(size.x, size.y);
    const scale = this.low || this.quality === "low" ? 0.5 : 0.6;
    this.cloudTarget.setSize(
      Math.ceil(size.x * scale),
      Math.ceil(size.y * scale),
    );
    this.screenMaterial.uniforms.uCloudSize.value.set(
      this.cloudTarget.width,
      this.cloudTarget.height,
    );
    if (this.paused) this.render();
  };
  private pointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.dragPointer !== undefined) return;
    this.dragPointer = e.pointerId;
    this.orbitVelocity = 0;
    this.host.focus({ preventScroll: true });
    this.host.setPointerCapture(e.pointerId);
    let x = e.clientX,
      y = e.clientY,
      t = e.timeStamp;
    const move = (m: PointerEvent) => {
      if (m.pointerId !== this.dragPointer) return;
      const dx = ((m.clientX - x) / Math.max(320, this.host.clientWidth)) * 3.2;
      const dy =
        ((m.clientY - y) / Math.max(400, this.host.clientHeight)) * 1.05;
      this.orbitTarget += dx;
      this.tiltTarget = clamp(this.tiltTarget + dy, -0.12, 0.65);
      this.orbitVelocity = clamp(
        dx / Math.max(0.016, (m.timeStamp - t) / 1000),
        -1.5,
        1.5,
      );
      x = m.clientX;
      y = m.clientY;
      t = m.timeStamp;
      if (this.paused) {
        this.orbit = this.orbitTarget;
        this.tilt = this.tiltTarget;
        this.updateCamera(0, true);
        this.render();
      }
    };
    const up = (m: PointerEvent) => {
      if (m.pointerId !== this.dragPointer) return;
      if (m.type !== "pointerup" || m.timeStamp - t > 90 || this.paused)
        this.orbitVelocity = 0;
      this.dragPointer = undefined;
      this.host.removeEventListener("pointermove", move);
      this.host.removeEventListener("pointerup", up);
      this.host.removeEventListener("pointercancel", up);
      this.host.removeEventListener("lostpointercapture", up);
      if (this.host.hasPointerCapture(e.pointerId))
        this.host.releasePointerCapture(e.pointerId);
    };
    const options = { signal: this.lifetime.signal };
    this.host.addEventListener("pointermove", move, options);
    this.host.addEventListener("pointerup", up, options);
    this.host.addEventListener("pointercancel", up, options);
    this.host.addEventListener("lostpointercapture", up, options);
  };
  get lookingAround() {
    return (
      Math.abs(
        Math.atan2(Math.sin(this.orbitTarget), Math.cos(this.orbitTarget)),
      ) > 0.08 || Math.abs(this.tiltTarget) > 0.025
    );
  }
  resetView() {
    this.orbitTarget =
      this.orbit - Math.atan2(Math.sin(this.orbit), Math.cos(this.orbit));
    this.tiltTarget = 0;
    this.orbitVelocity = 0;
    if (this.paused) {
      this.orbit = this.orbitTarget;
      this.tilt = 0;
      this.updateCamera(0, true);
      this.render();
    }
  }
  practiceLanding(id: PlaceId) {
    const p = places[id];
    this.endLeg();
    this.manualApproach = id;
    this.flight.enterManualApproach(p.berth, p.x);
    this.input.roll = this.input.pitch = this.input.throttle = 0;
    this.cutTo(p);
  }
  /** The pilot is on the water under their own control. A guided arrival is afloat without being landed. */
  get landed() {
    return this.flight.onWater && !this.arrival;
  }
  nearestLandingPlace(): PlaceId | undefined {
    if (!this.landed) return;
    let nearest: PlaceId | undefined,
      distance = 450;
    for (const [id, p] of Object.entries(places)) {
      const d = Math.hypot(
        p.berth.x - this.flight.position.x,
        p.berth.z - this.flight.position.z,
      );
      if (d < distance) {
        distance = d;
        nearest = id as PlaceId;
      }
    }
    return nearest;
  }
  setMap(value: boolean) {
    this.map = value;
    this.route.visible = value;
    this.marker.visible = value;
    if (this.paused) {
      this.viewMix = value ? 1 : 0;
      this.updateCamera(1, true);
      this.render();
    }
  }
  setPaused(value: boolean) {
    this.paused = value;
    this.last = 0;
  }
  setPilot(value: boolean) {
    this.flight.assisted = !value;
    if (!value) {
      this.rainRun.stop();
      this.manualApproach = undefined;
    }
    this.resetView();
  }
  setQuality(value: Quality) {
    this.adaptiveQuality.reset();
    this.quality = value;
    this.world.setLowPower(value === "low");
    this.renderer.setPixelRatio(
      value === "low"
        ? 0.8
        : value === "high"
          ? Math.min(devicePixelRatio, 2)
          : this.basePixelRatio,
    );
    this.resize();
  }
  save() {
    this.storage.save(this.watershed);
  }
  clear() {
    this.watershed.clear();
    this.storage.save(this.watershed, true);
    this.world.update(this.elapsed);
    this.render();
  }
  private step(dt: number) {
    this.elapsed += dt;
    this.rainRun.update(this.flight);
    const wasOnWater = this.flight.onWater;
    if (this.arrival) this.arrival.step(dt, this.flight);
    else if (this.flight.step(dt, this.input) === "boundary-reset") {
      this.endLeg();
      this.cutTo();
    }
    if (wasOnWater && !this.flight.onWater && !this.arrival)
      this.manualApproach = undefined;
    this.surfaceSpray.update(dt, this.flight, this.flight.onWater);
    if (this.flight.onWater) {
      this.stopWater();
      this.rainRun.stop();
    }
    this.watering = !this.arrival && !this.flight.onWater && this.manualWater;
    if (this.watering) this.water.emit(dt, this.flight);
    this.water.update(dt, this.flight.wind);
    this.hydroClock += dt;
    if (this.hydroClock >= 0.2) {
      const groundDelta = this.hydroClock * (this.growing ? 12 : 1);
      for (let t = 0; t < groundDelta; t += 0.2)
        this.watershed.step(Math.min(0.2, groundDelta - t));
      this.groundTime += groundDelta;
      this.runoff.update(this.watershed);
      this.hydroClock = 0;
    }
    this.routeClock += dt;
    if (this.routeClock > 0.8) {
      this.routeClock = 0;
      if (this.routeCount >= 6000) {
        this.routePoints.copyWithin(0, 3);
        this.routeCount = 5999;
      }
      const i = this.routeCount++ * 3;
      this.routePoints[i] = this.flight.position.x;
      this.routePoints[i + 1] = Math.max(
        terrainHeight(this.flight.position.x, this.flight.position.z) + 8,
        8,
      );
      this.routePoints[i + 2] = this.flight.position.z;
      this.route.geometry.getAttribute("position").needsUpdate = true;
      this.route.geometry.setDrawRange(0, this.routeCount);
    }
    this.saveClock += dt;
    if (this.saveClock > 12) {
      this.save();
      this.saveClock = 0;
    }
  }
  startRainRun(index = 0, fresh = false) {
    this.endLeg();
    this.rainRun.start(this.flight, index, fresh);
    this.water.clear();
    this.cutTo(this.rainRun.grove);
  }
  rainGuide() {
    const g = this.rainRun.grove;
    return {
      aim: this.project(this.rainRun.impact),
      grove: this.project(
        new T.Vector3(g.x, terrainHeight(g.x, g.z) + 20, g.z),
      ),
      distance: Math.hypot(
        this.flight.position.x - g.x,
        this.flight.position.z - g.z,
      ),
    };
  }
  project(point: T.Vector3) {
    const p = point.clone().project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.host.clientWidth,
      y: (0.5 - p.y * 0.5) * this.host.clientHeight,
      visible:
        p.z > -1 && p.z < 1 && Math.abs(p.x) < 0.96 && Math.abs(p.y) < 0.92,
    };
  }
  visit(id: PlaceId, entry: ArrivalEntry) {
    this.endLeg();
    this.arrival = new Arrival(id, this.flight, entry);
    this.cutTo(places[id]);
  }
  depart() {
    this.endLeg();
    this.flight.enterInlet(inletRoute(this.seed).start);
    this.cutTo();
  }
  /** A guided arrival, a pilot's approach to a berth, and a rain run exclude one another. */
  private endLeg() {
    this.rainRun.stop();
    this.arrival = undefined;
    this.manualApproach = undefined;
  }
  /** Shows a new leg from its first frame. The camera, map, and trail restart so nothing is drawn between the old place and the new one. */
  private cutTo(focus?: { x: number; z: number }) {
    this.paused = false;
    this.stopWater();
    this.world.focus(focus?.x, focus?.z);
    this.setMap(false);
    this.viewMix = 0;
    this.routeCount = 0;
    this.route.geometry.setDrawRange(0, 0);
    this.orbitTarget = this.tiltTarget = this.orbitVelocity = 0;
    this.resetPresentation();
    this.updateCamera(1, true);
  }
  private resetPresentation() {
    // Travel/reset must never interpolate through the landscape from the old location.
    this.accumulator = 0;
    this.presentation.reset(this.flight);
    this.aircraft.root.position.copy(this.presentation.position);
    this.aircraft.root.quaternion.copy(this.presentation.quaternion);
  }
  private updateCamera(dt: number, instant = false) {
    const p = this.presentation.position;
    if (this.dragPointer === undefined && !this.paused) {
      this.orbitTarget += this.orbitVelocity * dt;
      this.orbitVelocity *= Math.exp(-dt * 10);
    }
    const lookEase = instant ? 1 : 1 - Math.exp(-dt * 14);
    this.orbit += (this.orbitTarget - this.orbit) * lookEase;
    this.tilt += (this.tiltTarget - this.tilt) * lookEase;
    this.surfaceMix +=
      (Number(this.flight.onWater) - this.surfaceMix) *
      (instant ? 1 : 1 - Math.exp(-dt * 0.85));
    if (this.arrival) {
      this.framing.arrival(p, {
        arrival: this.arrival,
        landmark: this.landmarks.roots[this.arrival.place].position,
        orbit: this.orbit,
        tilt: this.tilt,
        ease: instant ? 1 : 1 - Math.exp(-dt * 0.8),
      });
      return;
    }
    this.viewMix += (Number(this.map) - this.viewMix) * Math.min(1, dt * 1.8);
    this.framing.follow(p, {
      heading: this.presentation.heading + this.orbit,
      tilt: this.tilt,
      surfaceMix: this.surfaceMix,
      mapMix: this.viewMix,
      rainRunActive: this.rainRun.active,
      height: this.host.clientHeight,
      ease: instant
        ? 1
        : 1 - Math.exp(-dt * (this.dragPointer !== undefined ? 14 : 5)),
    });
    (this.scene.fog as T.FogExp2).density = 0.000024 - this.viewMix * 0.00001;
  }
  private render(prepareLanding = false) {
    this.renderMetrics.begin();
    this.renderer.info.reset();
    this.renderer.shadowMap.enabled =
      prepareLanding || !!this.arrival || this.flight.onWater;
    this.renderer.shadowMap.needsUpdate = this.renderer.shadowMap.enabled;
    const visualTime = Math.max(0, this.elapsed - 1 / 60 + this.accumulator);
    this.groves.update(this.elapsed);
    this.migration.update(visualTime);
    this.world.updateSun(this.presentation.position);
    this.world.setWake(
      this.presentation.position.x,
      this.presentation.position.z,
      this.flight.speed,
      this.flight.onWater,
      this.presentation.heading,
    );
    this.world.update(visualTime, this.viewMix);
    this.runoff.animate(visualTime, this.viewMix);
    this.rivers.update(visualTime, this.watershed.delivered);
    this.landmarks.update(visualTime);
    this.weather.update(visualTime, 0);
    if (
      this.frames % (this.low || this.quality === "low" ? 3 : 2) === 0 ||
      this.paused
    )
      this.world.reflect(this.renderer, this.camera);
    this.renderer.setRenderTarget(this.opaqueTarget);
    this.renderer.render(this.scene, this.camera);
    this.weather.prepare(
      this.opaqueTarget.depthTexture!,
      this.camera,
      this.cloudTarget.width,
      this.cloudTarget.height,
    );
    // Transparent cloud radiance is accumulated at its own resolution, then
    // reconstructed against the full-resolution scene depth in the composite.
    const alpha = this.renderer.getClearAlpha();
    this.renderer.getClearColor(this.clearColor);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(this.cloudTarget);
    this.camera.layers.set(1);
    this.renderer.render(this.cloudScene, this.camera);
    this.camera.layers.set(0);
    this.renderer.setClearColor(this.clearColor, alpha);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.screenScene, this.screenCamera);
    this.renderMetrics.end();
  }
  private animate = (now: number) => {
    if (this.lifetime.signal.aborted) return;
    this.frame = requestAnimationFrame(this.animate);
    if (document.hidden) return;
    const rawDelta = this.last ? (now - this.last) / 1000 : 1 / 60,
      delta = Math.min(rawDelta, 0.1);
    this.last = now;
    if (!this.paused) {
      this.accumulator += delta;
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps < 6) {
        this.presentation.beforeStep(this.flight);
        this.accumulator -= 1 / 60;
        this.step(1 / 60);
        steps++;
      }
      this.presentation.sample(this.flight, this.accumulator * 60);
      this.aircraft.root.position.copy(this.presentation.position);
      this.aircraft.root.quaternion.copy(this.presentation.quaternion);
      this.aircraft.update(delta, {
        bank: this.presentation.bank,
        pitch: this.presentation.pitch,
        steer: this.input.roll,
        throttle: this.flight.throttle,
        onWater: this.flight.onWater,
      });
      this.marker.position.set(
        this.presentation.position.x,
        Math.max(
          terrainHeight(
            this.presentation.position.x,
            this.presentation.position.z,
          ) + 15,
          15,
        ),
        this.presentation.position.z,
      );
      this.updateCamera(delta);
      this.render();
      this.frames++;
      this.adaptiveQuality.record(rawDelta);
      if (this.quality === "auto") {
        const current = this.renderer.getPixelRatio();
        const next = this.adaptiveQuality.nextRatio(
          current,
          this.basePixelRatio,
          () => this.renderMetrics.stats().gpu,
        );
        if (next !== current) {
          this.renderer.setPixelRatio(next);
          this.world.setLowPower(next < this.basePixelRatio * 0.95);
          this.resize();
        }
      }
    }
    this.uiClock += rawDelta;
    if (this.uiClock > 0.3) {
      this.uiClock = 0;
      this.frameTime = this.adaptiveQuality.meanFrameMs;
      this.fps = 1000 / this.frameTime;
      this.onUpdate?.(this);
    }
  };
  private aircraftBounds() {
    const points = [];
    for (const x of [-23, 23])
      for (const y of [-8, 8])
        for (const z of [-13, 13])
          points.push(
            new T.Vector3(x, y, z)
              .applyQuaternion(this.aircraft.root.quaternion)
              .add(this.aircraft.root.position)
              .project(this.camera),
          );
    return {
      left: Math.min(...points.map((p) => p.x)),
      right: Math.max(...points.map((p) => p.x)),
      top: Math.max(...points.map((p) => p.y)),
      bottom: Math.min(...points.map((p) => p.y)),
      depth: Math.max(...points.map((p) => p.z)),
    };
  }
  soundPosition() {
    const delta = this.migration.caller.clone().sub(this.presentation.position);
    const distance = delta.length();
    const right = new T.Vector3().setFromMatrixColumn(
      this.camera.matrixWorld,
      0,
    );
    return {
      distance,
      pan: delta.dot(right) / Math.max(1, distance),
      time: this.elapsed,
      exposure: this.flight.exposure,
      water: this.flight.onWater,
      throttle: this.arrival && this.flight.onWater ? 0 : this.flight.throttle,
    };
  }
  stats() {
    return {
      ready: this.ready,
      aircraftId: this.aircraftId,
      migration: {
        seed: this.seed,
        route: this.migration.kind,
        caller: this.migration.caller.toArray(),
        exposure: this.flight.exposure,
        lift: this.flight.risingAir,
      },
      fps: Math.round(this.fps * 10) / 10,
      frameTime: this.frameTime,
      renderedFrames: this.frames,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      pixelRatio: this.renderer.getPixelRatio(),
      antialiasSamples: this.opaqueTarget.samples,
      rendering: this.renderMetrics.stats(),
      cloudResolution: [this.cloudTarget.width, this.cloudTarget.height],
      trees: this.world.treeCount,
      headwaters: this.rivers.count,
      rainRun: this.rainRun.stats(),
      onWater: this.flight.onWater,
      waterTime: this.flight.waterTime,
      throttle: this.flight.throttle,
      sink: this.flight.velocity.y,
      heading: this.flight.heading,
      landingCount: this.flight.landingCount,
      takingOff: this.flight.takingOff,
      shoreBlocked: this.flight.shoreBlocked,
      manualApproach: this.manualApproach ?? null,
      look: {
        yaw: this.orbit,
        tilt: this.tilt,
        dragging: this.dragPointer !== undefined,
      },
      aircraftBounds: this.aircraftBounds(),
      arrival: this.arrival
        ? { place: this.arrival.place, stage: this.arrival.stage }
        : null,
      paused: this.paused,
      map: this.map,
      assisted: this.flight.assisted,
      position: this.flight.position.toArray(),
      speed: this.flight.speed,
      delivered: this.watershed.delivered,
      wateredCells: this.watershed.wateredCells,
      storageAvailable: this.storageAvailable,
      worldSize: WORLD_SIZE,
      gridSize: GRID,
      elapsed: this.elapsed,
      groundTime: this.groundTime,
      growing: this.growing,
    };
  }
  stop() {
    if (this.lifetime.signal.aborted) return;
    this.release();
    this.save();
  }
  private release() {
    this.lifetime.abort();
    cancelAnimationFrame(this.frame);
    this.ready = false;
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}
