import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";
import { useAuth } from "../context/AuthContext";

vi.mock("../api/client", () => ({
  api: { health: vi.fn().mockResolvedValue({ version: "0.1.0" }) },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

async function renderNavbar() {
  const result = render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );
  // VersionBadge fetches health on mount — flush that inside act() first.
  await act(async () => {});
  return result;
}

describe("Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows login/signup links when logged out, no user dropdown", async () => {
    useAuth.mockReturnValue({ user: null, logout: vi.fn() });
    await renderNavbar();

    expect(screen.getByText("로그인")).toBeInTheDocument();
    expect(screen.getByText("회원가입")).toBeInTheDocument();
    expect(screen.queryByText(/님$/)).not.toBeInTheDocument();
  });

  it("collapses 내 예약/로그아웃 into a closed dropdown that opens on click", async () => {
    useAuth.mockReturnValue({ user: { name: "홍길동", email: "hong@example.com" }, logout: vi.fn() });
    await renderNavbar();

    const trigger = screen.getByRole("button", { name: /홍길동님/ });
    expect(screen.queryByText("내 예약")).not.toBeInTheDocument();
    expect(screen.queryByText("로그아웃")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByText("내 예약")).toBeInTheDocument();
    expect(screen.getByText("로그아웃")).toBeInTheDocument();
  });

  it("falls back to email when the session predates the registered-name feature", async () => {
    useAuth.mockReturnValue({ user: { email: "old@example.com" }, logout: vi.fn() });
    await renderNavbar();

    expect(screen.getByRole("button", { name: /old@example\.com님/ })).toBeInTheDocument();
  });

  it("closes the dropdown when clicking outside it", async () => {
    useAuth.mockReturnValue({ user: { name: "홍길동" }, logout: vi.fn() });
    await renderNavbar();

    fireEvent.click(screen.getByRole("button", { name: /홍길동님/ }));
    expect(screen.getByText("내 예약")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("내 예약")).not.toBeInTheDocument();
  });

  it("calls logout and closes the dropdown when 로그아웃 is clicked", async () => {
    const logout = vi.fn();
    useAuth.mockReturnValue({ user: { name: "홍길동" }, logout });
    await renderNavbar();

    fireEvent.click(screen.getByRole("button", { name: /홍길동님/ }));
    fireEvent.click(screen.getByText("로그아웃"));

    expect(logout).toHaveBeenCalledOnce();
    expect(screen.queryByText("내 예약")).not.toBeInTheDocument();
  });

  it("closes the dropdown after navigating to 내 예약", async () => {
    useAuth.mockReturnValue({ user: { name: "홍길동" }, logout: vi.fn() });
    await renderNavbar();

    fireEvent.click(screen.getByRole("button", { name: /홍길동님/ }));
    fireEvent.click(screen.getByText("내 예약"));

    expect(screen.queryByText("내 예약")).not.toBeInTheDocument();
  });
});
