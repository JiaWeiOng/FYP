// src/components/ui.tsx — small presentational building blocks.
import { type ReactNode } from "react";

export function StatCard({
  label, value, tone, hint,
}: { label: string; value: ReactNode; tone?: string; hint?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={tone ? { color: tone } : undefined}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function VerdictBadge({ verdict }: { verdict: string }) {
  const cls =
    verdict === "DANGEROUS" ? "danger" :
    verdict === "SUSPICIOUS" ? "warn" :
    verdict === "SAFE" ? "safe" : "muted";
  return <span className={`badge ${cls}`}>{verdict || "—"}</span>;
}

// Hand-rolled bar chart (no chart library) — height is relative to the max value.
export function Bars({ data, color }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div className="bar-col" key={d.label + i} title={`${d.label}: ${d.value}`}>
          <div className="bar-track">
            <div className="bar-fill" style={{ height: `${(d.value / max) * 100}%`, background: color ?? "var(--primary)" }} />
          </div>
          <div className="bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
