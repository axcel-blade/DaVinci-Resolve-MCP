# Frames and timecode

DaVinci Resolve's scripting API works in **frames**. Tools follow the same rules:

- Frames are integers. **Absolute** timeline frames include the timeline start timecode, which is usually `01:00:00:00`
  (frame 86400 at 24 fps). `timeline_get_info` reports `startFrame` and `startTimecode`.
- Clip positions from `timeline_get_clips` (`start`, `end`, `duration`) are absolute timeline frames.
- Tools that take seconds (`targetSeconds`, fades, durations) convert with the timeline frame rate.
- Timecode strings are `HH:MM:SS:FF`; drop-frame rates (29.97, 59.94) use `;` before the frame field.
- Frame rates are passed as strings (`"23.976"`, `"24"`, `"25"`, `"29.97"`, `"30"`, `"50"`, `"59.94"`, `"60"`).

Helpers live in `src/utils/timecode.ts`: `parseTimecode`, `framesToTimecode`, `secondsToFrames`, `framesToSeconds`,
`nominalRate`, `isDropFrameRate`.

## Timeline items

Address a clip by `itemId` (stable, from `timeline_get_clips`) or by `trackType` (`video`, `audio`, `subtitle`) +
`trackIndex` + `itemIndex`, all 1-based. `itemIndex` counts clips only, not transitions or gaps.
