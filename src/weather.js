import * as THREE from 'three';

export const WEATHER = {
  clear: { label: '晴朗', cloud: 0, fog: 0.000035, sun: 1, count: 0, wind: 0, gust: 0, fallSpeed: 1.5 },
  overcast: { label: '陰天', cloud: 0.85, fog: 0.00005, sun: 0.28, count: 0, wind: 1, gust: 0.5, fallSpeed: 1.5 },
  // Falling snow should soften the landscape, not erase mountain relief at kilometre distances.
  // Reserve whiteout visibility for the storm preset.
  snow: { label: '降雪', cloud: 0.9, fog: 0.000065, sun: 0.28, count: 0.85, wind: 2, gust: 1.5, fallSpeed: 2.5 },
  storm: { label: '暴風雪', cloud: 1, fog: 0.009, sun: 0.035, count: 1, wind: 15, gust: 6, fallSpeed: 6 },
};
const TIMES = {
  day: { label: '白天', top: 0x2866b7, fog: 0xc9ddea, sun: 0xfff1dc, intensity: 2.9, ambient: 0.95, exposure: 1, y: 0.55 },
  sunset: { label: '黃昏', top: 0x414e85, fog: 0xefbca2, sun: 0xffb56d, intensity: 1.8, ambient: 0.65, exposure: 0.95, y: 0.13 },
  night: { label: '夜晚', top: 0x030817, fog: 0x182a44, sun: 0x9abfff, intensity: 0.35, ambient: 0.22, exposure: 0.85, y: 0.65 },
};

export function createWeather({ scene, renderer, sky, ambient, sun, sunDirection, snow, snowGeo, snowCount, mappedLighting, buildingLighting, liftLighting }) {
  const timeSelect = document.getElementById('timeSelect'), weatherSelect = document.getElementById('weatherSelect');
  const status = document.getElementById('conditionsStatus'), hint = document.getElementById('conditionsHint');
  const state = { time: 'day', weather: 'clear', wind: 0, gust: 0, fallSpeed: 1.5 };
  function set(time, kind) {
    if (!TIMES[time] || !WEATHER[kind]) return false;
    const t = TIMES[time], w = WEATHER[kind], isNight = time === 'night';
    Object.assign(state, { time, weather: kind, wind: w.wind, gust: w.gust, fallSpeed: w.fallSpeed });
    const fog = new THREE.Color(t.fog);
    const top = new THREE.Color(t.top).lerp(new THREE.Color(isNight ? 0x101a2a : 0x889ba9), w.cloud);
    scene.fog.color.copy(fog); scene.fog.density = w.fog;
    sky.material.uniforms.top.value.copy(top);
    sky.material.uniforms.horizon.value.copy(fog);
    sky.material.uniforms.cloud.value = w.cloud;
    sky.material.uniforms.night.value = isNight ? 1 : 0;
    sky.material.uniforms.disc.value = isNight ? 0 : 1 - w.cloud;
    sunDirection.set(-0.45, t.y, 0.78).normalize();
    sky.material.uniforms.sunDir.value.copy(sunDirection);
    sun.color.set(t.sun); sun.intensity = t.intensity * (isNight ? Math.max(0.4, w.sun) : w.sun);
    sun.castShadow = !isNight && w.cloud < 0.5;
    ambient.color.set(isNight ? 0x8eaad5 : 0xcfe3ff);
    ambient.groundColor.set(isNight ? 0x34435e : 0xdfe6ee);
    ambient.intensity = t.ambient * (1 - w.cloud * 0.15);
    renderer.toneMappingExposure = t.exposure;
    snow.visible = w.count > 0;
    snowGeo.setDrawRange(0, Math.floor(snowCount * w.count));
    snow.material.size = kind === 'storm' ? 0.24 : 0.22;
    snow.material.opacity = kind === 'storm' ? 0.95 : 0.92;
    buildingLighting?.setTime(time);
    liftLighting?.setTime(time);
    mappedLighting.traverse(o => { if (o.material?.emissive) o.material.emissiveIntensity = isNight ? 2 : 0; });
    timeSelect.value = time; weatherSelect.value = kind;
    status.textContent = time === 'day' && kind === 'clear' ? 'Bluebird' : `${t.label} · ${w.label}`;
    hint.textContent = isNight ? '纜車柱燈已亮起：沿纜車線滑行最清楚。可自由組合夜晚與降雪／暴風雪。' : kind === 'storm' ? '強風、密集降雪與低能見度。' : '自由組合時間與天氣；夜晚由纜車柱燈照亮雪道。';
    try { localStorage.setItem('niseko.conditions.v1', JSON.stringify({ time, weather: kind })); } catch { /* Private browsing can disable storage. */ }
    return true;
  }
  let saved;
  try { saved = JSON.parse(localStorage.getItem('niseko.conditions.v1')); } catch { /* Start with bluebird. */ }
  if (!set(saved?.time, saved?.weather)) set('day', 'clear');
  for (const el of [timeSelect, weatherSelect]) {
    el.disabled = false;
    el.addEventListener('change', () => set(timeSelect.value, weatherSelect.value));
  }
  return Object.assign(state, {
    set,
    update() {},
  });
}
