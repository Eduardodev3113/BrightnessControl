import "./MonitorSelect.css";

export interface MonitorInfo {
  index: number;
  name: string;
}

interface Props {
  monitors: MonitorInfo[];
  selected: number;
  onSelect: (index: number) => void;
}

// Só faz sentido mostrar isso se houver mais de um monitor - com um só,
// a informação é redundante (o app já assume "o monitor").
export default function MonitorSelect({ monitors, selected, onSelect }: Props) {
  if (monitors.length <= 1) return null;

  return (
    <div className="monitor-select">
      {monitors.map((m) => (
        <button
          key={m.index}
          className={`monitor-select__item ${selected === m.index ? "monitor-select__item--active" : ""}`}
          onClick={() => onSelect(m.index)}
          title={m.name}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}
