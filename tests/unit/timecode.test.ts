import { describe, expect, it } from "vitest";
import { framesToTimecode, parseTimecode, secondsToFrames, toFrames } from "../../src/utils/timecode.js";

describe("timecode", () => {
  it("round-trips non-drop timecode at common rates", () => {
    for (const fps of [23.976, 24, 25, 30, 50, 60]) {
      for (const f of [0, 1, 23, 24, 1439, 86400, 123456]) {
        expect(parseTimecode(framesToTimecode(f, fps), fps)).toBe(f);
      }
    }
  });
  it("formats 01:00:00:00 at 24 fps as frame 86400", () => {
    expect(parseTimecode("01:00:00:00", 24)).toBe(86400);
    expect(framesToTimecode(86400, 24)).toBe("01:00:00:00");
  });
  it("handles 29.97 drop-frame correctly", () => {
    expect(framesToTimecode(1800, 29.97, true)).toBe("00:01:00;02");
    expect(parseTimecode("00:01:00;02", 29.97)).toBe(1800);
    expect(framesToTimecode(17982, 29.97, true)).toBe("00:10:00;00");
    for (const f of [0, 1799, 1800, 17981, 17982, 107892, 215784]) {
      expect(parseTimecode(framesToTimecode(f, 29.97, true), 29.97)).toBe(f);
    }
  });
  it("handles 59.94 drop-frame", () => {
    for (const f of [0, 3599, 3600, 35964, 500000]) expect(parseTimecode(framesToTimecode(f, 59.94, true), 59.94)).toBe(f);
  });
  it("rejects invalid input", () => {
    expect(() => parseTimecode("1:2:3", 24)).toThrow();
    expect(() => parseTimecode("00:00:00:24", 24)).toThrow();
    expect(() => framesToTimecode(-1, 24)).toThrow();
    expect(() => framesToTimecode(1.5, 24)).toThrow();
  });
  it("converts seconds without float drift", () => {
    expect(secondsToFrames(10, 24)).toBe(240);
    expect(secondsToFrames(0.1 * 3, 30)).toBe(9);
    expect(secondsToFrames(1001 / 30000, 29.97)).toBe(1);
  });
  it("toFrames accepts frames, seconds and timecode", () => {
    expect(toFrames(48, 24)).toBe(48);
    expect(toFrames("2.5s", 24)).toBe(60);
    expect(toFrames("00:00:01:00", 25)).toBe(25);
    expect(() => toFrames(1.2, 24)).toThrow();
  });
});
