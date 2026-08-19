import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { translateError } from "../api/errorMessages";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(translateError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <h1 className="auth-hero-title">로그인</h1>
        <p className="auth-hero-subtitle">다시 만나서 반가워요. 로그인하고 예약을 이어가세요.</p>
      </div>
      <form className="auth-form auth-form-card" onSubmit={handleSubmit}>
        <label>
          이메일
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-btn" type="submit" disabled={busy}>
          로그인
        </button>
        <p className="auth-switch-link">
          아직 계정이 없으신가요? <Link to="/signup">회원가입</Link>
        </p>
      </form>
    </div>
  );
}
