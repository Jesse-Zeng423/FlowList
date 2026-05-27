const STORAGE_KEY = "flowlist:sound-enabled";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

// Short white-noise burst shaped into a papery card-on-velvet tap.
// attackTime controls how fast the gain ramps to peak (default 2 ms; use longer for a "slide" feel).
function scheduleNoiseTick(
  ac: AudioContext,
  startTime: number,
  duration: number,
  gain: number,
  filterFreq: number,
  attackTime = 0.002,
): void {
  const bufferSize = Math.ceil(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.65;

  const gainNode = ac.createGain();
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + attackTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ac.destination);
  source.start(startTime);
  source.stop(startTime + duration + 0.002);
}

export function playCardTap(): void {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    // 2000 Hz centre lands better on laptop speakers; gain compensates for BPF attenuation
    scheduleNoiseTick(ac, ac.currentTime, 0.052, 0.30, 2000);
  } catch {
    // fail silently — sound is never required
  }
}

export function playShuffle(): void {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    // 4 staggered ticks — gentle deal, not a casino riffle
    const ticks = [
      { delay: 0.0,   gain: 0.28, freq: 1900, dur: 0.040 },
      { delay: 0.09,  gain: 0.34, freq: 2100, dur: 0.044 },
      { delay: 0.185, gain: 0.30, freq: 2000, dur: 0.040 },
      { delay: 0.275, gain: 0.26, freq: 1950, dur: 0.036 },
    ];
    for (const t of ticks) {
      scheduleNoiseTick(ac, ac.currentTime + t.delay, t.dur, t.gain, t.freq);
    }
  } catch {
    // fail silently
  }
}

// Card turned face-down — muted swish then a soft settle thud.
export function playCardFlip(): void {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    scheduleNoiseTick(ac, ac.currentTime,        0.100, 0.22, 1400, 0.008);
    scheduleNoiseTick(ac, ac.currentTime + 0.065, 0.080, 0.18,  850, 0.003);
  } catch {}
}

// Card dealt in — soft paper slide then a landing tap.
export function playCardDeal(): void {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    scheduleNoiseTick(ac, ac.currentTime,        0.110, 0.24, 2100, 0.012);
    scheduleNoiseTick(ac, ac.currentTime + 0.095, 0.048, 0.32, 2400, 0.002);
  } catch {}
}

// Final card settles on the table — weighted thump with a crisp surface layer. No chime.
export function playResultReady(): void {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    scheduleNoiseTick(ac, ac.currentTime, 0.180, 0.22,  900, 0.005);
    scheduleNoiseTick(ac, ac.currentTime, 0.090, 0.20, 2200, 0.002);
  } catch {}
}
