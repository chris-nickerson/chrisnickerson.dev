import framing from "./eclipse-framing.json";

const FRAME_MS = 1000 / 24;

type Cover = { scale: number; x: number; y: number };

function cover(plate: HTMLImageElement, width: number, height: number): Cover {
  const scale = Math.max(
    width / plate.naturalWidth,
    height / plate.naturalHeight,
  );
  return {
    scale,
    x: (plate.naturalWidth - width / scale) / 2,
    y: (plate.naturalHeight - height / scale) / 2,
  };
}

function drawRipples(
  ctx: CanvasRenderingContext2D,
  plate: HTMLImageElement,
  { scale, x, y: top }: Cover,
  time: number,
) {
  const { width, height } = ctx.canvas;
  const horizon = (plate.naturalHeight * framing.horizon - top) * scale;
  for (let y = Math.max(0, Math.ceil(horizon)); y < height; ) {
    const depth = (y - horizon) / (height - horizon);
    const band = Math.max(1, Math.round(height * (0.0018 + depth * 0.004)));
    const shift =
      Math.sin(depth * 57 - time * 2.1) +
      0.55 * Math.sin(depth * 131 + time * 1.4);
    const roll = Math.cos(depth * 46 - time * 1.6);
    const sy = Math.min(
      plate.naturalHeight - band / scale,
      top + (y + roll * depth * 2) / scale,
    );
    ctx.drawImage(
      plate,
      x,
      sy,
      width / scale,
      band / scale,
      shift * depth * width * 0.004,
      y,
      width,
      band,
    );
    y += band;
  }
}

function drawSwans(
  ctx: CanvasRenderingContext2D,
  plate: HTMLImageElement,
  { scale, x: left, y: top }: Cover,
  time: number,
) {
  const moon =
    framing[
      plate.naturalHeight > plate.naturalWidth ? "portrait" : "landscape"
    ];
  const moonX = (moon.x * plate.naturalWidth - left) * scale;
  const moonY = (framing.moonY * plate.naturalHeight - top) * scale;
  const radius = moon.radius * plate.naturalHeight * scale;
  ctx.fillStyle = "#121c24";
  ctx.lineCap = "round";
  for (let bird = 0; bird < 7; bird++) {
    const side = bird % 2 ? -1 : 1;
    const rank = Math.ceil(bird / 2);
    const span = radius * (0.105 - rank * 0.008);
    const glide = Math.min(
      1,
      Math.max(0, 2 * Math.sin(time * 1.35 + bird * 1.8)),
    );
    const flap = (1 - glide) * Math.sin(time * 5.2 - bird * 1.7) + glide * 0.2;
    const flightX = -0.52 + time * 0.33 - rank * 0.19;
    const rimLight = Math.exp(-((flightX - 0.94) ** 2) / 0.12);
    ctx.save();
    ctx.translate(
      moonX + radius * flightX,
      moonY +
        radius * (0.24 - time * 0.055 + side * rank * 0.085) +
        Math.sin(time * 1.8 + bird) * radius * 0.012,
    );
    ctx.scale(span, span);
    ctx.rotate(-0.16);
    ctx.beginPath();
    ctx.moveTo(-1, -0.1 - flap * 0.46);
    ctx.quadraticCurveTo(-0.54, -0.33 - flap * 0.38, -0.04, -0.02);
    ctx.quadraticCurveTo(0.42, -0.51 + flap * 0.28, 0.87, -0.72 + flap * 0.53);
    ctx.strokeStyle = `rgba(255,222,172,${0.38 + 0.59 * rimLight})`;
    ctx.lineWidth = 0.06 + 0.035 * rimLight;
    ctx.stroke();
    ctx.quadraticCurveTo(0.57, -0.22 + flap * 0.25, 0.19, 0.04);
    ctx.lineTo(0.54, 0.02);
    ctx.lineTo(0.55, 0.09);
    ctx.quadraticCurveTo(-0.08, 0.25, -0.25, 0.11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Dissolves into live flight when the opening artwork is ready and motion is enabled.
 */
export function animateEclipse() {
  const root = document.documentElement;
  const screen = document.querySelector<HTMLElement>(".loading-screen")!;
  const plate = screen.querySelector("img");
  if (!plate) return;
  const canvas = screen.querySelector("canvas")!;
  const ctx = canvas.getContext("2d");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let last = 0;
  let time = 0;

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (!ctx || now - last < FRAME_MS) return;
    const steps = Math.floor((now - last) / FRAME_MS);
    time += Math.min(steps * FRAME_MS, 100) / 1000;
    last += steps * FRAME_MS;
    if (!plate.complete || !plate.naturalWidth) return;
    const fit = cover(plate, canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRipples(ctx, plate, fit, time);
    drawSwans(ctx, plate, fit, time);
  };

  // Resizing the canvas clears it, so reduced motion shows the still plate.
  const restart = () => {
    cancelAnimationFrame(frame);
    const ratio = Math.min(
      1.5,
      devicePixelRatio,
      1100 / Math.max(innerWidth, innerHeight),
    );
    canvas.width = Math.max(1, Math.round(screen.clientWidth * ratio));
    canvas.height = Math.max(1, Math.round(screen.clientHeight * ratio));
    last = performance.now();
    if (ctx && !motion.matches) frame = requestAnimationFrame(draw);
  };

  const release = () => {
    canvas.width = canvas.height = 0;
    plate.parentElement!.remove();
    screen.inert = false;
  };

  const finish = () => {
    if (root.classList.contains("awaiting-flight")) return;
    loading.disconnect();
    resize.disconnect();
    motion.removeEventListener("change", restart);
    cancelAnimationFrame(frame);
    const live = document
      .getElementById("experience")!
      .classList.contains("flight-ready");
    if (motion.matches || !live || !plate.complete || !plate.naturalWidth)
      return release();
    screen.inert = true;
    Promise.allSettled(
      screen.getAnimations().map((animation) => animation.finished),
    ).then(release);
  };

  const loading = new MutationObserver(finish);
  const resize = new ResizeObserver(restart);
  loading.observe(root, { attributes: true, attributeFilter: ["class"] });
  resize.observe(screen);
  motion.addEventListener("change", restart);
  finish();
}
