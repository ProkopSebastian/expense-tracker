import { Sparkles, Wrench, Dot } from "lucide-react";
import type { ChangelogLineType, ChangelogRelease } from "../changelog";

const badges: Record<
  ChangelogLineType,
  { icon: typeof Sparkles; className: string }
> = {
  feat: { icon: Sparkles, className: "bg-accent-soft text-accent" },
  fix: { icon: Wrench, className: "bg-warning/15 text-warning" },
  other: { icon: Dot, className: "bg-surface-muted text-muted" },
};

export default function ChangelogList({
  releases,
}: {
  releases: ChangelogRelease[];
}) {
  if (releases.length === 0) {
    return <p className="text-sm text-muted">Brak informacji o zmianach.</p>;
  }
  return (
    <div className="space-y-5">
      {releases.map((release) => (
        <div key={release.version}>
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm! font-semibold">{release.version}</h3>
            {release.date && (
              <span className="text-xs text-muted">{release.date}</span>
            )}
          </div>
          <ul className="mt-2 space-y-1.5">
            {release.lines.map((line, index) => {
              const { icon: Icon, className } = badges[line.type];
              return (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm leading-relaxed text-muted"
                >
                  <span
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${className}`}
                  >
                    <Icon size={12} />
                  </span>
                  {line.text}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
