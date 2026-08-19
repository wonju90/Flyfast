import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SearchPage from "./SearchPage";

vi.mock("../api/client", () => ({
  api: {
    health: vi.fn().mockResolvedValue({ server_ip: "127.0.0.1" }),
    searchAirports: vi.fn().mockResolvedValue({ airports: [] }),
    priceCalendar: vi.fn().mockResolvedValue({ prices: {} }),
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

async function renderPage() {
  const result = render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>
  );
  // health/searchAirports resolve on mount — flush that microtask inside act()
  // before making assertions, so React doesn't warn about an unwrapped update.
  await act(async () => {});
  return result;
}

describe("SearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to 편도 mode with only a 출발일 date trigger", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: "출발일" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "귀국일" })).not.toBeInTheDocument();
  });

  it("switches to 왕복 mode and renders both 출발일 and 귀국일 date triggers", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "왕복" }));

    expect(screen.getByRole("button", { name: "출발일" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "귀국일" })).toBeInTheDocument();
  });

  it("swaps origin and destination when the swap button is clicked", async () => {
    await renderPage();
    const origin = screen.getByPlaceholderText("ICN");
    const destination = screen.getByPlaceholderText("NRT");
    expect(origin.value).toBe("ICN");
    expect(destination.value).toBe("NRT");

    fireEvent.click(screen.getByRole("button", { name: "출발지/도착지 교환" }));

    expect(origin.value).toBe("NRT");
    expect(destination.value).toBe("ICN");
  });

  it("shows an error when submitting with no depart date selected", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "항공편 검색" }));

    expect(screen.getByText("출발일을 선택해주세요.")).toBeInTheDocument();
  });

  it("shows an error when origin and destination are the same", async () => {
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText("NRT"), { target: { value: "ICN" } });

    fireEvent.click(screen.getByRole("button", { name: "항공편 검색" }));

    expect(screen.getByText("출발지와 도착지는 달라야 합니다.")).toBeInTheDocument();
  });

  it("clears a prefilled airport input on focus and restores it on blur without a selection", async () => {
    await renderPage();
    const origin = screen.getByPlaceholderText("ICN");

    fireEvent.focus(origin);
    expect(origin.value).toBe("");

    fireEvent.blur(origin);
    expect(origin.value).toBe("ICN");
  });

  it("keeps a typed airport value on blur instead of reverting it", async () => {
    await renderPage();
    const origin = screen.getByPlaceholderText("ICN");

    fireEvent.focus(origin);
    fireEvent.change(origin, { target: { value: "GMP" } });
    fireEvent.blur(origin);

    expect(origin.value).toBe("GMP");
  });
});
