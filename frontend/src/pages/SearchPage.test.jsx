import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SearchPage from "./SearchPage";

const { MOCK_AIRPORTS } = vi.hoisted(() => ({
  MOCK_AIRPORTS: [
    { code: "ICN", name: "인천", continent: "아시아" },
    { code: "NRT", name: "도쿄(나리타)", continent: "아시아" },
    { code: "CDG", name: "파리(샤를 드골)", continent: "유럽" },
  ],
}));

vi.mock("../api/client", () => ({
  api: {
    health: vi.fn().mockResolvedValue({ server_ip: "127.0.0.1" }),
    searchAirports: vi.fn().mockResolvedValue({ airports: MOCK_AIRPORTS }),
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

  it("defaults to ICN/NRT shown as Korean city names", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: "출발지" })).toHaveTextContent("인천");
    expect(screen.getByRole("button", { name: "도착지" })).toHaveTextContent("도쿄(나리타)");
  });

  it("groups airports by continent in the origin picker", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "출발지" }));

    expect(screen.getByText("아시아")).toBeInTheDocument();
    expect(screen.getByText("유럽")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "파리(샤를 드골)" })).toBeInTheDocument();
  });

  it("selects a city from the picker, updates the trigger, and closes the popover", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "도착지" }));
    fireEvent.click(screen.getByRole("button", { name: "파리(샤를 드골)" }));

    expect(screen.getByRole("button", { name: "도착지" })).toHaveTextContent("파리(샤를 드골)");
    expect(screen.queryByText("아시아")).not.toBeInTheDocument();
  });

  it("closes the picker when clicking outside without changing the selection", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "출발지" }));
    expect(screen.getByText("아시아")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("아시아")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "출발지" })).toHaveTextContent("인천");
  });

  it("swaps origin and destination when the swap button is clicked", async () => {
    await renderPage();
    const originTrigger = screen.getByRole("button", { name: "출발지" });
    const destinationTrigger = screen.getByRole("button", { name: "도착지" });
    expect(originTrigger).toHaveTextContent("인천");
    expect(destinationTrigger).toHaveTextContent("도쿄(나리타)");

    fireEvent.click(screen.getByRole("button", { name: "출발지/도착지 교환" }));

    expect(originTrigger).toHaveTextContent("도쿄(나리타)");
    expect(destinationTrigger).toHaveTextContent("인천");
  });

  it("shows an error when submitting with no depart date selected", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "항공편 검색" }));

    expect(screen.getByText("출발일을 선택해주세요.")).toBeInTheDocument();
  });

  it("shows an error when destination is changed to match the origin", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "도착지" }));
    fireEvent.click(screen.getByRole("button", { name: "인천" }));

    fireEvent.click(screen.getByRole("button", { name: "항공편 검색" }));

    expect(screen.getByText("출발지와 도착지는 달라야 합니다.")).toBeInTheDocument();
  });
});
