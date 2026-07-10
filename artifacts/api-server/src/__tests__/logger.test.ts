import { describe, it, expect } from "vitest";
import { maskEmail } from "../lib/logger";

describe("maskEmail", () => {
  it("masks a standard email address", () => {
    expect(maskEmail("alex@example.com")).toBe("al***@example.com");
  });

  it("masks a single-char local part", () => {
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });

  it("masks a two-char local part showing both chars", () => {
    expect(maskEmail("ab@example.com")).toBe("ab***@example.com");
  });

  it("masks a long local part, only showing first two chars", () => {
    expect(maskEmail("alexander@domain.org")).toBe("al***@domain.org");
  });

  it("returns empty string for null", () => {
    expect(maskEmail(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(maskEmail(undefined)).toBe("");
  });

  it("returns *** for an email with no @ sign", () => {
    expect(maskEmail("notanemail")).toBe("***");
  });

  it("returns *** for @ at position 0", () => {
    expect(maskEmail("@domain.com")).toBe("***");
  });

  it("preserves the domain part verbatim", () => {
    const result = maskEmail("user@sub.domain.co.uk");
    expect(result).toMatch(/@sub\.domain\.co\.uk$/);
  });
});
