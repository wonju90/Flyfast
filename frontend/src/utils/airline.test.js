import { describe, expect, it } from "vitest";
import { getAirlineInfo } from "./airline";

describe("getAirlineInfo", () => {
  it("resolves KE flight numbers to Korean Air", () => {
    expect(getAirlineInfo("KE001")).toEqual({ name: "대한항공", color: "#0b3d78" });
  });

  it("resolves OZ flight numbers to Asiana", () => {
    expect(getAirlineInfo("OZ601")).toEqual({ name: "아시아나항공", color: "#8f1b2d" });
  });

  it("falls back to the raw 2-letter code for an unknown carrier", () => {
    expect(getAirlineInfo("LJ123")).toEqual({ name: "LJ", color: "var(--navy)" });
  });
});
