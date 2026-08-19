import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PriceCalendar from "./PriceCalendar";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: { priceCalendar: vi.fn() },
}));

describe("PriceCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a route-required hint and skips fetching when origin/destination are missing", () => {
    render(<PriceCalendar value="" minDate="2026-08-20" origin="" destination="" onSelect={vi.fn()} />);

    expect(screen.getByText(/출발지·도착지를 선택하면/)).toBeInTheDocument();
    expect(api.priceCalendar).not.toHaveBeenCalled();
  });

  it("fetches and displays per-day prices once a route is set", async () => {
    api.priceCalendar.mockResolvedValue({ prices: { "2026-08-25": 280000 } });

    render(
      <PriceCalendar value="" minDate="2026-08-20" origin="ICN" destination="NRT" onSelect={vi.fn()} />
    );

    expect(await screen.findByText("28만")).toBeInTheDocument();
    expect(api.priceCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "ICN", destination: "NRT" })
    );
  });

  it("disables a day before minDate even when it has price data", async () => {
    api.priceCalendar.mockResolvedValue({ prices: { "2026-08-19": 270000, "2026-08-25": 280000 } });

    render(
      <PriceCalendar value="" minDate="2026-08-20" origin="ICN" destination="NRT" onSelect={vi.fn()} />
    );
    await screen.findByText("28만");

    const day19 = screen.getByRole("button", { name: /^19/ });
    expect(day19).toBeDisabled();
  });

  it("disables a future day that has no price data", async () => {
    api.priceCalendar.mockResolvedValue({ prices: { "2026-08-25": 280000 } });

    render(
      <PriceCalendar value="" minDate="2026-08-20" origin="ICN" destination="NRT" onSelect={vi.fn()} />
    );
    await screen.findByText("28만");

    const day21 = screen.getByRole("button", { name: /^21/ });
    expect(day21).toBeDisabled();
  });

  it("calls onSelect with the clicked date for an enabled priced day", async () => {
    api.priceCalendar.mockResolvedValue({ prices: { "2026-08-25": 280000 } });
    const onSelect = vi.fn();

    render(
      <PriceCalendar
        value=""
        minDate="2026-08-20"
        origin="ICN"
        destination="NRT"
        onSelect={onSelect}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /^25/ }));

    expect(onSelect).toHaveBeenCalledWith("2026-08-25");
  });

  it("shows a no-data hint instead of a silently empty grid when the route has no fares", async () => {
    api.priceCalendar.mockResolvedValue({ prices: {} });

    render(
      <PriceCalendar value="" minDate="2026-08-20" origin="SIN" destination="JFK" onSelect={vi.fn()} />
    );

    expect(await screen.findByText(/운항 데이터가 없습니다/)).toBeInTheDocument();
  });

  it("does not show the no-data hint while a route with real fares is still loading", () => {
    api.priceCalendar.mockReturnValue(new Promise(() => {})); // never resolves

    render(
      <PriceCalendar value="" minDate="2026-08-20" origin="ICN" destination="NRT" onSelect={vi.fn()} />
    );

    expect(screen.queryByText(/운항 데이터가 없습니다/)).not.toBeInTheDocument();
    expect(screen.getByText("요금 불러오는 중...")).toBeInTheDocument();
  });

  it("navigates months independently and refetches prices for the new range", async () => {
    api.priceCalendar.mockResolvedValue({ prices: {} });

    render(
      <PriceCalendar
        value="2026-08-20"
        minDate="2026-08-20"
        origin="ICN"
        destination="NRT"
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => expect(api.priceCalendar).toHaveBeenCalledTimes(1));
    expect(screen.getByText("2026년 8월")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다음 달" }));

    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
    await waitFor(() => expect(api.priceCalendar).toHaveBeenCalledTimes(2));
  });
});
