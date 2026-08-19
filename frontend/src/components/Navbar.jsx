import { Link, useNavigate } from "react-router-dom";
import VersionBadge from "./VersionBadge";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
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
          <>
            <Link to="/bookings">내 예약</Link>
            <span className="nav-user">{user.name || user.email}님</span>
            <button className="link-btn" onClick={handleLogout}>
              로그아웃
            </button>
          </>
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
