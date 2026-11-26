/** Money is always an integer number of minor units (cents). Never a float. */
export type Cents = number;

/** Largest amount we accept, so that intermediate math stays well inside safe integers. */
export const MAX_CENTS = 100_000_000_000; // 1 billion in a 2-decimal currency

export function assertCents(value: number, label = "amount"): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of cents, got ${value}`);
  }
}

/** Number of decimal places the currency uses (2 for CAD/USD, 0 for JPY). */
export function minorUnits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
}

/**
 * Parse text such as "12", "12.5", "$1,234.50" into minor units.
 * Returns null if the text is not a valid amount for the currency.
 */
export function parseAmount(text: string, currency = "CAD"): Cents | null {
  const digits = minorUnits(currency);
  const cleaned = text.trim().replace(/[$,\s]/g, "");
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (fraction.length > digits) return null;
  const minor = Number(whole + fraction.padEnd(digits, "0"));
  if (!Number.isSafeInteger(minor) || minor > MAX_CENTS) return null;
  return minor;
}

/** Format minor units for display, e.g. 123456 -> "$1,234.56". */
export function formatMoney(amount: Cents, currency = "CAD", locale = "en-CA"): string {
  assertCents(amount);
  const digits = minorUnits(currency);
  const value = amount / 10 ** digits;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}
