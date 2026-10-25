import * as THREE from 'three';

// Reuses the facade UV bays: one stable occupancy decision per room, not per frame.
export function createBuildingLighting({ scene, material, entrances }) {
  const level = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.buildingNight = level;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 buildingLight; varying vec2 vBuildingLight; varying vec2 vBuildingUV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBuildingLight = buildingLight; vBuildingUV = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform float buildingNight;
varying vec2 vBuildingLight;
varying vec2 vBuildingUV;
float roomHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
vec2 bay = floor(vBuildingUV), pane = fract(vBuildingUV);
// Quantize the interpolated building ID before hashing, avoiding shimmering rooms.
float seed = floor(vBuildingLight.x * 4096. + 0.5) / 4096.;
float occupied = step(roomHash(bay + seed * 193.7), vBuildingLight.y) * step(0., seed);
float glassX = max(step(0.25, pane.x) * (1. - step(0.484375, pane.x)), step(0.515625, pane.x) * (1. - step(0.765625, pane.x)));
float glassY = step(0.34375, pane.y) * (1. - step(0.75, pane.y));
float litWindow = occupied * glassX * glassY * buildingNight;
float warmth = roomHash(bay + seed * 71.3 + 9.);
vec3 roomColor = mix(vec3(1., 0.49, 0.19), vec3(1., 0.83, 0.53), warmth);
totalEmissiveRadiance += roomColor * litWindow * (0.5 + warmth * 0.9);
`);
  };
  material.customProgramCacheKey = () => 'occupied-building-windows-v1';
  const lights = Array.from({ length: 6 }, () => {
    const light = new THREE.PointLight(0xffc58b, 0, 16, 1.5);
    light.name = 'Village entrance lighting'; scene.add(light); return light;
  });
  let strength = 0, elapsed = Infinity;
  return {
    setTime(time) {
      strength = time === 'night' ? 1 : time === 'sunset' ? 0.3 : 0;
      level.value = strength; elapsed = Infinity;
      if (!strength) for (const light of lights) light.intensity = 0;
    },
    update(player, dt = 0.25) {
      if (!strength) return;
      elapsed += dt; if (elapsed < 0.25) return; elapsed = 0;
      const nearest = entrances.map(p => ({ p, d: (p.x - player.x) ** 2 + (p.z - player.z) ** 2 }))
        .filter(e => e.d < 180 ** 2).sort((a, b) => a.d - b.d).slice(0, lights.length);
      lights.forEach((light, i) => {
        const entry = nearest[i]; light.intensity = entry ? 16 * strength : 0;
        if (entry) light.position.copy(entry.p);
      });
    },
  };
}
