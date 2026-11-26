import { describe, expect, it } from "vitest";
import { formatMoney, minorUnits, parseAmount } from "../src";

describe("parseAmount", () => {
  it("parses whole and decimal amounts", () => {
    expect(parseAmount("12")).toBe(1200);
    expect(parseAmount("12.5")).toBe(1250);
    expect(parseAmount("12.34")).toBe(1234);
    expect(parseAmount("0.05")).toBe(5);
    expect(parseAmount("$1,234.50")).toBe(123450);
  });
  it("avoids float error", () => {
    expect(parseAmount("19.99")).toBe(1999);
    expect(parseAmount("0.1")).toBe(10);
    expect(parseAmount("1.15")).toBe(115);
  });
  it("rejects bad input", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1..2", "1e5", "."]) {
      expect(parseAmount(bad), bad).toBeNull();
    }
  });
  it("respects the currency's decimals", () => {
    expect(minorUnits("JPY")).toBe(0);
    expect(parseAmount("500", "JPY")).toBe(500);
    expect(parseAmount("5.5", "JPY")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats cents", () => {
    expect(formatMoney(123456, "CAD", "en-CA")).toBe("$1,234.56");
    expect(formatMoney(5, "USD", "en-US")).toBe("$0.05");
    expect(formatMoney(-250, "USD", "en-US")).toBe("-$2.50");
    expect(formatMoney(500, "JPY", "ja-JP")).toMatch(/500/);
  });
  it("refuses non-integers", () => {
    expect(() => formatMoney(1.5)).toThrow();
  });
});
