// Use sustained frame times, with slower recovery, to avoid resolution oscillation.
export function createRenderQuality({ mobile, pixelRatio, apply }) {
  const min = Math.min(pixelRatio, mobile ? 0.75 : 1);
  const max = Math.min(pixelRatio, mobile ? 1.25 : 2);
  let ratio = Math.min(max, mobile ? 1 : max), elapsed = 0, frames = 0, fast = 0;
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
