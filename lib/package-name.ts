export function packageNameForSegment(zipcode: string, city: string, pageStart: string, pageEnd: string) {
  if (!zipcode || !city || !pageStart || !pageEnd) return ""
  return `${zipcode} - ${city} - ${pageStart}-${pageEnd}`
}
