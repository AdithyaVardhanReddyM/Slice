import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CodeLanguage = "html" | "jsx" | "liquid" | "bash" | "text";

// Restrained syntax tints on a muted surface; foreground carries everything else.
const TINT = {
  comment: "text-muted-foreground",
  string: "text-emerald-700 dark:text-emerald-400",
  tag: "text-blue-700 dark:text-blue-400",
  attr: "text-orange-700 dark:text-orange-400",
  keyword: "font-medium text-foreground",
  liquid: "text-amber-700 dark:text-amber-400",
  punct: "text-muted-foreground",
} as const;

function pattern(language: CodeLanguage) {
  const comment =
    language === "bash"
      ? String.raw`(?<comment>#[^\n]*)`
      : String.raw`(?<comment><!--.*?-->|\{\/\*.*?\*\/\}|\/\/[^\n]*)`;
  return new RegExp(
    [
      comment,
      String.raw`(?<liquid>\{\{.*?\}\}|\{%.*?%\})`,
      String.raw`(?<string>"[^"\n]*"|'[^'\n]*'|\x60[^\x60\n]*\x60)`,
      String.raw`(?<tag></?[A-Za-z][\w.-]*)`,
      String.raw`(?<attr>[\w:-]+(?==))`,
      String.raw`(?<keyword>\b(?:import|from|export|default|function|return|const|async|await|curl)\b)`,
      String.raw`(?<punct>/?>|[{}()=\\])`,
    ].join("|"),
    "g",
  );
}

function highlight(line: string, language: CodeLanguage): ReactNode[] {
  if (language === "text") return [line];
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(pattern(language))) {
    const i = m.index ?? 0;
    if (i > last) out.push(line.slice(last, i));
    const groups = m.groups ?? {};
    const kind = (Object.keys(TINT) as (keyof typeof TINT)[]).find(
      (k) => groups[k] !== undefined,
    );
    const text = m[0];
    if (kind === "tag") {
      const slash = text.startsWith("</") ? 2 : 1;
      out.push(
        <span key={i} className={TINT.punct}>
          {text.slice(0, slash)}
        </span>,
        <span key={`${i}t`} className={TINT.tag}>
          {text.slice(slash)}
        </span>,
      );
    } else {
      out.push(
        <span key={i} className={kind ? TINT[kind] : undefined}>
          {text}
        </span>,
      );
    }
    last = i + text.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function CodeBlock({
  code,
  language,
  title,
  actions,
  className,
}: {
  code: string;
  language: CodeLanguage;
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const lines = code.split("\n");
  return (
    <div
      className={cn("overflow-hidden rounded-lg border bg-muted/40", className)}
    >
      {(title || actions) && (
        <div className="flex h-11 items-center justify-between gap-3 border-b bg-background pr-2 pl-4">
          <span className="truncate text-xs text-muted-foreground">
            {title}
          </span>
          <div className="flex items-center gap-1.5">{actions}</div>
        </div>
      )}
      <pre className="scrollbar-thin overflow-x-auto py-3 font-mono text-xs leading-relaxed">
        <code className="grid min-w-max">
          {lines.map((line, i) => (
            <span key={i} className="grid grid-cols-[3rem_1fr] pr-6">
              <span
                aria-hidden
                className="pr-4 text-right text-muted-foreground/60 select-none"
              >
                {i + 1}
              </span>
              <span className="text-foreground">
                {line ? highlight(line, language) : " "}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
