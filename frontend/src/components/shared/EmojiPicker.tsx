/**
 * EmojiPicker — Curated emoji selector organized by category.
 *
 * Shared across all entity management components that need icon selection.
 * Stores unicode emoji strings in the database.
 */

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  className?: string;
}

// Curated emoji library — organized by category for easy browsing
const EMOJI_LIBRARY = [
  // Money & finance
  "💰", "💵", "💳", "🏦", "💎", "📊", "📈", "📉",
  // Shopping & food
  "🛒", "🛍️", "🍽️", "☕", "🍺", "🍷", "🍬", "🍪",
  // Home & utilities
  "🏠", "⚡", "💡", "🔧", "🔨", "🛠️", "📱", "🖥️",
  // Transport
  "🚗", "🚌", "🚂", "✈️", "🚢", "🚲", "👣", "📍",
  // Health & education
  "🏥", "💊", "💉", "🩺", "📚", "🎓", "🧪", "🌱",
  // Entertainment & lifestyle
  "🎬", "🎮", "🎵", "📷", "👕", "🎁", "🏆", "💪",
  "🎨", "✂️", "📺", "📻", "🖨️", "🎤", "⭐", "✨",
  // Nature & weather
  "☀️", "🌙", "☁️", "⚓", "🔥", "💧", "☂️", "❄️", "💨",
  // Buildings & places
  "🏢", "🏪", "🏭", "🏛️", "⛪", "⛺", "🏕️", "🌅",
  // People & pets
  "👶", "🐕", "🐈", "💼", "💻", "📦", "🐾", "🧠",
];

export function EmojiPicker({ value, onChange, className }: EmojiPickerProps) {
  return (
    <div className={className}>
      {/* Grid of emoji buttons */}
      <div className="grid grid-cols-10 gap-1.5 max-h-48 overflow-y-auto bg-surface-elevated rounded-lg p-3 border border-border">
        {EMOJI_LIBRARY.map((emoji) => {
          const isSelected = value === emoji;
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange(isSelected ? "" : emoji)}
              className={`p-2 rounded-lg transition-all flex items-center justify-center text-xl ${
                isSelected
                  ? "bg-surface-elevated border border-border text-text-secondary scale-110"
                  : "bg-surface hover:bg-surface-elevated"
              }`}
              title={emoji}
            >
              {emoji}
            </button>
          );
        })}
      </div>

      {/* Manual input */}
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste any emoji here..."
          className="input flex-1 text-sm"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="tag"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Render an emoji icon with configurable size.
 * Returns null if no icon is set.
 */
export function EmojiIcon({ emoji, size = 18 }: { emoji?: string | null; size?: number }) {
  if (!emoji) return null;
  return <span style={{ fontSize: `${size + 4}px` }} className="flex-shrink-0">{emoji}</span>;
}
