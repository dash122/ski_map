// Each resort shares the same page and logic; only its data folder, names and landmarks differ.
// Data folders are built by the tools in tools/ from the boxes in tools/resorts.json.
// flora: what grows where, for the trees (defaults are Niseko's: Sakhalin fir and birch, treeline about 880 m).
//   treeline m · conifer share above the lowlands · low: below this, white birch and larch plantations ·
//   rime: snow-monster firs at the treeline (Japan) · larch: share of the broadleaf slot that is larch ·
//   cover: extra wood where OSM maps none · firBias: distant canopy reads as conifer
export const RESORTS = {
  niseko: {
    id: 'niseko', continent: 'asia', country: 'JP', area: '北海道', label: '二世古 Niseko United', data: 'data/',
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
    flora: { treeline: 1250, conifer: 0.4, low: 600 },
    id: 'appi', continent: 'asia', country: 'JP', area: '東北', label: '安比高原 Appi Kogen', data: 'data/appi/',
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
    flora: { treeline: 1300, conifer: 0.3, low: 500 },
    id: 'gala', continent: 'asia', country: 'JP', area: '新潟', label: 'GALA湯澤 Gala Yuzawa', data: 'data/gala/',
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
  rusutsu: {
    flora: { treeline: 950 },
    id: 'rusutsu', continent: 'asia', country: 'JP', area: '北海道', label: '留壽都 Rusutsu', data: 'data/rusutsu/',
    title: '留壽都滑雪', brand: '留壽都', mountain: '貫氣別山',
    code: 'CTS', name: '留壽都', en: 'Rusutsu', region: '北海道 · 貫氣別山', thumb: 'thumbs/rusutsu.webp',
    sub: '在北海道留壽都的真實地形上滑雪：West、East 與 Isola 三座山以纜車相連，對面就是羊蹄山。',
    summit: 'Isola', summitZone: '貫氣別山頂（Isola）', backcountry: '留壽都野雪區',
    // Mt. Kankibetsu (OSM peak, 994 m), the top of the Isola gondola; Mt. Shiribetsu to the north is higher but unlifted.
    peak: { lon: 140.9228, lat: 42.7101 },
    // Base areas from the OSM lift terminals (labels only, not survey data).
    bases: [
      { name: 'West Mountain', lon: 140.9010, lat: 42.7500 },
      { name: 'East Mountain', lon: 140.9108, lat: 42.7369 },
      { name: 'Isola', lon: 140.9286, lat: 42.7361 },
    ],
    // Snow-capped volcano on the horizon: Mt. Yotei, to the north-west.
    volcano: { lon: 140.811, lat: 42.826 },
  },
  teine: {
    flora: { treeline: 1080, low: 450 },
    id: 'teine', continent: 'asia', country: 'JP', area: '北海道', label: '札幌手稻 Sapporo Teine', data: 'data/teine/',
    title: '札幌手稻滑雪', brand: '札幌手稻', mountain: '手稻山',
    code: 'CTS', name: '札幌手稻', en: 'Sapporo Teine', region: '北海道 · 手稻山', thumb: 'thumbs/teine.webp',
    sub: '在札幌手稻山的真實地形上滑雪：山頂的 Highland 區俯瞰石狩灣，山下是 1972 年冬奧的 Olympia 區。',
    summit: 'Teine', summitZone: '手稻山頂', backcountry: '手稻山野雪區',
    // Mt. Teine (OSM peak, 1023 m); the Highland zone runs off its summit.
    peak: { lon: 141.1932, lat: 43.0766 },
    // Approximate base areas from the OSM lift terminals (labels only, not survey data).
    bases: [
      { name: 'Olympia', lon: 141.2075, lat: 43.1055 },
      { name: 'Highland', lon: 141.2060, lat: 43.0830 },
    ],
    // Snow-capped volcano on the horizon: Mt. Yotei, south-west beyond the Jozankei hills.
    volcano: { lon: 140.811, lat: 42.826 },
  },
  cypress: {
    flora: { treeline: 1750, conifer: 0.93, low: 0, rime: false, cover: 0.16, firBias: 0.35 },
    id: 'cypress', continent: 'north-america', country: 'CA', area: '卑詩省', label: '賽普勒斯山 Cypress Mountain', data: 'data/cypress/',
    title: '賽普勒斯山滑雪', brand: '賽普勒斯山', mountain: '賽普勒斯山',
    code: 'YVR', name: '賽普勒斯山', en: 'Cypress Mountain', region: '卑詩省 · 西溫哥華', thumb: 'thumbs/cypress.webp',
    sub: '在加拿大卑詩省西溫哥華賽普勒斯山的真實地形上滑雪，面向溫哥華灣與北岸山脈。',
    summit: 'Cypress', summitZone: '賽普勒斯山頂', backcountry: '賽普勒斯野雪區',
    // Approximate base areas from the OSM lift terminals and trailheads (labels only, not survey data).
    bases: [
      { name: 'Cypress Lodge', lon: -123.2045, lat: 49.3965 },
      { name: 'Raven Ridge', lon: -123.2036, lat: 49.3893 },
      { name: 'Sky Chair', lon: -123.1961, lat: 49.4078 },
    ],
    // Snow-capped volcano on the horizon: Mt. Garibaldi, north across Howe Sound.
    volcano: { lon: -123.0043, lat: 49.8503 },
  },
  chaserrugg: {
    flora: { treeline: 1950, conifer: 0.82, low: 0, rime: false, larch: 0.75, cover: 0.08, firBias: 0.25 },
    id: 'chaserrugg', continent: 'europe', country: 'CH', area: '聖加侖州', label: 'Chäserrugg 托根堡', data: 'data/chaserrugg/',
    title: 'Chäserrugg 滑雪', brand: 'Chäserrugg', mountain: 'Chäserrugg',
    code: 'ZRH', name: 'Chäserrugg', en: 'Toggenburg', region: '瑞士 · 聖加侖州', thumb: 'thumbs/chaserrugg.webp',
    sub: '在瑞士托根堡 Chäserrugg 的真實地形上滑雪，從 Unterwasser 搭纜車直上丘爾菲爾斯滕（Churfirsten）山脊。',
    summit: 'Chäserrugg', summitZone: 'Chäserrugg 山頂', backcountry: 'Chäserrugg 野雪區',
    // The Churfirsten ridge runs west along the box; the ski summit is Chäserrugg itself (2262 m).
    peak: { lon: 9.3128, lat: 47.1548 },
    // Approximate base areas from the OSM lift terminals (labels only, not survey data).
    bases: [
      { name: 'Unterwasser', lon: 9.3127, lat: 47.1930 },
      { name: 'Iltios', lon: 9.3123, lat: 47.1790 },
      { name: 'Stöfeli', lon: 9.3150, lat: 47.1700 },
      { name: 'Oberdorf', lon: 9.3470, lat: 47.1910 },
    ],
    // Säntis, the Alpstein massif's high point, to the north (not a volcano, but the horizon's snow-capped peak).
    volcano: { lon: 9.3432, lat: 47.2494 },
  },
};

// Home-screen grouping: continents in this order, then countries, then areas.
export const CONTINENTS = { asia: ['亞洲', 'Asia'], 'north-america': ['北美洲', 'North America'], europe: ['歐洲', 'Europe'] };
export const COUNTRIES = { JP: ['日本', 'Japan'], CA: ['加拿大', 'Canada'], CH: ['瑞士', 'Switzerland'] };

export function currentResort(search = globalThis.location?.search ?? '') {
  return RESORTS[new URLSearchParams(search).get('resort')] ?? RESORTS.niseko;
}
