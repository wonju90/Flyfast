import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { translateError } from "../api/errorMessages";
import { useAuth } from "../context/AuthContext";

export default function SignupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setBusy(true);
    try {
      await api.signup(form);
      await login(form.email, form.password);
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
        <h1 className="auth-hero-title">회원가입</h1>
        <p className="auth-hero-subtitle">몇 가지만 입력하면 바로 예약을 시작할 수 있어요.</p>
      </div>
      <form className="auth-form auth-form-card" onSubmit={handleSubmit}>
        <label>
          이름
          <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
        </label>
        <label>
          이메일
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
          />
        </label>
        <label>
          비밀번호 (8자 이상)
          <input
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-btn" type="submit" disabled={busy}>
          가입하기
        </button>
        <p className="auth-switch-link">
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </p>
      </form>
    </div>
  );
}
