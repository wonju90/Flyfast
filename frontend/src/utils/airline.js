export const AIRLINE_INFO = {
  KE: { name: "대한항공", color: "#0b3d78" },
  OZ: { name: "아시아나항공", color: "#8f1b2d" },
};

export function getAirlineInfo(flightNo) {
  const code = flightNo.slice(0, 2);
  return AIRLINE_INFO[code] ?? { name: code, color: "var(--navy)" };
}
