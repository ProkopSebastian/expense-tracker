import {
  Utensils,
  ShoppingBasket,
  Plane,
  Car,
  HeartPulse,
  Gamepad2,
  ShoppingBag,
  House,
  Receipt,
  Repeat,
  GraduationCap,
  Gift,
  PiggyBank,
  PawPrint,
  Banknote,
  Wallet,
  BriefcaseBusiness,
  ArrowLeftRight,
  CircleHelp,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { nodeColor } from "../categoryPresentation";

// One mapping for category badges, selectors and chart legends.
const categoryIcons: Record<string, LucideIcon> = {
  food: Utensils,
  groceries: ShoppingBasket,
  travel: Plane,
  transport: Car,
  health: HeartPulse,
  entertainment: Gamepad2,
  shopping: ShoppingBag,
  housing: House,
  housing_bills: Receipt,
  subscriptions: Repeat,
  education: GraduationCap,
  gifts: Gift,
  savings: PiggyBank,
  pets: PawPrint,
  cash_withdrawal: Banknote,
  income: Wallet,
  income_salary: BriefcaseBusiness,
  transfer_own: ArrowLeftRight,
  uncategorized_expense: CircleHelp,
};

export default function CategoryIcon({
  categoryKey,
}: {
  categoryKey?: string | null;
}) {
  const key = categoryKey || "uncategorized_expense";
  const Icon = categoryIcons[key] ?? categoryIcons[key.split("_")[0]] ?? Tag;
  return (
    <Icon
      aria-hidden="true"
      size={17}
      className="shrink-0"
      style={{ color: nodeColor(key) }}
    />
  );
}
