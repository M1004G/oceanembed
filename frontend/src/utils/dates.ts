/** Build a sampled list of ISO dates between min/max, every `stepDays` days. */
export function buildDateList(min: string, max: string, stepDays = 5): string[] {
  const dates: string[] = []
  const cur = new Date(min + 'T00:00:00Z')
  const end = new Date(max + 'T00:00:00Z')
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + stepDays)
  }
  return dates
}
