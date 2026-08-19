import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import VersionBadge from "./VersionBadge";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/");
  }

  return (
    <nav className="navbar">
      <div className="brand-group">
        <Link to="/" className="brand">
          Flyfast
        </Link>
        <VersionBadge />
      </div>
      <div className="nav-links">
        {user ? (
          <div className="nav-user-menu" ref={menuRef}>
            <button
              type="button"
              className="nav-user-trigger"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              {user.name || user.email}님
              <span className="nav-user-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {menuOpen && (
              <div className="nav-user-dropdown">
                <Link
                  to="/bookings"
                  className="nav-user-dropdown-item"
                  onClick={() => setMenuOpen(false)}
                >
                  내 예약
                </Link>
                <button
                  type="button"
                  className="nav-user-dropdown-item"
                  onClick={handleLogout}
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link to="/login">로그인</Link>
            <Link to="/signup" className="nav-cta">
              회원가입
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
