import type { WeeklyDonutTransitionSegment } from "@/components/WeeklyCategoryDonut";

const CX = 160;
const CY = 160;
const INNER_RADIUS = 75;
const OUTER_RADIUS = 128;
const HEADER_H = 24;
const TRANSITION_GREY = "#2d3748";

export type DonutTransitionArc = {
  d: string;
  color?: string;
  opacity?: number;
};

type Props = {
  segments?: WeeklyDonutTransitionSegment[];
  arc?: DonutTransitionArc | null;
  colored: boolean;
  colorDuration: number;
};

export function donutTransitionArc(start: number, end: number): string {
  const sweep = Math.max(0.01, Math.min(end - start, 359.99));
  const radians = (degree: number) => ((degree - 90) * Math.PI) / 180;
  const point = (radius: number, degree: number) => ({
    x: CX + radius * Math.cos(radians(degree)),
    y: CY + radius * Math.sin(radians(degree)),
  });
  const startOuter = point(OUTER_RADIUS, start);
  const endOuter = point(OUTER_RADIUS, start + sweep);
  const endInner = point(INNER_RADIUS, start + sweep);
  const startInner = point(INNER_RADIUS, start);
  const largeArc = sweep > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

export default function DonutTransitionOverlay({
  segments = [],
  arc,
  colored,
  colorDuration,
}: Props) {
  return (
    <div
      aria-hidden="true"
      style={{
        gridArea: "1 / 1",
        position: "relative",
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        pointerEvents: "none",
      }}
    >
      <div style={{ height: HEADER_H, flexShrink: 0 }} />
      <div style={{ display: "flex", alignItems: "flex-start", width: "100%" }}>
        <div style={{ width: 180, flexShrink: 0 }}>
          <svg width="100%" viewBox="0 0 320 320" style={{ display: "block", overflow: "visible" }}>
            {arc && (
              <path
                d={arc.d}
                fill={arc.color ?? TRANSITION_GREY}
                style={{ opacity: arc.opacity ?? 1 }}
              />
            )}
            {segments.map((segment, index) => (
              <g key={`${index}-${segment.d}`} style={{ pointerEvents: "none" }}>
                <path d={segment.d} fill={TRANSITION_GREY} style={{ opacity: colored ? 0 : 1, transition: `opacity ${colorDuration}ms ease` }} />
                <path d={segment.d} fill={segment.color} style={{ opacity: colored ? 1 : 0, transition: `opacity ${colorDuration}ms ease` }} />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}