import CategoryIcon from "./CategoryIcon";
import AppSelect from "./AppSelect";
import * as Popover from "@radix-ui/react-popover";
import { Search } from "lucide-react";
import { type CategoryNode } from "./Forms";

function CategoryFilterNode({
  node,
  depth,
  selected,
  onToggle,
}: {
  node: CategoryNode;
  depth: number;
  selected: string[];
  onToggle: (key: string, checked: boolean) => void;
}) {
  return (
    <div className={depth === 0 ? "border-b border-line py-1 last:border-0" : undefined}>
      <label
        className={`flex items-center gap-2 rounded-lg p-2 text-sm ${depth === 0 ? "font-medium" : "text-muted"}`}
        style={depth ? { paddingLeft: `${depth * 1.5 + 0.5}rem` } : undefined}
      >
        <input
          type="checkbox"
          checked={selected.includes(node.category.key)}
          onChange={(e) => onToggle(node.category.key, e.target.checked)}
        />
        <CategoryIcon
          categoryKey={node.category.key}
          customIcon={node.category.icon}
          customColor={node.category.color}
        />
        {node.category.label}
      </label>
      {node.children.map((child) => (
        <CategoryFilterNode
          key={child.category.key}
          node={child}
          depth={depth + 1}
          selected={selected}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

export default function LedgerFilterBar({
  query,
  onQueryChange,
  direction,
  onDirectionChange,
  category,
  onCategoryChange,
  categoryTree,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  direction: string;
  onDirectionChange: (value: string) => void;
  category: string[];
  onCategoryChange: (category: string[]) => void;
  categoryTree: CategoryNode[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line py-4">
      <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-muted [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0">
        <Search size={17} />
        <input
          placeholder="Szukaj opisu lub kontrahenta"
          aria-label="Szukaj transakcji"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>
      <AppSelect
        ariaLabel="Kierunek"
        value={direction}
        onValueChange={onDirectionChange}
        options={[
          { value: "all", label: "Wszystkie przepływy" },
          { value: "expense", label: "Wydatki" },
          { value: "income", label: "Wpływy" },
        ]}
      />
      <Popover.Root>
        <Popover.Trigger className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm hover:bg-accent-soft">
          Kategorie{category.length ? ` (${category.length})` : ""}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            className="z-40 max-h-[min(360px,70dvh)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-line bg-surface p-3 shadow-xl [&>label]:flex [&>label]:items-center [&>label]:gap-2 [&>label]:p-2"
          >
            {categoryTree.map((node) => (
              <CategoryFilterNode
                key={node.category.key}
                node={node}
                depth={0}
                selected={category}
                onToggle={(key, checked) =>
                  onCategoryChange(
                    checked
                      ? [...category, key]
                      : category.filter((existing) => existing !== key),
                  )
                }
              />
            ))}
            <label>
              <input
                type="checkbox"
                checked={category.includes("")}
                onChange={(e) =>
                  onCategoryChange(
                    e.target.checked
                      ? [...category, ""]
                      : category.filter((k) => k !== ""),
                  )
                }
              />
              <CategoryIcon /> Do przypisania
            </label>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
              onClick={() => onCategoryChange([])}
            >
              Wyczyść
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
