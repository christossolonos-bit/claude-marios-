// A short alarm chime, synthesized with the Web Audio API so there's no audio
// asset to bundle and it works offline. Played when a reminder fires.

export function playChime(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    // A bright three-note rising chime.
    const notes = [880, 1108.73, 1318.51]; // A5, C#6, E6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      const dur = 0.4;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    });

    // Free the context once the chime has played.
    window.setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    // ignore — audio is a nicety, never critical
  }
}
