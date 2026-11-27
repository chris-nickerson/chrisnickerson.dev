import * as T from "three";
import { inletMoon, inletSun } from "./atmosphere";
import { skyVertex, skyFragment } from "./shaders";

export function createInletSky() {
  const skyMat = new T.ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: inletSun },
      uMoon: { value: inletMoon },
      uCloudDeck: { value: null },
      uSkyReady: { value: 0 },
      uNight: { value: 0 },
    },
    side: T.BackSide,
    depthWrite: false,
  });
  return new T.Mesh(new T.SphereGeometry(22000, 32, 20), skyMat);
}

export function setInletSkyPanorama(
  sky: ReturnType<typeof createInletSky>,
  panorama: T.Texture,
) {
  panorama.colorSpace = T.SRGBColorSpace;
  panorama.wrapS = T.RepeatWrapping;
  // The azimuth wraps opposite the sun. Mip selection there would follow
  // the jump in the coordinate and draw the panorama's average as a seam.
  panorama.generateMipmaps = false;
  panorama.minFilter = T.LinearFilter;
  sky.material.uniforms.uCloudDeck.value = panorama;
  sky.material.uniforms.uSkyReady.value = 1;
}

export function bakeInletEnvironment(
  renderer: T.WebGLRenderer,
  panorama?: T.Texture,
  night = false,
) {
  const sky = createInletSky();
  sky.material.uniforms.uNight.value = Number(night);
  if (panorama) setInletSkyPanorama(sky, panorama);
  const scene = new T.Scene();
  scene.add(sky);
  const generator = new T.PMREMGenerator(renderer);
  try {
    return generator.fromScene(scene, 0, 1, 25000, { size: 128 });
  } finally {
    generator.dispose();
    sky.material.dispose();
    sky.geometry.dispose();
  }
}
