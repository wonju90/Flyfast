import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AirportPicker from "./AirportPicker";

const AIRPORTS = [
  { code: "ICN", name: "인천", continent: "아시아" },
  { code: "NRT", name: "도쿄(나리타)", continent: "아시아" },
  { code: "LAX", name: "로스앤젤레스", continent: "북미" },
  { code: "XXX", name: "XXX", continent: "기타" },
];

describe("AirportPicker", () => {
  it("shows the placeholder when no airport is selected", () => {
    render(
      <AirportPicker label="출발지" value="" airports={AIRPORTS} onSelect={vi.fn()} placeholder="출발지 선택" />
    );

    expect(screen.getByRole("button", { name: "출발지" })).toHaveTextContent("출발지 선택");
  });

  it("shows the Korean name for the selected code instead of the raw code", () => {
    render(
      <AirportPicker label="출발지" value="ICN" airports={AIRPORTS} onSelect={vi.fn()} placeholder="선택" />
    );

    expect(screen.getByRole("button", { name: "출발지" })).toHaveTextContent("인천");
  });

  it("falls back to the raw code when it has no known mapping", () => {
    render(
      <AirportPicker label="출발지" value="ZZZ" airports={AIRPORTS} onSelect={vi.fn()} placeholder="선택" />
    );

    expect(screen.getByRole("button", { name: "출발지" })).toHaveTextContent("ZZZ");
  });

  it("is closed by default and opens the continent-grouped popover on click", () => {
    render(
      <AirportPicker label="출발지" value="" airports={AIRPORTS} onSelect={vi.fn()} placeholder="선택" />
    );

    expect(screen.queryByText("아시아")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "출발지" }));

    expect(screen.getByText("아시아")).toBeInTheDocument();
    expect(screen.getByText("북미")).toBeInTheDocument();
    expect(screen.getByText("기타")).toBeInTheDocument();
  });

  it("orders known continents before the 기타 fallback group", () => {
    render(
      <AirportPicker label="출발지" value="" airports={AIRPORTS} onSelect={vi.fn()} placeholder="선택" />
    );
    fireEvent.click(screen.getByRole("button", { name: "출발지" }));

    const labels = screen.getAllByText(/아시아|유럽|북미|기타/).map((el) => el.textContent);
    expect(labels).toEqual(["아시아", "북미", "기타"]);
  });

  it("calls onSelect with the clicked airport's code and closes the popover", () => {
    const onSelect = vi.fn();
    render(
      <AirportPicker label="출발지" value="" airports={AIRPORTS} onSelect={onSelect} placeholder="선택" />
    );

    fireEvent.click(screen.getByRole("button", { name: "출발지" }));
    fireEvent.click(screen.getByRole("button", { name: "로스앤젤레스" }));

    expect(onSelect).toHaveBeenCalledWith("LAX");
    expect(screen.queryByText("아시아")).not.toBeInTheDocument();
  });

  it("marks the currently selected city distinctly from the others", () => {
    render(
      <AirportPicker label="출발지" value="ICN" airports={AIRPORTS} onSelect={vi.fn()} placeholder="선택" />
    );
    fireEvent.click(screen.getByRole("button", { name: "출발지" }));

    expect(screen.getByRole("button", { name: "인천" })).toHaveClass("airport-city-selected");
    expect(screen.getByRole("button", { name: "도쿄(나리타)" })).not.toHaveClass(
      "airport-city-selected"
    );
  });

  it("closes when clicking outside without selecting anything", () => {
    const onSelect = vi.fn();
    render(
      <AirportPicker label="출발지" value="" airports={AIRPORTS} onSelect={onSelect} placeholder="선택" />
    );

    fireEvent.click(screen.getByRole("button", { name: "출발지" }));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("아시아")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
