// Each resort shares the same page and logic; only its data folder, names and landmarks differ.
// Data folders are built by the tools in tools/ from the boxes in tools/resorts.json.
export const RESORTS = {
  niseko: {
    id: 'niseko', label: '二世古 Niseko United', data: 'data/',
    title: '二世古滑雪', brand: '二世古', mountain: '二世古安努普利山',
    // Home-screen card: nearest airport code, names and a thumbnail rendered from the game itself.
    code: 'CTS', name: '二世古', en: 'Niseko', region: '北海道 · 安努普利山', thumb: 'thumbs/niseko.webp',
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
    code: 'HNA', name: '安比高原', en: 'Appi Kogen', region: '岩手縣 · 前森山', thumb: 'thumbs/appi.webp',
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
  gala: {
    id: 'gala', label: 'GALA湯澤 Gala Yuzawa', data: 'data/gala/',
    title: 'GALA湯澤滑雪', brand: 'GALA湯澤', mountain: '高津倉山',
    code: 'KIJ', name: 'GALA湯澤', en: 'Gala Yuzawa', region: '新潟縣 · 高津倉山', thumb: 'thumbs/gala.webp',
    sub: '在新潟縣湯澤町高津倉山的真實地形上滑雪，從新幹線車站直接搭纜車上山。',
    summit: 'Takanokura', summitZone: 'GALA湯澤高津倉山頂', backcountry: 'GALA湯澤野雪區',
    // Higher ridges east of Yuzawa share the box; the ski summit is Mt. Takanokura (OSM peak, 1181 m).
    peak: { lon: 138.7695, lat: 36.9438 },
    // Approximate base areas from the OSM lift terminals (labels only, not survey data).
    bases: [
      { name: 'Gala Yuzawa Station', lon: 138.7996, lat: 36.9503 },
      { name: 'Cheers', lon: 138.7836, lat: 36.9518 },
      { name: 'Kita Area', lon: 138.7776, lat: 36.9563 },
      { name: 'Minami Area', lon: 138.7790, lat: 36.9400 },
      { name: 'Ishiuchi Maruyama', lon: 138.7950, lat: 36.9700 },
    ],
    // Volcano on the horizon: Mt. Naeba, south-west across the Uonuma valley.
    volcano: { lon: 138.6903, lat: 36.8460 },
  },
};

export function currentResort(search = globalThis.location?.search ?? '') {
  return RESORTS[new URLSearchParams(search).get('resort')] ?? RESORTS.niseko;
}
