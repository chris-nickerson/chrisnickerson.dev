import * as T from "three";

/** Split an indexed height grid without changing a single vertex or normal.
 * Border vertices are copied from the parent, preserving continuous lighting.
 * Each tile has its own culling bounds. Equal-size tiles share an index buffer. Dispose their geometries together.
 */
export function terrainTiles(
  source: T.PlaneGeometry,
  material: T.Material,
  tileSegments: number,
) {
  const group = new T.Group();
  const nx = source.parameters.widthSegments!;
  const nz = source.parameters.heightSegments!;
  const indexCache = new Map<string, T.BufferAttribute>();
  const gridIndex = (w: number, h: number) => {
    const key = w + "x" + h;
    let index = indexCache.get(key);
    if (!index) {
      const indices: number[] = [];
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const a = j * (w + 1) + i,
            b = a + w + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      index =
        (w + 1) * (h + 1) > 65535
          ? new T.Uint32BufferAttribute(indices, 1)
          : new T.Uint16BufferAttribute(indices, 1);
      indexCache.set(key, index);
    }
    return index;
  };
  for (let z = 0; z < nz; z += tileSegments) {
    for (let x = 0; x < nx; x += tileSegments) {
      const w = Math.min(tileSegments, nx - x);
      const h = Math.min(tileSegments, nz - z);
      const g = new T.BufferGeometry();
      for (const name of ["position", "normal", "uv"]) {
        const a = source.getAttribute(name);
        const buffer = new Float32Array((w + 1) * (h + 1) * a.itemSize);
        const rowSize = (w + 1) * a.itemSize;
        for (let j = 0; j <= h; j++) {
          const start = ((z + j) * (nx + 1) + x) * a.itemSize;
          buffer.set(a.array.subarray(start, start + rowSize), j * rowSize);
        }
        g.setAttribute(name, new T.BufferAttribute(buffer, a.itemSize));
      }
      g.setIndex(gridIndex(w, h));
      g.computeBoundingSphere();
      const mesh = new T.Mesh(g, material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
  return group;
}
