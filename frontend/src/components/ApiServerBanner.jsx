import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function ApiServerBanner() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="api-server-banner">
      <span className="api-server-label">현재 연결된 API 서버</span>
      <span className="api-server-ip">{health?.server_ip ?? "확인 중..."}</span>
    </div>
  );
}
