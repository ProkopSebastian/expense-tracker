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
  Smartphone,
  Fuel,
  Bus,
  Coffee,
  Wine,
  Truck,
  Hotel,
  Film,
  Music,
  Dumbbell,
  Stethoscope,
  Pill,
  Wrench,
  Wifi,
  Shirt,
  Sparkles,
  BookOpen,
  ParkingCircle,
  Ticket,
  Bone,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { nodeColor } from "../categoryPresentation";

// One mapping for category badges, selectors and chart legends.
const categoryIcons: Record<string, LucideIcon> = {
  food: Utensils,
  groceries: ShoppingBasket,
  food_delivery: Truck,
  food_coffee: Coffee,
  food_alcohol: Wine,
  travel: Plane,
  travel_accommodation: Hotel,
  travel_transport: Bus,
  transport: Car,
  transport_fuel: Fuel,
  transport_public: Bus,
  transport_taxi: Car,
  transport_parking: ParkingCircle,
  transport_service: Wrench,
  health: HeartPulse,
  health_pharmacy: Pill,
  health_doctor: Stethoscope,
  health_fitness: Dumbbell,
  entertainment: Gamepad2,
  entertainment_cinema: Film,
  entertainment_events: Ticket,
  entertainment_hobby: Music,
  shopping: ShoppingBag,
  shopping_electronics: Smartphone,
  shopping_clothes: Shirt,
  shopping_home: House,
  shopping_beauty: Sparkles,
  shopping_books: BookOpen,
  housing: House,
  housing_bills: Receipt,
  housing_internet: Wifi,
  housing_maintenance: Wrench,
  subscriptions: Repeat,
  education: GraduationCap,
  gifts: Gift,
  savings: PiggyBank,
  pets: PawPrint,
  pets_food: Bone,
  pets_vet: Stethoscope,
  cash_withdrawal: Banknote,
  income: Wallet,
  income_salary: BriefcaseBusiness,
  income_investments: TrendingUp,
  transfer_own: ArrowLeftRight,
  uncategorized_expense: CircleHelp,
};

// Curated icon set offered when creating a custom category — kept small enough to fit
// a scroll-free picker grid, no search needed.
export const curatedIcons: Record<string, LucideIcon> = {
  Utensils,
  ShoppingBasket,
  ShoppingBag,
  Plane,
  Car,
  Bus,
  Fuel,
  ParkingCircle,
  Wrench,
  HeartPulse,
  Pill,
  Stethoscope,
  Dumbbell,
  Gamepad2,
  Film,
  Music,
  Ticket,
  House,
  Wifi,
  Receipt,
  Repeat,
  GraduationCap,
  Gift,
  PiggyBank,
  TrendingUp,
  PawPrint,
  Bone,
  Banknote,
  Coffee,
  Wine,
  Shirt,
  Sparkles,
  BookOpen,
  Smartphone,
  Hotel,
  Tag,
};

export default function CategoryIcon({
  categoryKey,
  customIcon,
  customColor,
  size = 17,
}: {
  categoryKey?: string | null;
  customIcon?: string | null;
  customColor?: string | null;
  size?: number;
}) {
  const key = categoryKey || "uncategorized_expense";
  const Icon =
    (customIcon ? curatedIcons[customIcon] : undefined) ??
    categoryIcons[key] ??
    categoryIcons[key.split("_")[0]] ??
    Tag;
  return (
    <Icon
      aria-hidden="true"
      size={size}
      className="shrink-0"
      style={{ color: nodeColor(key, customColor) }}
    />
  );
}
