import CategoryIcon, { curatedIcons } from "./CategoryIcon";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronLeft,
  Check,
  Plus,
} from "lucide-react";
import type { Category } from "../domain";
import { request } from "../hooks";
import { palette } from "../categoryPresentation";

export interface CategoryNode {
  category: Category;
  children: CategoryNode[];
}

const byLabel = (left: Category, right: Category) =>
  left.label.localeCompare(right.label, "pl");

export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const byParent = new Map<string, Category[]>();
  const knownKeys = new Set(categories.map((category) => category.key));
  const roots: Category[] = [];

  for (const category of categories) {
    if (category.parent_key && knownKeys.has(category.parent_key)) {
      const children = byParent.get(category.parent_key) ?? [];
      children.push(category);
      byParent.set(category.parent_key, children);
    } else {
      roots.push(category);
    }
  }

  const build = (category: Category): CategoryNode => ({
    category,
    children: (byParent.get(category.key) ?? []).sort(byLabel).map(build),
  });
  return roots.sort(byLabel).map(build);
}

function findNode(nodes: CategoryNode[], key: string): CategoryNode | undefined {
  for (const node of nodes) {
    if (node.category.key === key) return node;
    const found = findNode(node.children, key);
    if (found) return found;
  }
  return undefined;
}

function breadcrumbForKey(nodes: CategoryNode[], key: string): string[] {
  function walk(level: CategoryNode[], trail: string[]): string[] | null {
    for (const node of level) {
      if (node.category.key === key) return trail;
      const found = walk(node.children, [...trail, node.category.label]);
      if (found) return found;
    }
    return null;
  }
  return walk(nodes, []) ?? [];
}

interface FlatCategory {
  node: CategoryNode;
  breadcrumb: string[];
}

function flattenTree(nodes: CategoryNode[], breadcrumb: string[] = []): FlatCategory[] {
  return nodes.flatMap((node) => [
    { node, breadcrumb },
    ...flattenTree(node.children, [...breadcrumb, node.category.label]),
  ]);
}

function normalizePolish(text: string) {
  return text.toLocaleLowerCase("pl");
}

