// Rider outfits and per-browser preferences, shared by the home screen and the game.
// Each outfit recolours the model's materials by name; anything not listed keeps the model's colour.
export const RIDERS = [
  { id: 'sage', name: '鼠尾草', en: 'Sage', swatch: '#aebf96', pants: '#1d1f23', kit: {} },
  { id: 'midnight', name: '午夜', en: 'Midnight', swatch: '#2a3652', pants: '#3c3f44', kit: { Jacket: 0x2a3652, JacketCuff: 0x1e2740, Pants: 0x3c3f44, PantsKick: 0x2c2e32, Helmet: 0x1b1c1f } },
  { id: 'ember', name: '餘燼', en: 'Ember', swatch: '#c4622e', pants: '#222427', kit: { Jacket: 0xc4622e, JacketCuff: 0x9a4a22, Pants: 0x222427, PantsKick: 0x17181a } },
  { id: 'glacier', name: '冰川', en: 'Glacier', swatch: '#dde4e8', pants: '#5b6444', kit: { Jacket: 0xdde4e8, JacketCuff: 0xbcc6cc, Pants: 0x5b6444, PantsKick: 0x474f34, Helmet: 0x2b2e33 } },
];

// localStorage can be missing or throw (private windows); preferences are a convenience only.
export const pref = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// Per-resort record: runs started and best top speed.
export function record(id) {
  try { return { runs: 0, top: 0, ...JSON.parse(pref.get('record:' + id) || '{}') }; } catch { return { runs: 0, top: 0 }; }
}
export function saveRecord(id, patch) { pref.set('record:' + id, JSON.stringify({ ...record(id), ...patch })); }
