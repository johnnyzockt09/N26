import { describe, expect, it } from 'vitest';
import { eurosToCents, centsToEuros, formatCents, isValidCents, requiresVerification, isSafeDescription, isValidUuid } from '../index.js';

describe('money utilities', () => {
  it('converts euros to cents without floating point errors', () => {
    expect(eurosToCents(1)).toBe(100);
    expect(eurosToCents(50.5)).toBe(5050);
    expect(eurosToCents(0)).toBe(0);
  });

  it('converts cents to euros', () => {
    expect(centsToEuros(100)).toBe(1);
    expect(centsToEuros(5050)).toBe(50.5);
  });

  it('formats cents as German euros', () => {
    expect(formatCents(500000)).toMatch(/5.000,00/);
  });

  it('rejects invalid cents values', () => {
    expect(isValidCents(100)).toBe(true);
    expect(isValidCents(-1)).toBe(false);
    expect(isValidCents(1.5)).toBe(false);
    expect(isValidCents(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('requires verification above 100 EUR', () => {
    expect(requiresVerification(10_000)).toBe(false);
    expect(requiresVerification(10_001)).toBe(true);
    expect(requiresVerification(25_000)).toBe(true);
  });
});

describe('input validation', () => {
  it('validates proper UUID format', () => {
    expect(isValidUuid('12345678-1234-1234-8123-123456789abc')).toBe(true);
    expect(isValidUuid('not-a-uuid')).toBe(false);
  });

  it('rejects unsafe descriptions', () => {
    expect(isSafeDescription('test payment')).toBe(true);
    expect(isSafeDescription('/execute @a')).toBe(false);
    expect(isSafeDescription('give me <money>')).toBe(false);
  });
});