// Home screen: pick an outfit and a resort, like choosing a level. Resolves with the chosen resort.
import { RESORTS, CONTINENTS, COUNTRIES } from './resorts.js';
import { RIDERS, pref, record } from './riders.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// Little jacket-and-pants figure in the outfit's colours.
const kitIcon = r => `<svg viewBox="0 0 40 44" aria-hidden="true"><circle cx="20" cy="7" r="5.5" fill="#2b2e33"/>` +
  `<path d="M9 15 Q20 11 31 15 L35 30 L30 31 L29 24 L28 28 L12 28 L11 24 L10 31 L5 30 Z" fill="${r.swatch}" stroke="rgba(0,0,0,.35)"/>` +
  `<path d="M12 28 L28 28 L27 42 L21.5 42 L20 33 L18.5 42 L13 42 Z" fill="${r.pants}"/></svg>`;

export function chooseResort() {
  const home = document.getElementById('home');
  const kits = document.getElementById('homeKits'), list = document.getElementById('homeResorts');
  const stance = document.querySelectorAll('#homeStance button'), skills = document.querySelectorAll('#homeSkill button');
  home.hidden = false;

  let rider = RIDERS.some(r => r.id === pref.get('rider')) ? pref.get('rider') : 'sage';
  let goofy = pref.get('stance') === 'goofy';
  let skill = ['beginner', 'intermediate', 'advanced'].includes(pref.get('skill')) ? pref.get('skill') : 'intermediate';
  const sync = () => {
    for (const b of kits.children) b.setAttribute('aria-checked', b.dataset.id === rider);
    for (const b of stance) b.setAttribute('aria-checked', (b.dataset.s === 'goofy') === goofy);
    for (const b of skills) b.setAttribute('aria-checked', b.dataset.k === skill);
  };
  for (const r of RIDERS) {
    const b = el('button', 'kit', `${kitIcon(r)}<b>${r.name}</b><small>${r.en}</small>`);
    b.type = 'button'; b.dataset.id = r.id; b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { rider = r.id; pref.set('rider', r.id); sync(); });
    kits.append(b);
  }
  for (const b of stance) b.addEventListener('click', () => { goofy = b.dataset.s === 'goofy'; pref.set('stance', goofy ? 'goofy' : 'regular'); sync(); });
  for (const b of skills) b.addEventListener('click', () => { skill = b.dataset.k; pref.set('skill', skill); sync(); });
  sync();

  const last = pref.get('lastResort');
  return new Promise(resolve => {
    // Grouped like a trail-map index: continent heading, a divider per country, cards ordered by area.
    const order = Object.keys(CONTINENTS), sorted = Object.values(RESORTS).sort((a, b) =>
      order.indexOf(a.continent) - order.indexOf(b.continent) || a.country.localeCompare(b.country) || a.area.localeCompare(b.area, 'zh-Hant'));
    let continent = null, country = null;
    for (const r of sorted) {
      if (r.continent !== continent) {
        continent = r.continent; country = null;
        list.append(el('h3', 'continent', `${CONTINENTS[continent][0]} <span>${CONTINENTS[continent][1]}</span>`));
      }
      if (r.country !== country) {
        country = r.country;
        const n = sorted.filter(s => s.country === country).length;
        list.append(el('div', 'country', `<b>${COUNTRIES[country][0]}</b><span>${COUNTRIES[country][1]}</span><i>${n} 座雪場</i>`));
      }
      const rec = record(r.id);
      const stat = rec.runs ? `最高 ${Math.round(rec.top)} km/h · 滑行 ${rec.runs} 次` : '全新雪場';
      const b = el('button', 'resort',
        `<span class="thumb" style="background-image:url(${r.thumb})"></span>` +
        `<span class="code">${r.code}</span><b class="zh">${r.name}</b><span class="en">${r.en}</span>` +
        `<span class="region">《${r.region}》</span><span class="record">${stat}</span>` +
        (r.id === last ? '<span class="here">上次滑行</span>' : '') + '<span class="go-arrow" aria-hidden="true">›</span>');
      b.type = 'button';
      if (r.id === last) b.classList.add('last');
      b.addEventListener('click', () => { pref.set('lastResort', r.id); home.hidden = true; resolve(r); }, { once: true });
      list.append(b);
    }
  });
}
