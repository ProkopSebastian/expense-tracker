import CategoryIcon from "./CategoryIcon";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { X, CheckCircle2, AlertCircle, Search, ChevronDown, Check } from "lucide-react";
import type { Category } from "../domain";
import type { SelectOption } from "./AppSelect";

export interface CategoryGroup {
  parent: Category;
  children: Category[];
}

export function groupCategories(categories: Category[]): CategoryGroup[] {
  const byParent = new Map<string, Category[]>();
  const roots: Category[] = [];
  const knownKeys = new Set(categories.map((category) => category.key));

  for (const category of categories) {
    if (category.parent_key && knownKeys.has(category.parent_key)) {
      const children = byParent.get(category.parent_key) ?? [];
      children.push(category);
      byParent.set(category.parent_key, children);
    } else {
      roots.push(category);
    }
  }

  const byLabel = (left: Category, right: Category) =>
    left.label.localeCompare(right.label, "pl");
  return roots.sort(byLabel).map((parent) => ({
    parent,
    children: (byParent.get(parent.key) ?? []).sort(byLabel),
  }));
}

function normalizePolish(text: string) {
  return text.toLocaleLowerCase("pl");
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
  const groups = groupCategories(categories);
  const options: SelectOption[] = [
    { value: "", label: "Do przypisania" },
    ...groups.flatMap(({ parent, children }) => [
      {
        value: parent.key,
        label: children.length ? `${parent.label} — ogólnie` : parent.label,
        group: children.length ? parent.label : undefined,
      },
      ...children.map((child) => ({
        value: child.key,
        label: `↳ ${child.label}`,
        group: parent.label,
      })),
    ]),
  ];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = search
    ? options.filter(
        (option) =>
          normalizePolish(option.label).includes(normalizePolish(search)) ||
          (option.group && normalizePolish(option.group).includes(normalizePolish(search))),
      )
    : options;
  const selected = options.find((option) => option.value === value);

  function select(optionValue: string) {
    onChange(optionValue);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[highlighted];
      if (option) select(option.value);
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSearch("");
        setHighlighted(0);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm text-ink transition hover:border-accent/40 data-[state=open]:border-accent"
        >
          <CategoryIcon categoryKey={value} />
          <span className="min-w-0 flex-1 truncate">{selected?.label ?? "Do przypisania"}</span>
          <ChevronDown size={16} className="shrink-0 text-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={8}
          className="z-60 w-[min(20rem,90vw)] overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={15} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
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
          <div className="max-h-[min(20rem,60dvh)] overflow-y-auto p-1.5">
            {filtered.map((option, index) => (
              <div key={option.value || "__unassigned__"}>
                {option.group && option.group !== filtered[index - 1]?.group && (
                  <span className="block px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {option.group}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => select(option.value)}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg py-2 pl-3 pr-3 text-left text-sm outline-none ${
                    index === highlighted ? "bg-accent-soft text-accent" : ""
                  } ${option.value === value ? "font-semibold" : ""}`}
                >
                  {option.label}
                  {option.value === value && <Check size={15} className="text-accent" />}
                </button>
              </div>
            ))}
            {!filtered.length && (
              <p className="px-3 py-4 text-center text-sm text-muted">Brak wyników.</p>
            )}
          </div>
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
