/** A transitive ordering: known counts first, then their actual count. Unknown
 * counts share one position and are never compared as a fabricated zero.
 * This is used only where the existing ordering already compares pill burden. */
export function comparePillCounts(left: number, leftKnown: boolean | undefined, right: number, rightKnown: boolean | undefined): number {
  const unknown = Number(leftKnown === false) - Number(rightKnown === false);
  return unknown || (leftKnown === false ? 0 : left - right);
}
