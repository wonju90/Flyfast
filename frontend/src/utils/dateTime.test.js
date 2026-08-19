import { describe, expect, it } from "vitest";
import { formatClock, formatDuration, formatTime, pad2, toDateStr, todayStr } from "./dateTime";

describe("pad2", () => {
  it("pads single digits with a leading zero", () => {
    expect(pad2(5)).toBe("05");
  });

  it("leaves two-digit numbers unchanged", () => {
    expect(pad2(12)).toBe("12");
  });
});

describe("toDateStr", () => {
  it("formats a zero-indexed month into a YYYY-MM-DD string", () => {
    expect(toDateStr(2026, 0, 4)).toBe("2026-01-04");
    expect(toDateStr(2026, 11, 25)).toBe("2026-12-25");
  });
});

describe("todayStr", () => {
  it("returns today's local date in YYYY-MM-DD format", () => {
    const result = todayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const now = new Date();
    const expected = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    expect(result).toBe(expected);
  });
});

describe("formatTime", () => {
  it("formats an ISO string as MM/DD HH:mm in ko-KR locale", () => {
    const result = formatTime("2026-09-04T09:30:00");
    expect(result).toContain("09");
    expect(result).toContain("30");
  });
});

describe("formatClock", () => {
  it("formats only the hour and minute, 24-hour style", () => {
    expect(formatClock("2026-09-04T09:00:00")).toBe("09:00");
    expect(formatClock("2026-09-04T23:05:00")).toBe("23:05");
  });
});

describe("formatDuration", () => {
  it("formats a duration under an hour as minutes only", () => {
    expect(formatDuration("2026-09-04T09:00:00", "2026-09-04T09:45:00")).toBe("45분");
  });

  it("formats an exact-hour duration without a minutes suffix", () => {
    expect(formatDuration("2026-09-04T09:00:00", "2026-09-04T12:00:00")).toBe("3시간");
  });

  it("formats a duration with both hours and minutes", () => {
    expect(formatDuration("2026-09-04T09:00:00", "2026-09-04T11:30:00")).toBe("2시간 30분");
  });

  it("handles long-haul durations spanning many hours", () => {
    expect(formatDuration("2026-09-04T10:00:00", "2026-09-04T21:00:00")).toBe("11시간");
  });
});
