import type { Category, Block } from "../domain";
import { request, useAction } from "../hooks";
import { money } from "../api";
import { Modal, CategorySelect, Notice } from "./Forms";

export function EditCategoryModal({
  editing,
  editCategory,
  onEditCategoryChange,
  categories,
  action,
  onClose,
  onForeignCash,
}: {
  editing: Block;
  editCategory: string;
  onEditCategoryChange: (value: string) => void;
  categories: Category[];
  action: ReturnType<typeof useAction>;
  onClose: () => void;
  onForeignCash: () => void;
}) {
  return (
    <Modal title="Zmień kategorię" onClose={onClose} busy={action.busy}>
      <form
        className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await action.run(() =>
              request(`/transactions/${editing.id}/category`, "PUT", {
                category_key: editCategory,
              }),
            )
          )
            onClose();
        }}
      >
        <Notice error={action.error} />
        <p>{editing.description}</p>
        <p className="text-sm leading-relaxed text-muted">
          {editing.date} · {money(editing.amount!, editing.currency)}
        </p>
        {editing.category_key === "cash_withdrawal" && (
          <p className="text-sm text-muted">
            {editing.cash_currency && `W gotówce: ${money(editing.cash_amount!, editing.cash_currency)} · `}
            <button
              type="button"
              className="underline-offset-2 hover:text-accent hover:underline"
              onClick={onForeignCash}
            >
              {editing.cash_currency ? "zmień" : "Wypłacone w innej walucie?"}
            </button>
          </p>
        )}
        <label>
          Kategoria
          <CategorySelect
            categories={categories}
            value={editCategory}
            onChange={onEditCategoryChange}
          />
        </label>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          <button
            className="btn-primary"
            disabled={action.busy}
          >
            Zapisz kategorię
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function DissolveGroupModal({
  caseId,
  action,
  onClose,
}: {
  caseId: number;
  action: ReturnType<typeof useAction>;
  onClose: () => void;
}) {
  return (
    <Modal title="Rozwiązać grupę?" onClose={onClose} busy={action.busy}>
      <div className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3">
        <Notice error={action.error} />
        <p>
          Transakcje zostaną w historii i znów będą liczone osobno. Możesz później
          utworzyć z nich nową grupę.
        </p>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          <button
            className="btn"
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            className="btn-primary"
            disabled={action.busy}
            onClick={async () => {
              if (
                await action.run(
                  () => request(`/cases/${caseId}`, "DELETE"),
                  "Grupa rozwiązana.",
                )
              )
                onClose();
            }}
          >
            Rozwiąż grupę
          </button>
        </footer>
      </div>
    </Modal>
  );
}
