import { describe, expect, it } from "vitest";
import { groupSeatsForMap } from "./seatMap";

function seat(seat_no, seat_class) {
  return { seat_no, seat_class, status: "AVAILABLE" };
}

describe("groupSeatsForMap", () => {
  it("orders cabins as FIRST, then BUSINESS, then ECONOMY regardless of input order", () => {
    const seats = [
      seat("2A", "ECONOMY"),
      seat("1A", "FIRST"),
      seat("1B", "BUSINESS"),
    ];

    const groups = groupSeatsForMap(seats);

    expect(groups.map((g) => g.seatClass)).toEqual(["FIRST", "BUSINESS", "ECONOMY"]);
  });

  it("groups seats into rows parsed from the leading digits of seat_no, sorted ascending", () => {
    const seats = [
      seat("3A", "ECONOMY"),
      seat("1A", "ECONOMY"),
      seat("2A", "ECONOMY"),
    ];

    const groups = groupSeatsForMap(seats);
    const rows = groups[0].rows;

    expect(rows).toHaveLength(3);
    expect(rows[0][0].seat_no).toBe("1A");
    expect(rows[1][0].seat_no).toBe("2A");
    expect(rows[2][0].seat_no).toBe("3A");
  });

  it("sorts seats within a row alphabetically by seat letter", () => {
    const seats = [seat("1C", "ECONOMY"), seat("1A", "ECONOMY"), seat("1B", "ECONOMY")];

    const groups = groupSeatsForMap(seats);

    expect(groups[0].rows[0].map((s) => s.seat_no)).toEqual(["1A", "1B", "1C"]);
  });

  it("puts an unrecognized cabin class after the known ones instead of dropping it", () => {
    const seats = [seat("1A", "ECONOMY"), seat("1B", "PREMIUM")];

    const groups = groupSeatsForMap(seats);

    expect(groups.map((g) => g.seatClass)).toEqual(["ECONOMY", "PREMIUM"]);
  });

  it("returns an empty array for no seats", () => {
    expect(groupSeatsForMap([])).toEqual([]);
  });
});
