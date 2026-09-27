// All color logic is built from the five brand colors — no ad-hoc hexes.
const ABYSS = [0x2f, 0x48, 0x58] as const
const CURRENT = [0x33, 0x65, 0x8a] as const
const SURFACE = [0x86, 0xbb, 0xd8] as const
const WARM = [0xf6, 0xae, 0x2d] as const
const HOT = [0xf2, 0x64, 0x19] as const

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function mixRGB(c1: readonly number[], c2: readonly number[], t: number): [number, number, number] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
}

/**
 * Temperature scale: cold deep water -> warm surface water.
 * domain roughly [minC, maxC] in degrees Celsius.
 */
export function temperatureColor(value: number, min = 5, max = 32): [number, number, number] {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)))
  if (t < 0.35) return mixRGB(ABYSS, CURRENT, t / 0.35)
  if (t < 0.7) return mixRGB(CURRENT, SURFACE, (t - 0.35) / 0.35)
  if (t < 0.88) return mixRGB(SURFACE, WARM, (t - 0.7) / 0.18)
  return mixRGB(WARM, HOT, (t - 0.88) / 0.12)
}

/**
 * Anomaly scale: diverging around 0. Negative -> cool blues, positive -> warm/hot.
 * domain is +/- maxAbs degrees.
 */
export function anomalyColor(value: number, maxAbs = 2.5): [number, number, number, number] {
  const t = Math.min(1, Math.abs(value) / maxAbs)
  if (Math.abs(value) < 0.15) return [...SURFACE, 0.08 * 255] as [number, number, number, number]
  if (value < 0) {
    const [r, g, b] = mixRGB(SURFACE, CURRENT, t)
    return [r, g, b, 60 + t * 160]
  }
  const [r, g, b] = mixRGB(WARM, HOT, t)
  return [r, g, b, 60 + t * 195]
}

export function rgbToCss([r, g, b]: readonly number[], a = 1): string {
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`
}
