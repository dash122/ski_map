// Loading screen: a percentage bar that names what is being loaded. The page's top-level awaits call
// `at` before each heavy build step (yielding a frame so the label paints) and `fetch` for data files.
const TIPS = [
  '按住「壓低」加速，放開滑行；「煞車」側滑減速。',
  '跳躍後左右轉可以旋轉。',
  '點小地圖可直接傳送到雪道入口或纜車。',
  '在纜車山腳站搭乘，可選 1×–10× 速度。',
  '夜晚纜車柱燈會亮起，沿纜車線滑行最清楚。',
];

const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

export function createLoading(resort) {
  const root = document.getElementById('loadscreen');
  const bar = root.querySelector('.bar i'), pct = root.querySelector('.pct'), label = root.querySelector('.what');
  root.querySelector('.bg').style.backgroundImage = `url(${resort.thumb})`;
  root.querySelector('.code').textContent = resort.code;
  root.querySelector('.zh').textContent = resort.name;
  root.querySelector('.en').textContent = resort.en;
  const tip = root.querySelector('.tip');
  let t = Math.floor(Math.random() * TIPS.length);
  tip.textContent = '提示：' + TIPS[t];
  const tipTimer = setInterval(() => { t = (t + 1) % TIPS.length; tip.textContent = '提示：' + TIPS[t]; }, 3500);
  root.hidden = false;

  let now = 0;
  const show = (p, text) => {
    now = Math.max(now, Math.min(100, p));
    bar.style.width = now + '%';
    pct.textContent = Math.floor(now) + '%';
    if (text) label.textContent = text;
  };

  return {
    async at(p, text) { show(p, text); await frame(); },
    // Streams a file so the bar moves with its bytes; resolves to an ordinary Response.
    async fetch(url, text, to) {
      const from = now;
      show(from, text);
      const r = await fetch(url);
      if (!r.ok || !r.body) { show(to); return r; }
      // Compressed transfers report the compressed length; cap the fraction rather than trust it.
      const total = +r.headers.get('content-length') || 1e6;
      const reader = r.body.getReader(), parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        show(from + (to - from) * Math.min(0.97, got / total));
      }
      show(to);
      return new Response(new Blob(parts), { status: r.status });
    },
    done() { show(100, '準備就緒'); clearInterval(tipTimer); setTimeout(() => { root.hidden = true; }, 350); },
  };
}
