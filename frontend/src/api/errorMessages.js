// 백엔드는 error 코드는 안정적으로 유지하지만 message는 영어 원문 그대로 내려준다.
// 화면에는 이 파일을 거쳐 한국어 문구만 노출한다.

const FIELD_LABELS = {
  email: "이메일",
  password: "비밀번호",
  name: "이름",
  seat_no: "좌석 번호",
  schedule_id: "일정",
  passengers: "탑승객 목록",
  origin: "출발지",
  destination: "도착지",
  adults: "인원 수",
  depart: "가는 날",
  return: "오는 날",
  refresh_token: "인증 정보",
  simulate: "결제 시뮬레이션 값",
};

function fieldLabel(field) {
  return FIELD_LABELS[field] || "입력값";
}

// pydantic이 내려주는 요청 검증 오류(422/400 message가 배열인 경우) 번역
const VALIDATION_TYPE_LABELS = {
  string_too_long: (ctx) => `최대 ${ctx?.max_length ?? "N"}자까지 입력할 수 있어요.`,
  string_too_short: (ctx) => `최소 ${ctx?.min_length ?? "N"}자 이상 입력해주세요.`,
  missing: () => "필수 입력값이 비어 있어요.",
  value_error: () => "형식이 올바르지 않아요.",
  int_parsing: () => "숫자만 입력할 수 있어요.",
  int_type: () => "숫자만 입력할 수 있어요.",
  string_type: () => "문자만 입력할 수 있어요.",
};

function translateValidationErrors(errors) {
  const first = errors?.[0];
  if (!first) return "입력값을 다시 확인해주세요.";
  const field = first.loc?.[first.loc.length - 1];
  const detail = VALIDATION_TYPE_LABELS[first.type]?.(first.ctx) ?? "값을 다시 확인해주세요.";
  return `${fieldLabel(field)}: ${detail}`;
}

// 특정 code에서만 등장하는, 값이 끼워진(seat_no/schedule_id 등) 영문 메시지 패턴 번역
const DYNAMIC_PATTERNS = [
  { code: "FLIGHT_NOT_FOUND", re: /^schedule \S+ not found$/, tr: () => "해당 항공편 일정을 찾을 수 없습니다." },
  { code: "FLIGHT_NOT_FOUND", re: /^booking \S+ not found$/, tr: () => "해당 예약을 찾을 수 없습니다." },
  { code: "FLIGHT_NOT_FOUND", re: /^seat (\S+) not found on schedule/, tr: (m) => `좌석 ${m[1]}을(를) 찾을 수 없습니다.` },
  { code: "SEAT_ALREADY_HELD", re: /^seat (\S+) is already sold$/, tr: (m) => `좌석 ${m[1]}은(는) 이미 판매되었습니다. 다른 좌석을 선택해주세요.` },
  { code: "SEAT_ALREADY_HELD", re: /^seat (\S+) is (already held|held) by another user$/, tr: (m) => `좌석 ${m[1]}은(는) 다른 사용자가 선점 중입니다. 다른 좌석을 선택해주세요.` },
  { code: "SEAT_ALREADY_HELD", re: /^one or more seats were already booked by someone else$/, tr: () => "선택하신 좌석 중 일부가 이미 판매되었거나 다른 사용자가 선점했습니다. 좌석 상태를 다시 확인해주세요." },
  { code: "HOLD_EXPIRED", re: /^hold for seat (\S+) not found or already expired$/, tr: (m) => `좌석 ${m[1]}의 선점 시간이 만료되었습니다. 좌석을 다시 선택해주세요.` },
  { code: "HOLD_EXPIRED", re: /^hold for seat (\S+) expired before payment$/, tr: (m) => `결제 전에 좌석 ${m[1]}의 선점이 만료되었습니다.` },
  { code: "INVALID_INPUT", re: /^(\S+) must be in YYYY-MM-DD format$/, tr: (m) => `${fieldLabel(m[1])} 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)` },
];

