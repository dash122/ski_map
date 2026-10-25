// Each resort shares the same page and logic; only its data folder, names and landmarks differ.
// Data folders are built by the tools in tools/ from the boxes in tools/resorts.json.
export const RESORTS = {
  niseko: {
    id: 'niseko', label: '二世古 Niseko United', data: 'data/',
    title: '二世古滑雪', brand: '二世古', mountain: '二世古安努普利山',
    sub: '在北海道二世古安努普利山的真實地形上滑雪。',
    summit: 'Annupuri', summitZone: '二世古安努普利山頂', backcountry: '二世古野雪區',
    // Approximate base areas of the four resorts (labels only, not survey data).
    bases: [
      { name: 'Hanazono', lon: 140.716, lat: 42.889 },
      { name: 'Grand Hirafu', lon: 140.702, lat: 42.861 },
      { name: 'Niseko Village', lon: 140.672, lat: 42.826 },
      { name: 'Annupuri', lon: 140.652, lat: 42.847 },
    ],
    // Snow-capped volcano on the horizon: Mt. Yotei.
    volcano: { lon: 140.811, lat: 42.826 },
  },
  appi: {
    id: 'appi', label: '安比高原 Appi Kogen', data: 'data/appi/',
    title: '安比高原滑雪', brand: '安比高原', mountain: '前森山',
    sub: '在岩手縣安比高原前森山的真實地形上滑雪。',
    summit: 'Maemori', summitZone: '安比高原前森山頂', backcountry: '安比高原野雪區',
    // Higher peaks of the Hachimantai range sit inside the box; the ski summit is Mt. Maemori.
    peak: { lon: 140.9583, lat: 39.9777 },
    // Approximate base areas from the OSM lift terminals (labels only, not survey data).
    bases: [
      { name: 'Appi Gondola Base', lon: 140.9712, lat: 40.0012 },
      { name: 'Seiler', lon: 140.9812, lat: 39.9866 },
      { name: 'Vista', lon: 140.9857, lat: 39.9777 },
    ],
    // Snow-capped volcano on the horizon: Mt. Iwate.
    volcano: { lon: 141.0007, lat: 39.8528 },
  },
};

export function currentResort(search = globalThis.location?.search ?? '') {
  return RESORTS[new URLSearchParams(search).get('resort')] ?? RESORTS.niseko;
}
