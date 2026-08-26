import type { ReactElement } from "react";
import type { EnvelopePoint, Profile } from "@/lib/vfr/wb";

type Props = {
  cg: number;
  weight: number;
  minL: number;
  maxL: number;
  profile: Profile;
  env: EnvelopePoint[];
  within: boolean;
};

export function CgChart({ cg, weight, minL, maxL, profile, env, within }: Props) {
  const w = 560;
  const h = 340;
  const padL = 56;
  const padR = 20;
  const padT = 16;
  const padB = 34;

  let cgMin = minL || profile.beArm - 200 || 800;
  let cgMax = maxL || profile.beArm + 200 || 1200;
  if (env.length >= 2) {
    cgMin = Math.min(...env.map((e) => e.min));
    cgMax = Math.max(...env.map((e) => e.max));
  }
  const span = cgMax - cgMin || 100;
  const xMin = cgMin - span * 0.15;
  const xMax = cgMax + span * 0.15;
  const envWeights = env.map((e) => e.w);
  const rawYMin = Math.min(...envWeights, weight || Infinity);
  const rawYMax = Math.max(...envWeights, profile.maxWeight || 0, weight || 0);
  const ySpan = rawYMax - rawYMin || rawYMax || 1000;
  const yMin = Math.max(0, (Number.isFinite(rawYMin) ? rawYMin : 0) - ySpan * 0.08);
  const yMax = rawYMax + ySpan * 0.08;
  const x = (v: number) => padL + ((v - xMin) / (xMax - xMin)) * (w - padL - padR);
  const y = (v: number) => h - padB - ((v - yMin) / (yMax - yMin || 1)) * (h - padT - padB);

  const ticks = Array.from({ length: 7 }, (_, i) => i);

  let shape: ReactElement | null = null;
  if (env.length >= 2) {
    const left = env.map((e) => `${x(e.min)},${y(e.w)}`).join(" ");
    const right = env
      .slice()
      .reverse()
      .map((e) => `${x(e.max)},${y(e.w)}`)
      .join(" ");
    shape = (
      <polygon
        points={`${left} ${right}`}
        className="fill-primary/10 stroke-primary"
        strokeWidth={1.25}
      />
    );
  } else if (minL && maxL) {
    shape = (
      <rect
        x={x(minL)}
        y={profile.maxWeight ? y(profile.maxWeight) : padT}
        width={x(maxL) - x(minL)}
        height={profile.maxWeight ? y(yMin) - y(profile.maxWeight) : h - padT - padB}
        className="fill-primary/10 stroke-primary"
        strokeWidth={1.25}
      />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full font-mono text-[10px]"
      role="img"
      aria-label="Centre of gravity envelope chart"
    >
      {shape}
      {ticks.map((i) => {
        const xv = xMin + (i * (xMax - xMin)) / 6;
        const yv = yMin + (i * (yMax - yMin)) / 6;
        return (
          <g key={i}>
            <line
              x1={x(xv)}
              y1={padT}
              x2={x(xv)}
              y2={h - padB}
              className="stroke-border"
              strokeDasharray="2 3"
            />
            <text x={x(xv)} y={h - 12} textAnchor="middle" className="fill-muted-foreground">
              {xv.toFixed(0)}
            </text>
            <line
              x1={padL}
              y1={y(yv)}
              x2={w - padR}
              y2={y(yv)}
              className="stroke-border"
              strokeDasharray="2 3"
            />
            <text
              x={padL - 8}
              y={y(yv) + 4}
              textAnchor="end"
              className="fill-muted-foreground"
            >
              {yv.toFixed(0)}
            </text>
          </g>
        );
      })}
      {weight > 0 && (
        <circle
          cx={x(cg)}
          cy={y(weight)}
          r={6}
          className={within ? "fill-success" : "fill-destructive"}
          stroke="white"
          strokeWidth={2}
        />
      )}
      <text x={w / 2} y={h - 1} textAnchor="middle" className="fill-muted-foreground">
        CG ({profile.unitArm})
      </text>
      <text x={4} y={12} className="fill-muted-foreground">
        Weight ({profile.unitWeight})
      </text>
    </svg>
  );
}
