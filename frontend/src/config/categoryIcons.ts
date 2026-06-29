import {
  House, Car, ShoppingCart, Utensils, Plane, Heart, Gift, Briefcase,
  GraduationCap, Zap, PiggyBank, TrendingUp,
  Phone, Wifi, Fuel, Bus, TrainFront, HeartPulse, Dumbbell, Book, Tv, Music,
  Gamepad2, Shirt, PawPrint, Wrench, Receipt, Landmark, CreditCard, Banknote,
  Baby, Palette, Coffee, Stethoscope, Plug, Sprout, Hammer, Scissors,
  type LucideIcon,
} from 'lucide-react'

// The one tinted category-icon library the EmojiIconPicker offers (UX §11 "Category glyph palette";
// §8.3). A category glyph is stored as `lucide:<name>` and rendered by `GlyphView`; the name maps to a
// glyph HERE so the picker (and any future consumer) never picks a lucide glyph at a call site (L14).
export const CATEGORY_GLYPHS: Record<string, LucideIcon> = {
  house: House, car: Car, cart: ShoppingCart, food: Utensils, plane: Plane,
  heart: Heart, gift: Gift, work: Briefcase, school: GraduationCap, power: Zap,
  savings: PiggyBank, growth: TrendingUp, phone: Phone, wifi: Wifi, fuel: Fuel,
  bus: Bus, train: TrainFront, health: HeartPulse, fitness: Dumbbell, book: Book,
  tv: Tv, music: Music, games: Gamepad2, clothes: Shirt, pets: PawPrint,
  repair: Wrench, receipt: Receipt, bank: Landmark, card: CreditCard,
  cash: Banknote, kids: Baby, hobbies: Palette, coffee: Coffee,
  medical: Stethoscope, plug: Plug, garden: Sprout, tools: Hammer, beauty: Scissors,
}