const RECENT_KEY = "category-select-recent";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(key: string) {
  try {
    const next = [key, ...loadRecent().filter((existing) => existing !== key)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* Storage is optional. */
  }
}

function CategoryTile({
  node,
  selected,
  onEnter,
  onSelect,
}: {
  node: CategoryNode;
  selected: boolean;
  onEnter: () => void;
  onSelect: () => void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <button
      type="button"
      onClick={hasChildren ? onEnter : onSelect}
      className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition hover:border-accent/40 hover:bg-accent-soft ${
        selected ? "border-accent bg-accent-soft" : "border-line bg-surface"
      }`}
    >
      <CategoryIcon
        categoryKey={node.category.key}
        customIcon={node.category.icon}
        customColor={node.category.color}
        size={20}
      />
      <span className="line-clamp-2 text-[11px] leading-tight text-ink">
        {node.category.label}
      </span>
      {hasChildren && <ChevronDown size={11} className="-rotate-90 text-muted" />}
    </button>
  );
}

export function CategorySelect({
  categories,
  value,
  onChange,
  label = "Kategoria",
}: {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [localCategories, setLocalCategories] = useState(categories);
  useEffect(() => setLocalCategories(categories), [categories]);
  const tree = useMemo(() => buildCategoryTree(localCategories), [localCategories]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [path, setPath] = useState<string[]>([]);
  const [creating, setCreating] = useState<{ parentKey: string | null } | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [newColor, setNewColor] = useState(palette[0]);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) labelInputRef.current?.focus();
  }, [creating]);

  const selectedNode = value ? findNode(tree, value) : undefined;
  const currentParentKey = path[path.length - 1] ?? null;
  const currentNode = currentParentKey ? findNode(tree, currentParentKey) : undefined;
  const levelNodes = currentNode ? currentNode.children : tree;
  const breadcrumbTrail = currentParentKey
    ? [...breadcrumbForKey(tree, currentParentKey), currentNode?.category.label ?? ""]
    : [];
  const searchResults = search
    ? flat.filter(({ node }) => normalizePolish(node.category.label).includes(normalizePolish(search)))
    : [];
  const recentNodes = !path.length && !search
    ? loadRecent().map((key) => findNode(tree, key)).filter((node): node is CategoryNode => !!node)
    : [];

  function select(optionValue: string) {
    onChange(optionValue);
    if (optionValue) pushRecent(optionValue);
    setOpen(false);
  }

  function startCreating(parentKey: string | null, prefill: string) {
    setCreating({ parentKey });
    setNewLabel(prefill);
    setNewIcon("");
    setNewColor(palette[0]);
    setCreateError("");
  }

  async function submitCreate() {
    if (!creating || !newLabel.trim() || !newIcon) return;
    setCreateBusy(true);
    setCreateError("");
    try {
      const created = await request<Category>("/categories", "POST", {
        label: newLabel.trim(),
        parent_key: creating.parentKey,
        icon: newIcon,
        color: newColor,
      });
      setLocalCategories((prev) => [...prev, created]);
      setCreating(null);
      select(created.key);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Nie udało się dodać kategorii.");
    } finally {
      setCreateBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!search) return;
    const showAdd = !searchResults.length;
    const total = searchResults.length + (showAdd ? 1 : 0);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => Math.min(index + 1, total - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlighted < searchResults.length) {
        const result = searchResults[highlighted];
        if (result) select(result.node.category.key);
      } else if (showAdd) {
        startCreating(currentParentKey, search);
      }
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSearch("");
        setHighlighted(0);
        setPath([]);
        setCreating(null);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm text-ink transition hover:border-accent/40 data-[state=open]:border-accent"
        >
          <CategoryIcon
            categoryKey={value}
            customIcon={selectedNode?.category.icon}
            customColor={selectedNode?.category.color}
          />
          <span className="min-w-0 flex-1 truncate">
            {selectedNode?.category.label ?? "Do przypisania"}
          </span>
          <ChevronDown size={16} className="shrink-0 text-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={8}
          className="z-60 w-[min(22rem,90vw)] overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInputRef.current?.focus();
          }}
        >
          {creating ? (
            <div className="p-3">
              <button
                type="button"
                onClick={() => setCreating(null)}
                className="mb-2 flex items-center gap-1 text-xs text-muted hover:text-accent"
              >
                <ChevronLeft size={14} /> Wróć
              </button>
              <p className="text-sm font-semibold text-ink">Nowa kategoria</p>
              <p className="mb-3 text-xs text-muted">
                {creating.parentKey
                  ? `w: ${breadcrumbForKey(tree, creating.parentKey).concat(
                      findNode(tree, creating.parentKey)?.category.label ?? "",
                    ).filter(Boolean).join(" › ")}`
                  : "kategoria główna"}
              </p>
              <label className="mb-3 block">
                <span className="mb-1 block text-xs text-muted">Nazwa kategorii</span>
                <input
                  ref={labelInputRef}
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                  placeholder="Nazwa kategorii"
                  maxLength={80}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <span className="mb-1 block text-xs text-muted">Ikona</span>
              <div className="mb-3 grid grid-cols-6 gap-1.5">
                {Object.entries(curatedIcons).map(([name, Icon]) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    onClick={() => setNewIcon(name)}
                    className={`grid aspect-square place-items-center rounded-lg border hover:bg-accent-soft ${
                      newIcon === name ? "border-accent bg-accent-soft" : "border-line"
                    }`}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              <span className="mb-1 block text-xs text-muted">Kolor</span>
              <div className="mb-4 flex gap-1.5">
                {palette.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => setNewColor(color)}
                    className={`size-7 rounded-full border-2 ${
                      newColor === color ? "border-ink" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <Notice error={createError} />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(null)}
                  className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-accent-soft"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  disabled={!newLabel.trim() || !newIcon || createBusy}
                  onClick={submitCreate}
                  className="rounded-xl border border-accent bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {createBusy ? "Zapisuję…" : "Zapisz"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {path.length > 0 && (
                <div className="flex items-center gap-1 border-b border-line px-3 py-2 text-xs text-muted">
                  <button
                    type="button"
                    onClick={() => setPath((current) => current.slice(0, -1))}
                    className="flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-accent-soft hover:text-accent"
                  >
                    <ChevronLeft size={14} /> Wróć
                  </button>
                  <span className="truncate">
                    {breadcrumbTrail.map((crumb, index) => (
                      <span key={index}>
                        {index > 0 && " › "}
                        <button
                          type="button"
                          className="hover:text-accent hover:underline"
                          onClick={() => setPath((current) => current.slice(0, index + 1))}
                        >
                          {crumb}
                        </button>
                      </span>
                    ))}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <Search size={15} className="shrink-0 text-muted" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setHighlighted(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Szukaj kategorii…"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                />
              </div>
              <div className="max-h-[min(22rem,60dvh)] overflow-y-auto p-2">
                {search ? (
                  <div className="space-y-0.5">
                    {searchResults.map(({ node, breadcrumb }, index) => (
                      <button
                        key={node.category.key}
                        type="button"
                        onClick={() => select(node.category.key)}
                        onMouseEnter={() => setHighlighted(index)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg py-2 pl-3 pr-3 text-left text-sm outline-none ${
                          index === highlighted ? "bg-accent-soft text-accent" : ""
                        } ${node.category.key === value ? "font-semibold" : ""}`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <CategoryIcon
                            categoryKey={node.category.key}
                            customIcon={node.category.icon}
                            customColor={node.category.color}
                          />
                          <span className="min-w-0 truncate">
                            {node.category.label}
                            {breadcrumb.length > 0 && (
                              <span className="ml-1.5 text-xs text-muted">
                                — {breadcrumb.join(" › ")}
                              </span>
                            )}
                          </span>
                        </span>
                        {node.category.key === value && <Check size={15} className="text-accent" />}
                      </button>
                    ))}
                    {!searchResults.length && (
                      <button
                        type="button"
                        onClick={() => startCreating(currentParentKey, search)}
                        onMouseEnter={() => setHighlighted(0)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-accent outline-none ${
                          highlighted === 0 ? "bg-accent-soft" : ""
                        }`}
                      >
                        <Plus size={15} /> Dodaj „{search}” jako nową kategorię
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {!path.length && (
                      <button
                        type="button"
                        onClick={() => select("")}
                        className={`mb-2 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent-soft ${
                          value === "" ? "bg-accent-soft font-semibold text-accent" : ""
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <CategoryIcon /> Do przypisania
                        </span>
                        {value === "" && <Check size={15} className="text-accent" />}
                      </button>
                    )}
                    {recentNodes.length > 0 && (
                      <div className="mb-2 border-b border-line pb-2">
                        <span className="block px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Ostatnio używane
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {recentNodes.map((node) => (
                            <CategoryTile
                              key={node.category.key}
                              node={node}
                              selected={node.category.key === value}
                              onEnter={() => setPath((current) => [...current, node.category.key])}
                              onSelect={() => select(node.category.key)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {currentNode && (
                      <button
                        type="button"
                        onClick={() => select(currentNode.category.key)}
                        className={`mb-2 flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent-soft ${
                          value === currentNode.category.key
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-line"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <CategoryIcon
                            categoryKey={currentNode.category.key}
                            customIcon={currentNode.category.icon}
                            customColor={currentNode.category.color}
                          />
                          {currentNode.category.label} — ogólnie
                        </span>
                        {value === currentNode.category.key && (
                          <Check size={15} className="text-accent" />
                        )}
                      </button>
                    )}
                    <div className="grid grid-cols-3 gap-1.5">
                      {levelNodes.map((node) => (
                        <CategoryTile
                          key={node.category.key}
                          node={node}
                          selected={node.category.key === value}
                          onEnter={() => setPath((current) => [...current, node.category.key])}
                          onSelect={() => select(node.category.key)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {!search && (
                  <button
                    type="button"
                    onClick={() => startCreating(currentParentKey, "")}
                    className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-left text-sm text-accent hover:border-accent/50 hover:bg-accent-soft"
                  >
                    <Plus size={15} /> Dodaj własną kategorię
                  </button>
                )}
              </div>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function Notice({ error, notice }: { error?: string; notice?: string }) {
  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed [&_svg]:shrink-0 bg-danger/10 text-danger"
        >
          <AlertCircle size={17} />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-5 flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed [&_svg]:shrink-0 bg-success/10 text-success"
        >
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
    </>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
          className="fixed left-1/2 top-[6vh] z-50 max-h-[88dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-y-auto rounded-2xl border border-line bg-surface text-ink shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none"
        >
          <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
            <Dialog.Title className="text-lg font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-lg text-muted hover:bg-accent-soft"
                aria-label="Zamknij"
                disabled={busy}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
