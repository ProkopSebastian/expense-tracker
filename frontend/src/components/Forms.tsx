import { useEffect, useRef, type ReactNode } from "react";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
import type { Category } from "../domain";
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
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
    >
      <option value="">Do przypisania</option>
      {categories.map((c) => (
        <option key={c.key} value={c.key}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
export function Notice({ error, notice }: { error?: string; notice?: string }) {
  return (
    <>
      {error && (
        <div role="alert" className="notice error">
          <AlertCircle size={17} />
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="notice success">
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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Zamknij"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
