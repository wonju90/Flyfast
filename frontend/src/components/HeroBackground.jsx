// 외부 이미지 호스팅 없이, 순수 SVG로 "항공권 사이트" 느낌의 배경 장식을 그린다 —
// 점선 항로 + 경유 도시 점 + 비행기, 그리고 별처럼 흩뿌린 점들.
const STARS = [
  [150, 55, 2], [260, 28, 1.5], [340, 90, 1.5], [430, 40, 2],
  [520, 70, 1.5], [720, 30, 2], [830, 80, 1.5], [900, 25, 1.5],
  [980, 100, 2], [1060, 60, 1.5], [1130, 110, 2], [60, 130, 1.5],
];

export default function HeroBackground() {
  return (
    <svg
      className="hero-bg-decoration"
      viewBox="0 0 1200 400"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {STARS.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="white" opacity="0.35" />
      ))}
      <path
        d="M 60 330 C 280 330, 340 120, 610 105 S 1000 55, 1140 35"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeDasharray="2 10"
        strokeLinecap="round"
        opacity="0.3"
      />
      <circle cx="60" cy="330" r="5" fill="white" opacity="0.45" />
      <circle cx="610" cy="105" r="5" fill="white" opacity="0.45" />
      <text x="1108" y="46" fontSize="30" opacity="0.6" transform="rotate(-20 1123 40)">
        ✈️
      </text>
    </svg>
  );
}