// 고정 문자열(값이 끼워지지 않는) 영문 메시지 번역
const STATIC_MESSAGES = {
  "invalid email format": "이메일 형식이 올바르지 않습니다.",
  "password must be at least 8 characters": "비밀번호는 8자 이상이어야 합니다.",
  "name is required": "이름을 입력해주세요.",
  "email already registered": "이미 가입된 이메일입니다.",
  "origin and destination are required": "출발지와 도착지를 입력해주세요.",
  "origin and destination must differ": "출발지와 도착지는 다르게 선택해주세요.",
  "adults must be between 1 and 9": "인원 수는 1명에서 9명 사이여야 합니다.",
  "passengers must contain at least one entry": "탑승객을 1명 이상 입력해주세요.",
  "duplicate seat_no in passengers list": "탑승객 목록에 같은 좌석이 중복되어 있습니다. 좌석을 다시 확인해주세요.",
  "simulate must be 'success' or 'fail'": "결제 요청 값이 올바르지 않습니다.",
  "cannot pay for a cancelled booking": "취소된 예약은 결제할 수 없습니다.",
  "only the holder can release this seat hold": "본인이 선점한 좌석만 해제할 수 있습니다.",
  "this booking does not belong to the current user": "본인의 예약만 확인할 수 있습니다.",
  "invalid email or password": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "refresh token expired": "로그인이 만료되었습니다. 다시 로그인해주세요.",
  "invalid refresh token": "로그인 정보가 올바르지 않습니다. 다시 로그인해주세요.",
  "not a refresh token": "로그인 정보가 올바르지 않습니다. 다시 로그인해주세요.",
  "refresh token has been superseded or revoked": "다른 기기 또는 다른 곳에서 로그인되어 세션이 종료되었습니다. 다시 로그인해주세요.",
  "missing bearer token": "로그인이 필요합니다.",
  "access token expired": "로그인이 만료되었습니다. 다시 로그인해주세요.",
  "invalid access token": "로그인 정보가 올바르지 않습니다. 다시 로그인해주세요.",
  "not an access token": "로그인 정보가 올바르지 않습니다. 다시 로그인해주세요.",
  "user for this token no longer exists": "계정 정보를 찾을 수 없습니다. 다시 로그인해주세요.",
  "no refresh token": "로그인이 필요합니다.",
};

// 위 어느 것에도 안 걸렸을 때 code 기준 최종 fallback
const CODE_FALLBACKS = {
  INVALID_INPUT: "입력값을 다시 확인해주세요.",
  UNAUTHORIZED: "로그인이 필요하거나 로그인 정보가 만료되었습니다. 다시 로그인해주세요.",
  FORBIDDEN: "이 작업을 수행할 권한이 없습니다.",
  FLIGHT_NOT_FOUND: "요청하신 정보를 찾을 수 없습니다.",
  SEAT_ALREADY_HELD: "선택하신 좌석을 더 이상 사용할 수 없습니다. 다른 좌석을 선택해주세요.",
  HOLD_EXPIRED: "좌석 선점 시간이 만료되었습니다. 좌석을 다시 선택해주세요.",
};

const DEFAULT_FALLBACK = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";

export function translateError(err) {
  if (!err) return DEFAULT_FALLBACK;

  const code = err.code;
  const rawMessage = err.detail ?? err.message;

  if (Array.isArray(rawMessage)) {
    return translateValidationErrors(rawMessage);
  }

  if (typeof rawMessage === "string") {
    if (STATIC_MESSAGES[rawMessage]) return STATIC_MESSAGES[rawMessage];
    for (const pattern of DYNAMIC_PATTERNS) {
      if (pattern.code && pattern.code !== code) continue;
      const match = rawMessage.match(pattern.re);
      if (match) return pattern.tr(match);
    }
  }

  if (code && CODE_FALLBACKS[code]) return CODE_FALLBACKS[code];

  return DEFAULT_FALLBACK;
}
