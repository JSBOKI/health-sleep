function mix(h1: number, h2: number, text: string): [number, number] {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  h1 = Math.imul(h1 ^ 0xff, 0x01000193);
  h2 = Math.imul(h2 ^ 0xff, 0x85ebca6b);
  return [h1, h2];
}

/** Stable 64-bit hex key for a health record. Collisions inside one day are negligible. */
export function dedupeKey(
  type: string,
  start: string,
  end: string,
  value: string,
  source: string,
): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  [h1, h2] = mix(h1, h2, type);
  [h1, h2] = mix(h1, h2, start);
  [h1, h2] = mix(h1, h2, end);
  [h1, h2] = mix(h1, h2, value);
  [h1, h2] = mix(h1, h2, source);
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
