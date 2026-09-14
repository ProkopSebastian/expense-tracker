import * as Dialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Info,
  ListChecks,
  Upload,
  X,
} from "lucide-react";

function WelcomeIllustration() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: "Saldo", value: "6 240 zł", tone: "text-success" },
        { label: "Wydatki", value: "3 180 zł", tone: "text-danger" },
        { label: "Wpływy", value: "9 420 zł", tone: "text-accent" },
      ].map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-line bg-surface px-3 py-3"
        >
          <div className="h-2 w-10 rounded-full bg-surface-muted" />
          <div className={`mt-3 text-sm font-semibold ${tile.tone}`}>
            {tile.value}
          </div>
          <div className="mt-1 text-[10px] text-muted">{tile.label}</div>
        </div>
      ))}
    </div>
  );
}

function ImportIllustration() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-accent/40 bg-accent-soft/30 px-4 py-6 text-center">
      <Upload className="text-accent" size={22} />
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink">
        wyciag-styczen.csv
      </div>
      <div className="text-[10px] text-muted">rozpoznano: Nest</div>
    </div>
  );
}

function ClassificationIllustration() {
  return (
    <div className="flex flex-col gap-2">
      {[
        { name: "Żabka", tag: "Jedzenie", color: "bg-amber-400" },
        { name: "Netflix", tag: "Rozrywka", color: "bg-violet-400" },
      ].map((row) => (
        <div
          key={row.name}
          className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2.5"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-ink">
            <span className={`size-2 rounded-full ${row.color}`} />
            {row.name}
          </span>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-muted">
            {row.tag}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-2 self-start rounded-lg bg-accent-soft px-2.5 py-1 text-[10px] font-medium text-accent">
        <ListChecks size={12} />
        dopasowano regułą sprzedawcy
      </div>
    </div>
  );
}

function HelpIllustration() {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-ink">Folder danych</span>
        <span className="grid size-5 place-items-center rounded-full bg-accent-soft text-accent ring-4 ring-accent/15">
          <Info size={12} />
        </span>
      </div>
      <div className="mt-2 h-2 w-40 max-w-full rounded-full bg-surface-muted" />
      <div className="mt-1.5 h-2 w-28 max-w-full rounded-full bg-surface-muted" />
    </div>
  );
}

const steps: { title: string; body: ReactNode; illustration: ReactNode }[] = [
  {
    title: "Twoje finanse, lokalnie",
    body: "Aplikacja liczy podsumowania i wykresy z wyciągów, które sam wgrywasz. Dane zostają na tym komputerze.",
    illustration: <WelcomeIllustration />,
  },
  {
    title: "Wgraj wyciąg z banku",
    body: "Na stronie Import przeciągasz plik CSV lub PDF, a bank rozpoznawany jest automatycznie. Transakcje trafiają od razu do rejestru.",
    illustration: <ImportIllustration />,
  },
  {
    title: "Kategorie same się dopasują",
    body: "Znane sprzedawców klasyfikacja przypisuje automatycznie na podstawie reguł. Resztę poprawiasz ręcznie, a aplikacja się tego uczy.",
    illustration: <ClassificationIllustration />,
  },
  {
    title: "Masz wątpliwości? Szukaj ikonki pomocy",
    body: "Przy trudniejszych miejscach, np. na stronie Import, mała okrągła ikonka ze znakiem informacji otwiera krótkie wyjaśnienie danego elementu.",
    illustration: <HelpIllustration />,
  },
];

export default function OnboardingTour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="fixed left-1/2 top-[6vh] z-50 max-h-[88dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 overflow-y-auto rounded-2xl border border-line bg-surface text-ink shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none"
        >
          <Dialog.Close
            aria-label="Zamknij przewodnik"
            className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted hover:bg-accent-soft"
          >
            <X size={18} />
          </Dialog.Close>
          <div className="p-6 pt-7 sm:p-7">
            <Dialog.Title className="pr-8 text-lg font-semibold">
              {step.title}
            </Dialog.Title>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {step.body}
            </p>
            <div className="mt-5">{step.illustration}</div>
            <div className="mt-7 flex items-center justify-between gap-4">
              <div
                className="flex gap-1.5"
                role="tablist"
                aria-label="Postęp przewodnika"
              >
                {steps.map((item, itemIndex) => (
                  <button
                    key={item.title}
                    type="button"
                    role="tab"
                    aria-selected={itemIndex === index}
                    aria-label={`Krok ${itemIndex + 1}: ${item.title}`}
                    onClick={() => setIndex(itemIndex)}
                    className={`h-1.5 rounded-full transition-all ${itemIndex === index ? "w-5 bg-accent" : "w-1.5 bg-surface-muted hover:bg-accent/40"}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {index > 0 && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-accent-soft hover:text-accent"
                    onClick={() => setIndex((value) => value - 1)}
                  >
                    <ArrowLeft size={15} />
                    Wstecz
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
                  onClick={() => (last ? onClose() : setIndex((value) => value + 1))}
                >
                  {last ? "Zaczynajmy" : "Dalej"}
                  {!last && <ArrowRight size={15} />}
                </button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
