import * as Dialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  ChevronDown,
  Info,
  Link2,
  ListChecks,
  Sparkles,
  Undo2,
  Upload,
  X,
} from "lucide-react";

function WelcomeIllustration() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: "Wydatki", value: "3 180 zł", tone: "text-ink" },
        { label: "Przychody", value: "9 420 zł", tone: "text-ink" },
        { label: "Bilans", value: "+6 240 zł", tone: "text-success" },
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
        { name: "Żabka", tag: "Zakupy spożywcze", color: "bg-amber-400" },
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

function WalletIllustration() {
  return (
    <div className="flex flex-col gap-2 text-xs">
      {[
        { label: "Wypłata z bankomatu", value: "+200,00 zł" },
        { label: "Rozlicz: zostało", value: "60,00 zł" },
      ].map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2.5"
        >
          <span className="text-muted">{row.label}</span>
          <span className="font-medium tabular-nums text-ink">{row.value}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 self-start rounded-lg bg-accent-soft px-2.5 py-1 text-[10px] font-medium text-accent">
        <Banknote size={12} />
        wydane 140,00 zł — rozdzielasz na kategorie
      </div>
    </div>
  );
}

function SharedIllustration() {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-3 text-xs">
      {[
        { label: "Bilety na koncert", value: "−240,00 zł", tone: "text-ink" },
        { label: "BLIK od Magdy", value: "+120,00 zł", tone: "text-success" },
      ].map((row) => (
        <div key={row.label} className="flex justify-between py-1">
          <span className="text-muted">{row.label}</span>
          <span className={`tabular-nums ${row.tone}`}>{row.value}</span>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-medium text-ink">
        <span className="flex items-center gap-1.5">
          <Link2 size={12} className="text-accent" /> Twój koszt
        </span>
        <span className="tabular-nums">120,00 zł</span>
      </div>
    </div>
  );
}

function SignsIllustration() {
  return (
    <dl className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 rounded-lg border border-line bg-surface px-4 py-3 text-xs text-muted [&_dt]:flex [&_dt]:justify-center [&_dt]:text-accent">
      <dt>
        <Info size={14} />
      </dt>
      <dd>wyjaśnienie, jak coś działa</dd>
      <dt>
        <Sparkles size={14} />
      </dt>
      <dd>podpowiedź AI</dd>
      <dt>
        <ChevronDown size={14} />
      </dt>
      <dd>kliknij, żeby zobaczyć więcej</dd>
      <dt>
        <Undo2 size={14} />
      </dt>
      <dd>„Cofnij” po każdej zmianie</dd>
    </dl>
  );
}

const steps: { title: string; body: ReactNode; illustration: ReactNode }[] = [
  {
    title: "Twoje finanse, lokalnie",
    body: "Wgrywasz wyciągi z banku, a aplikacja liczy, na co idą pieniądze. Wszystko zostaje na tym komputerze.",
    illustration: <WelcomeIllustration />,
  },
  {
    title: "Wgraj wyciąg",
    body: "Na stronie Import przeciągnij plik CSV lub PDF. Bank rozpozna się sam, a ten sam plik możesz wgrać ponownie bez duplikatów.",
    illustration: <ImportIllustration />,
  },
  {
    title: "Kategorie",
    body: "Znanych sprzedawców aplikacja przypisze sama. Resztę zatwierdzasz w „Do klasyfikacji” — raz powiesz „Żabka → Zakupy spożywcze” i następnym razem nie zapyta.",
    illustration: <ClassificationIllustration />,
  },
  {
    title: "Gotówka i waluty",
    body: "Wypłaty z bankomatu trafiają do „Gotówki” same. Po tygodniu policz, ile zostało — różnica to Twoje wydatki.",
    illustration: <WalletIllustration />,
  },
  {
    title: "Wspólne wydatki",
    body: "Bilety kosztowały 240 zł, a Magda oddała 120 zł BLIK-iem? Połącz obie transakcje w grupę — w podsumowaniu zostanie 120 zł, czyli Twój prawdziwy koszt.",
    illustration: <SharedIllustration />,
  },
  {
    title: "Znaki w aplikacji",
    body: "Te znaki spotkasz na każdej stronie.",
    illustration: <SignsIllustration />,
  },
];

export default function OnboardingTour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
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
            {/* Every step sits in the same grid cell, so the dialog takes the tallest step's
                height and the buttons below stay put while clicking through. */}
            <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
              {steps.map((item, itemIndex) => (
                <div
                  key={item.title}
                  className={itemIndex === index ? "" : "invisible"}
                  aria-hidden={itemIndex !== index}
                >
                  {itemIndex === index ? (
                    <Dialog.Title className="pr-8 text-lg font-semibold">
                      {item.title}
                    </Dialog.Title>
                  ) : (
                    <p className="pr-8 text-lg font-semibold">{item.title}</p>
                  )}
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {item.body}
                  </p>
                  <div className="mt-5">{item.illustration}</div>
                </div>
              ))}
            </div>
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
                    className="btn-quiet"
                    onClick={() => setIndex((value) => value - 1)}
                  >
                    <ArrowLeft size={15} />
                    Wstecz
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary"
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
