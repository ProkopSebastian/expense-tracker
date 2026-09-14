import raw from "../../CHANGELOG.md?raw";

export type ChangelogLineType = "feat" | "fix" | "other";

export interface ChangelogLine {
  type: ChangelogLineType;
  text: string;
}

export interface ChangelogRelease {
  version: string;
  date: string;
  lines: ChangelogLine[];
}

function parseLine(line: string): ChangelogLine {
  const match = /^-\s*(feat|fix)\s*:\s*(.+)$/i.exec(line);
  if (match) return { type: match[1].toLowerCase() as ChangelogLineType, text: match[2].trim() };
  return { type: "other", text: line.replace(/^-\s*/, "").trim() };
}

export const changelog: ChangelogRelease[] = raw
  .split(/\n(?=##\s)/)
  .map((block) => block.trim())
  .filter(Boolean)
  .map((block) => {
    const [heading, ...rest] = block.split("\n");
    const headingMatch = /^##\s*(\S+)\s*—\s*(.+)$/.exec(heading.trim());
    return {
      version: headingMatch?.[1] ?? heading.replace(/^##\s*/, "").trim(),
      date: headingMatch?.[2]?.trim() ?? "",
      lines: rest
        .map((entry) => entry.trim())
        .filter((entry) => entry.startsWith("-"))
        .map(parseLine),
    };
  });
