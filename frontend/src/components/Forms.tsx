import CategoryIcon from "./CategoryIcon";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
import type { Category } from "../domain";

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

export function CategorySelect({
  categories,
  value,
  onChange,
  required = true,
  label = "Kategoria",
}: {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
}) {
  const groups = groupCategories(categories);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CategoryIcon categoryKey={value} />
      <select
        className="min-w-0 flex-1"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">Do przypisania</option>
        {groups.map(({ parent, children }) =>
          children.length ? (
            <optgroup key={parent.key} label={parent.label}>
              <option value={parent.key}>{parent.label} — ogólnie</option>
              {children.map((child) => (
                <option key={child.key} value={child.key}>
                  ↳ {child.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={parent.key} value={parent.key}>
              {parent.label}
            </option>
          ),
        )}
      </select>
    </span>
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
          className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface text-ink shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none"
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
