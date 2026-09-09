export * from './types.js';

export function isValidUuid(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

export function isSafeDescription(description: string): boolean {
  if (description.length > 200) return false;
  // Reject any Minecraft command characters / injection
  return !/[\/\\`$'"<>]/.test(description) && !description.startsWith(' ');
}

export function normalizeUuid(uuid: string): string {
  return uuid.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5').toLowerCase();
}

export function truncateId(id: string, length = 12): string {
  return id.length <= length ? id : `${id.slice(0, length)}...`;
}

export function isDescriptionSafe(description: string): boolean {
  return isSafeDescription(description);
}

/**
 * Normalize a player's answer for comparison: trimmed, lower-cased,
 * inner whitespace collapsed to single spaces.
 */
export function normalizeAnswer(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Validate an answer submission: non-empty string, sane length, no control
 * characters.
 */
export function isValidLevelAnswer(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 200 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/**
 * Server-side answer check. Ignores case, surrounding whitespace and
 * differences between "accessgranted" / "access granted" variants.
 */
export function matchesAnyAnswer(input: string, answers: string[]): boolean {
  const n = normalizeAnswer(input);
  const alpha = (s: string) => s.replace(/[^a-z0-9]/g, '');
  const na = alpha(n);
  return answers.some((a) => {
    const normalized = normalizeAnswer(a);
    return na === alpha(normalized) || n === normalized;
  });
}