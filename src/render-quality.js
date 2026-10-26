// Use sustained frame times, with slower recovery, to avoid resolution oscillation.
// range is the graphics preset's [min, start, max]; phones may go below 1× CSS pixels on Low.
export function createRenderQuality({ range: [lo, start, hi], pixelRatio, apply }) {
  const min = Math.min(pixelRatio, lo);
  const max = Math.min(pixelRatio, hi);
  let ratio = Math.min(max, start), elapsed = 0, frames = 0, fast = 0;
  apply(ratio);
  return {
    get ratio() { return ratio; },
    reset() { elapsed = 0; frames = 0; fast = 0; },
    sample(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 0.25) {
        this.reset(); return;
      }
      elapsed += seconds; frames++;
      if (elapsed < 2) return;
      const average = elapsed / frames;
      fast = average < 0.018 ? fast + elapsed : 0;
      const next = average > 0.022 ? Math.max(min, ratio - 0.125)
        : fast >= 8 ? Math.min(max, ratio + 0.125) : ratio;
      if (next !== ratio) { ratio = next; fast = 0; apply(ratio); }
      elapsed = 0; frames = 0;
    },
  };
}
