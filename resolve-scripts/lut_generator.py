"""Generate .cube 3D LUTs from grading parameters (pure Python, no dependencies).

Parameters (all optional, neutral defaults):
  exposure      stops (+1 doubles linear light)
  temperature   -1..1  (warm > 0, cool < 0)
  tint          -1..1  (magenta > 0, green < 0)
  lift/gamma/gain [r,g,b] (lift 0, gamma 1, gain 1 neutral)
  contrast      1 = neutral, pivot default 0.435 (≈ 18% grey in log-ish space)
  saturation    1 = neutral
  shadowsTint / highlightsTint [r,g,b] offsets (split toning, e.g. teal/orange)
  fade          0..0.2 black lift
  monochrome    true for black and white (Rec.709 luma weights)
  vibrance      0..1 boosts low-saturation colors more
"""
from __future__ import annotations


def _clamp(x, lo=0.0, hi=1.0):
    return lo if x < lo else hi if x > hi else x


def _vec(v, default):
    if v is None:
        return list(default)
    if isinstance(v, (int, float)):
        return [float(v)] * 3
    return [float(x) for x in v]


def transform(rgb, p):
    r, g, b = rgb
    # white balance
    t = float(p.get("temperature", 0))
    ti = float(p.get("tint", 0))
    r *= 1 + 0.15 * t
    b *= 1 - 0.15 * t
    g *= 1 - 0.10 * ti
    # exposure
    e = 2 ** float(p.get("exposure", 0))
    r, g, b = r * e, g * e, b * e
    # lift / gamma / gain (ASC-style)
    lift = _vec(p.get("lift"), (0, 0, 0))
    gamma = _vec(p.get("gamma"), (1, 1, 1))
    gain = _vec(p.get("gain"), (1, 1, 1))
    out = []
    for i, c in enumerate((r, g, b)):
        c = c * gain[i] + lift[i] * (1 - c)
        c = _clamp(c, 0, 1.5)
        c = c ** (1.0 / max(gamma[i], 1e-3)) if c > 0 else 0
        out.append(c)
    r, g, b = out
    # contrast around pivot
    k = float(p.get("contrast", 1))
    pv = float(p.get("pivot", 0.435))
    r, g, b = ((c - pv) * k + pv for c in (r, g, b))
    # split toning by luma
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sh = _vec(p.get("shadowsTint"), (0, 0, 0))
    hi = _vec(p.get("highlightsTint"), (0, 0, 0))
    ws = _clamp(1 - y * 2)
    wh = _clamp(y * 2 - 1)
    r, g, b = (c + sh[i] * ws + hi[i] * wh for i, c in enumerate((r, g, b)))
    # saturation / vibrance / monochrome
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    s = float(p.get("saturation", 1))
    vib = float(p.get("vibrance", 0))
    if vib:
        mx, mn = max(r, g, b), min(r, g, b)
        cur = (mx - mn) / (mx + 1e-6) if mx > 0 else 0
        s *= 1 + vib * (1 - cur)
    if p.get("monochrome"):
        s = 0
    r, g, b = (y + (c - y) * s for c in (r, g, b))
    # fade
    f = float(p.get("fade", 0))
    r, g, b = (c * (1 - f) + f for c in (r, g, b))
    return [_clamp(r), _clamp(g), _clamp(b)]


def write_cube(path: str, params: dict, size: int = 33, title: str = "MCP LUT") -> dict:
    if size < 2 or size > 65:
        raise ValueError("LUT size must be 2..65")
    n = size - 1
    lines = [f'TITLE "{title}"', f"LUT_3D_SIZE {size}", "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"]
    # .cube order: red changes fastest
    for bi in range(size):
        for gi in range(size):
            for ri in range(size):
                o = transform((ri / n, gi / n, bi / n), params)
                lines.append(f"{o[0]:.6f} {o[1]:.6f} {o[2]:.6f}")
    with open(path, "w", encoding="ascii", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    return {"path": path, "size": size, "entries": size ** 3, "params": params}
