/** ['A', 'B'] → { A: 'A', B: 'B' }. TripStatus.ONGOING처럼 쓰는 상수를 만든다 */
export function enumObject<const T extends readonly string[]>(
  values: T,
): { readonly [K in T[number]]: K } {
  return Object.freeze(
    Object.fromEntries(values.map((value) => [value, value])),
  ) as { readonly [K in T[number]]: K };
}
