import { useEffect, useState } from "react";
import { api } from "../api/client";

const FRONTEND_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

export default function VersionBadge() {
  const [backendVersion, setBackendVersion] = useState(null);

  useEffect(() => {
    api
      .health()
      .then((h) => setBackendVersion(h.version ?? null))
      .catch(() => setBackendVersion(null));
  }, []);

  return (
    <div className="version-strip">
      <span className="version-pill">Flyfast v{FRONTEND_VERSION}</span>
      {backendVersion && <span className="version-pill">API v{backendVersion}</span>}
    </div>
  );
}
