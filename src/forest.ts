import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seededRandom } from "./terrain";
/** Original needle-and-branch rasterization, used on crossed foliage planes. No image assets. */
export function createCanopy() {
  const canvas = document.createElement("canvas");
  canvas.width = 384 * 3;
  canvas.height = 768;
  const ctx = canvas.getContext("2d")!;
  for (let variant = 0; variant < 3; variant++) {
    ctx.save();
    ctx.translate(variant * 384, 0);
    const random = seededRandom(92 + variant * 171);
    ctx.lineCap = "round";
    ctx.strokeStyle = "#65583d";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(192, 758);
    ctx.lineTo(192, 9);
    ctx.stroke();
    ctx.strokeStyle = "#6d8054";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(192, 8);
    ctx.lineTo(188, 48);
    ctx.lineTo(197, 58);
    ctx.stroke();
    for (let row = 38; row >= 0; row--) {
      const y = 24 + row * 18,
        spread =
          (4 +
            Math.pow(row / 38, variant === 1 ? 1.3 : 0.83) *
              (variant === 2 ? 130 : 154)) *
          (0.72 + random() * 0.38);
      for (const side of [-1, 1]) {
        if (row > 8 && random() < (variant === 2 ? 0.19 : 0.07)) continue;
        const reach = spread * (0.76 + random() * 0.24),
          endY = y + 18 + random() * 25;
        ctx.strokeStyle = "#3d4d34";
        ctx.lineWidth = 1 + row / 13;
        ctx.beginPath();
        ctx.moveTo(192, y);
        ctx.lineTo(192 + side * reach, endY);
        ctx.stroke();
        for (let j = 0; j < 20; j++) {
          const t = j / 20,
            cx = 192 + side * reach * t,
            cy = y + (endY - y) * t;
          const twig = (1 - t) * 26 + 5;
          for (let k = 0; k < 9; k++) {
            const px = cx + (random() - 0.5) * 12,
              py = cy + (random() - 0.5) * 14,
              light = random();
            ctx.strokeStyle =
              light > 0.78
                ? "#8a9a5d"
                : light > 0.42
                  ? "#597746"
                  : light > 0.18
                    ? "#3d603e"
                    : "#254934";
            ctx.lineWidth = 1 + random() * 2;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(
              px + side * (4 + random() * twig),
              py - 5 - random() * 12,
            );
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(
              px + side * (3 + random() * twig * 0.6),
              py + 5 + random() * 9,
            );
            ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  const planes: T.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new T.PlaneGeometry(2, 1);
    g.translate(0, 0.5, 0);
    g.rotateY((i * Math.PI) / 3);
    planes.push(g);
  }
  const geometry = mergeGeometries(planes);
  return { geometry, texture };
}

/** Needle-bearing branches in three dimensions, rather than whole-tree cards.
 * The branch atlas is original rasterized geometry and shared by every near tree. */
export function createNearCanopy() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!,
    random = seededRandom(381);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#bbbbbb";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(500, 128);
  ctx.stroke();
  for (let k = 0; k < 45; k++) {
    const x = 8 + k * 10.8,
      reach = (1 - k / 47) ** 0.7 * 103;
    for (const side of [-1, 1]) {
      ctx.strokeStyle = "#aaaaaa";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x, 128);
      ctx.lineTo(x + 20, 128 + side * reach);
      ctx.stroke();
      for (let j = 0; j < 22; j++) {
        const t = j / 22,
          xx = x + t * 20,
          yy = 128 + side * reach * t;
        const light = Math.round(155 + random() * 100);
        ctx.strokeStyle = `rgb(${light},${light},${light})`;
        ctx.lineWidth = 1.3 + random() * 1.3;
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx + 9 + random() * 14, yy + side * (2 + random() * 7));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx - 4 - random() * 10, yy + side * (2 + random() * 5));
        ctx.stroke();
      }
    }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  const positions: number[] = [],
    uvs: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  for (let tier = 0; tier < 14; tier++) {
    const y = 0.16 + tier * 0.064,
      radius = Math.pow(1 - tier / 14.3, 1.12) * 0.97;
    for (let branch = 0; branch < 7; branch++) {
      const angle = (branch * Math.PI * 2) / 7 + tier * 2.399,
        dx = Math.cos(angle),
        dz = Math.sin(angle);
      const reach = radius * (0.67 + random() * 0.46),
        spread = (0.07 + random() * 0.045) * (1 - tier / 17);
      const branchY = y + (random() - 0.5) * 0.11;
      const roll = (random() - 0.5) * 1.7,
        droop = 0.02 + random() * 0.065;
      for (let plane = 0; plane < 2; plane++) {
        const offset = positions.length / 3;
        for (const [t, side] of [
          [0, -1],
          [1, -1],
          [0, 1],
          [1, 1],
        ]) {
          const angleAround = roll + (plane * Math.PI) / 2;
          const sideways = Math.cos(angleAround) * spread * side;
          positions.push(
            dx * t * reach - dz * sideways,
            branchY - t * droop + Math.sin(angleAround) * spread * side,
            dz * t * reach + dx * sideways,
          );
          uvs.push(t, side * 0.5 + 0.5);
          const light = 0.68 + y * 0.38 + random() * 0.07;
          colors.push(0.08 * light, 0.14 * light, 0.067 * light);
        }
        indices.push(
          offset,
          offset + 1,
          offset + 2,
          offset + 2,
          offset + 1,
          offset + 3,
        );
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const trunk = new T.CylinderGeometry(0.018, 0.046, 0.96, 6);
  trunk.translate(0, 0.48, 0);
  const trunkUV = trunk.getAttribute("uv");
  for (let i = 0; i < trunkUV.count; i++) trunkUV.setXY(i, 0.005, 0.5);
  const trunkColor = new Float32Array(trunkUV.count * 3);
  for (let i = 0; i < trunkUV.count; i++)
    trunkColor.set([0.13, 0.09, 0.047], i * 3);
  trunk.setAttribute("color", new T.BufferAttribute(trunkColor, 3));
  const geometry = mergeGeometries([g, trunk]);
  g.dispose();
  trunk.dispose();
  return { geometry, texture };
}
