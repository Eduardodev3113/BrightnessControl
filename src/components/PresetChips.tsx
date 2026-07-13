import "./PresetChips.css";

export interface Preset {
  id: string;
  label: string;
  value: number;
}

export const DEFAULT_PRESETS: Preset[] = [
  { id: "dia", label: "Dia", value: 100 },
  { id: "noite", label: "Noite", value: 25 },
  { id: "cinema", label: "Cinema", value: 10 },
  { id: "jogo", label: "Jogo", value: 70 },
];

interface Props {
  presets: Preset[];
  activeValue: number;
  onSelect: (value: number) => void;
}

export default function PresetChips({ presets, activeValue, onSelect }: Props) {
  return (
    <div className="presets" role="group" aria-label="Presets de brilho">
      {presets.map((preset) => (
        <button
          key={preset.id}
          className={`preset-chip ${activeValue === preset.value ? "preset-chip--active" : ""}`}
          onClick={() => onSelect(preset.value)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
