/** Frame-accurate timecode math. All arithmetic is done on integer frames. */

export function nominalRate(fps: number): number {
  return Math.round(fps);
}

export function isDropFrameRate(fps: number): boolean {
  return Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01;
}

const TC_RE = /^(\d{1,2})[:;](\d{2})[:;](\d{2})([:;])(\d{2})$/;

export function parseTimecode(tc: string, fps: number): number {
  const m = TC_RE.exec(tc.trim());
  if (!m) throw new Error(`Invalid timecode "${tc}" (expected HH:MM:SS:FF)`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = Number(m[3]);
  const f = Number(m[5]);
  const n = nominalRate(fps);
  if (mi > 59 || s > 59) throw new Error(`Invalid timecode "${tc}"`);
  if (f >= n) throw new Error(`Frame field ${f} out of range for ${fps} fps`);
  let total = ((h * 60 + mi) * 60 + s) * n + f;
  if (m[4] === ";" && isDropFrameRate(fps)) {
    const d = n === 30 ? 2 : 4;
    const mins = h * 60 + mi;
    total -= d * (mins - Math.floor(mins / 10));
  }
  return total;
}

export function framesToTimecode(frame: number, fps: number, drop = false): string {
  if (!Number.isInteger(frame) || frame < 0) throw new Error(`frame must be a non-negative integer, got ${frame}`);
  const n = nominalRate(fps);
  let f = frame;
  let sep = ":";
  if (drop && isDropFrameRate(fps)) {
    const d = n === 30 ? 2 : 4;
    const per10 = n * 600 - d * 9;
    const per1 = n * 60 - d;
    const tens = Math.floor(f / per10);
    const rem = f % per10;
    f += d * 9 * tens + (rem > d ? d * Math.floor((rem - d) / per1) : 0);
    sep = ";";
  }
  const ff = f % n;
  const ss = Math.floor(f / n) % 60;
  const mm = Math.floor(f / (n * 60)) % 60;
  const hh = Math.floor(f / (n * 3600));
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(hh)}:${p(mm)}:${p(ss)}${sep}${p(ff)}`;
}

/** Seconds -> frames, floored, with a tiny epsilon so exact multiples of 1/fps land on whole frames. */
export function secondsToFrames(sec: number, fps: number): number {
  return Math.floor(sec * fps + 1e-6);
}

export function framesToSeconds(frames: number, fps: number): number {
  return frames / fps;
}

/** Accepts a frame number, "HH:MM:SS:FF" or "12.5s". */
export function toFrames(value: number | string, fps: number): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("Frame values must be integers");
    return value;
  }
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const sec = /^(\d+(?:\.\d+)?)s$/.exec(v);
  if (sec) return secondsToFrames(Number(sec[1]), fps);
  return parseTimecode(v, fps);
}
