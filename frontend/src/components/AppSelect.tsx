import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

const EMPTY_VALUE = "__app_empty_value__";

export default function AppSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  ariaLabel,
  required,
  disabled,
  className = "",
}: {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  ariaLabel: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const denormalize = (optionValue: string) =>
    optionValue === EMPTY_VALUE ? "" : optionValue;

  return (
    <Select.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(selected) => onValueChange?.(denormalize(selected))}
      name={name}
      required={required}
      disabled={disabled}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className={`inline-flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm text-ink transition hover:border-accent/40 data-[state=open]:border-accent ${className}`}
      >
        <Select.Value
          placeholder={options.find((option) => option.value === "")?.label}
        />
        <Select.Icon className="shrink-0 text-muted">
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className="z-60 max-h-[min(22rem,70dvh)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-xl"
        >
          <Select.ScrollUpButton className="flex h-7 items-center justify-center bg-surface text-muted">
            <ChevronUp size={16} />
          </Select.ScrollUpButton>
          <Select.Viewport className="max-h-[min(20rem,62dvh)] overflow-y-auto p-1.5">
            {options.map((option, index) => (
              <div key={`${option.value}-${index}`}>
                {option.group && option.group !== options[index - 1]?.group && (
                  <span className="block px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {option.group}
                  </span>
                )}
                <Select.Item
                  value={option.value || EMPTY_VALUE}
                  className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-3 pr-9 text-sm outline-none data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent data-[state=checked]:font-semibold"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-3 text-accent">
                    <Check size={15} />
                  </Select.ItemIndicator>
                </Select.Item>
              </div>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="flex h-7 items-center justify-center bg-surface text-muted">
            <ChevronDown size={16} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
