/* 17 Nov: People tab shows members with a real photo first. "Real photo" = an uploaded base64 data URL longer than 200 chars
   (same rule as the admin panel, 0087). Demo pictures, the Kring icon and the placeholder (an svg data URL, NEUTRAL_IMG) sort after. Stable: inside each
   group the server's order (here now, then most recently active) is kept, and the filters/chips still apply on top. */
export const isRealPhoto = (img: string | null | undefined): boolean => typeof img === 'string' && /^data:image\/[a-z+]+;base64,/.test(img) && !img.startsWith('data:image/svg') && img.length > 200;
export function photoFirst<T extends { img: string }>(people: T[]): T[] {
  return people.map((p, i) => [p, i] as const).sort((a, b) => Number(isRealPhoto(b[0].img)) - Number(isRealPhoto(a[0].img)) || a[1] - b[1]).map(([p]) => p);
}
