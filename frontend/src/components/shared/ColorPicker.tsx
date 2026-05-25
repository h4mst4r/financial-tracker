/**
 * ColorPicker — Native color input + preset swatches.
 *
 * Shared across all entity management components that need color selection.
 * Presets provide quick visual selection; native picker allows custom hex.
 */
import { CheckIcon } from "./icons";

const COLOR_PRESETS = [
  "#FF5733", "#33FF57", "#3357FF", "#FF33A8", "#F39C12",
  "#1ABC9C", "#E74C3C", "#9B59B6", "#3498DB", "#E67E22",
  "#2ECC71", "#E91E63", "#00BCD4", "#8BC34A", "#FFC107",
  "#FF9800", "#4CAF50", "#2196F3", "#673AB7", "#9E9E9E",
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  presets?: string[];
  className?: string;
}

export function ColorPicker({ value, onChange, presets = COLOR_PRESETS, className }: ColorPickerProps) {
  return (
    <div className={className}>
      {/* Native color input + preset swatches */}
      <div className="flex items-center gap-3">
        {/* Native color picker */}
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-12 h-12 rounded-lg cursor-pointer border-2 border-border"
          />
        </div>

        {/* Preset swatches */}
        <div className="flex flex-wrap gap-2">
          {presets.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={`color-swatch w-8 h-8 rounded-md transition-all ${
                value === color
                  ? "border-primary scale-110 ring-2 ring-primary/30"
                  : "border-transparent hover:scale-110"
              }`}
              style={{ backgroundColor: color }}
              title={color}
            >
              {value === color && (
                <span className="text-background flex items-center justify-center">
                  <CheckIcon />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
