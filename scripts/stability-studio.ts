import * as T from "three";
import { Simulation } from "../src/simulation";
const host = document.createElement("div");
document.body.style.margin = "0";
host.style.cssText = "width:100vw;height:100vh";
document.body.append(host);
const sim: any = new Simulation(host, false);
cancelAnimationFrame(sim.frame);
let clock = 1000;
function frames(hz: number, count: number) {
  const render = sim.render;
  sim.render = () => {};
  sim.last = clock;
  const samples = [];
  for (let i = 0; i < count; i++) {
    clock += 1000 / hz;
    sim.animate(clock);
    cancelAnimationFrame(sim.frame);
    sim.camera.updateMatrixWorld();
    const p = sim.aircraft.root.position.clone().project(sim.camera);
    samples.push({
      t: clock,
      position: sim.aircraft.root.position.toArray(),
      screen: [(p.x * innerWidth) / 2, (p.y * innerHeight) / 2],
      camera: sim.camera.position.toArray(),
    });
  }
  sim.render = render;
  return samples;
}
function draw() {
  sim.render();
  cancelAnimationFrame(sim.frame);
}
(window as any).stability = { sim, frames, draw, T };
draw();
