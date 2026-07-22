// AI credits are an integer count, not currency — deliberately NOT routed
// through src/lib/money/'s BigInt-cents primitives (those exist for real
// money; a credit balance has no currency, no rounding rules, and no
// regulatory reason to be BigInt).
export function floorAtZero(n: number): number {
  return Math.max(n, 0)
}
