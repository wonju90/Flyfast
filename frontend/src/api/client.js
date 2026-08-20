// 빈 문자열은 "같은 오리진(/api/...)을 그대로 써라"는 의도적인 설정이라 `??`로 구분한다.
// `||`를 쓰면 프로덕션에서 VITE_API_BASE_URL=""(same-origin)이 falsy라 로컬 기본값으로 빠진다.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

const TOKEN_KEY = "flyfast_access_token";
const REFRESH_KEY = "flyfast_refresh_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken, refreshToken) {
  if (accessToken) {
    localStorage.setItem(TOKEN_KEY, accessToken);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
  if (refreshToken) {
    localStorage.setItem(REFRESH_KEY, refreshToken);
  } else {
    localStorage.removeItem(REFRESH_KEY);
  }
}

export class ApiError extends Error {
  constructor(status, code, message) {
    // Error()는 message를 항상 ToString하므로, message가 배열(pydantic 검증 오류 목록)이면
    // 그대로 넘기면 "[object Object]"로 뭉개진다. 원본은 detail에 별도로 보관한다.
    super(typeof message === "string" ? message : code || "Request failed");
    this.status = status;
    this.code = code;
    this.detail = message;
  }
}

// 여러 요청이 동시에 401을 맞아도 리프레시 호출은 한 번만 나가도록 진행 중인 요청을 공유한다.
let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new ApiError(401, "UNAUTHORIZED", "no refresh token");
  }

  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          const detail = data && data.detail;
          throw new ApiError(res.status, detail?.error, detail?.message);
        }
        setTokens(data.access_token, data.refresh_token);
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function request(path, { method = "GET", body, auth = false, _retried = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    // 액세스 토큰 만료로 인한 401이면, 리프레시 토큰으로 한 번만 재시도한다.
    if (auth && res.status === 401 && !_retried) {
      try {
        await refreshAccessToken();
        return request(path, { method, body, auth, _retried: true });
      } catch {
        setTokens(null, null);
        localStorage.removeItem("flyfast_user");
      }
    }

    const detail = data && data.detail;
    const isObject = detail && typeof detail === "object";
    const code = isObject ? detail.error : "ERROR";
    const message = isObject ? detail.message : detail || res.statusText;
    throw new ApiError(res.status, code, message);
  }

  return data;
}

export const api = {
  health: () => request("/api/health"),

  signup: (body) => request("/api/v1/auth/signup", { method: "POST", body }),
  login: (body) => request("/api/v1/auth/login", { method: "POST", body }),

  searchAirports: (q) =>
    request(`/api/v1/airports${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  popularRoutes: (origin) =>
    request(`/api/v1/flights/popular-routes?${new URLSearchParams({ origin })}`),

  searchFlights: (params) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""))
    );
    return request(`/api/v1/flights/search?${query.toString()}`, { auth: true });
  },

  flightDetail: (scheduleId) => request(`/api/v1/flights/${scheduleId}`),

  priceCalendar: ({ origin, destination, start, end }) =>
    request(`/api/v1/flights/price-calendar?${new URLSearchParams({ origin, destination, start, end })}`),

  holdSeat: (scheduleId, seatNo) =>
    request(`/api/v1/schedules/${scheduleId}/seats/hold`, {
      method: "POST",
      body: { seat_no: seatNo },
      auth: true,
    }),

  releaseSeat: (scheduleId, seatNo) =>
    request(`/api/v1/schedules/${scheduleId}/seats/hold`, {
      method: "DELETE",
      body: { seat_no: seatNo },
      auth: true,
    }),

  createBooking: (body) => request("/api/v1/bookings", { method: "POST", body, auth: true }),

  payBooking: (bookingId, simulate) =>
    request(`/api/v1/bookings/${bookingId}/payments`, {
      method: "POST",
      body: { simulate },
      auth: true,
    }),

  myBookings: () => request("/api/v1/bookings/me", { auth: true }),

  getBooking: (bookingId) => request(`/api/v1/bookings/${bookingId}`, { auth: true }),

  cancelBooking: (bookingId) =>
    request(`/api/v1/bookings/${bookingId}/cancel`, { method: "PATCH", auth: true }),

  mySearchHistory: () => request("/api/v1/search-history/me", { auth: true }),

  setSearchFavorite: (historyId, isFavorite) =>
    request(`/api/v1/search-history/${historyId}/favorite`, {
      method: "PATCH",
      body: { is_favorite: isFavorite },
      auth: true,
    }),

  deleteSearchHistory: (historyId) =>
    request(`/api/v1/search-history/${historyId}`, { method: "DELETE", auth: true }),
};
