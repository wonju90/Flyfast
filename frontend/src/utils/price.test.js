import { describe, expect, it } from "vitest";
import { formatManwon, formatWon } from "./price";

describe("formatWon", () => {
  it("formats an amount with thousands separators and a 원 suffix", () => {
    expect(formatWon(300000)).toBe("300,000원");
  });

  it("renders a dash for a missing amount", () => {
    expect(formatWon(null)).toBe("-");
    expect(formatWon(undefined)).toBe("-");
  });
});

describe("formatManwon", () => {
  it("rounds to the nearest 만원 (10,000 won)", () => {
    expect(formatManwon(300000)).toBe("30만");
    expect(formatManwon(253278)).toBe("25만");
    expect(formatManwon(268289)).toBe("27만");
  });

  it("renders an empty string for a missing amount", () => {
    expect(formatManwon(null)).toBe("");
    expect(formatManwon(undefined)).toBe("");
  });
});
