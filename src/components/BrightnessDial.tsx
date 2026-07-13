import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
} from "react";
import "./BrightnessDial.css";

// O dial cobre um arco de 300° (como um mostrador de luz), deixando um
// "vão" de 60° na parte de baixo - assim fica claro visualmente onde
// é o começo (0%) e o fim (100%), igual um knob físico.
const START_ANGLE = -150;
const END_ANGLE = 150;
const SWEEP = END_ANGLE - START_ANGLE;

const RADIUS = 88;
const CIRCUMFERENCE_FRACTION = SWEEP / 360;
const CENTER = 100;

interface Props {
  value: number; // 0-100
  onChange: (value: number) => void;
  disabled?: boolean;
}

function angleToValue(angle: number): number {
  const clamped = Math.max(START_ANGLE, Math.min(END_ANGLE, angle));
  return Math.round(((clamped - START_ANGLE) / SWEEP) * 100);
}

// Converte a posição do ponteiro (relativa ao centro do dial) num ângulo,
// no mesmo referencial de START_ANGLE/END_ANGLE (0° = topo, sentido horário).
function pointToAngle(dx: number, dy: number): number {
  const rad = Math.atan2(dx, -dy);
  let deg = (rad * 180) / Math.PI;
  if (deg < START_ANGLE - (360 - SWEEP) / 2) deg += 360;
  return deg;
}

function describeArc(fraction: number) {
  // Comprimento do arco de fundo (300°) e o quanto dele fica "preenchido"
  const fullLength = 2 * Math.PI * RADIUS * CIRCUMFERENCE_FRACTION;
  const filled = fullLength * fraction;
  return { fullLength, filled };
}

export default function BrightnessDial({ value, onChange, disabled }: Props) {
  const dialRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = dialRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = pointToAngle(clientX - cx, clientY - cy);
      onChange(angleToValue(angle));
    },
    [onChange]
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: PointerEvent) => updateFromPointer(e.clientX, e.clientY);
    const handleUp = () => setDragging(false);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging, updateFromPointer]);

  const handlePointerDown = (e: ReactPointerEvent) => {
    if (disabled) return;
    setDragging(true);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      onChange(Math.min(100, value + step));
      e.preventDefault();
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      onChange(Math.max(0, value - step));
      e.preventDefault();
    }
  };

  const { fullLength, filled } = describeArc(value / 100);
  const rotation = START_ANGLE - 90; // ajusta o SVG (que começa em 0° = direita) pro topo

  return (
    <div
      ref={dialRef}
      className={`dial ${dragging ? "dial--dragging" : ""} ${disabled ? "dial--disabled" : ""}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Brilho do monitor"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      style={{ "--glow-strength": value / 100 } as CSSProperties}
    >
      <svg viewBox="0 0 200 200" className="dial__svg">
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          className="dial__track"
          strokeDasharray={`${fullLength} 999`}
          transform={`rotate(${rotation} ${CENTER} ${CENTER})`}
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          className="dial__fill"
          strokeDasharray={`${filled} 999`}
          transform={`rotate(${rotation} ${CENTER} ${CENTER})`}
        />
      </svg>

      <div className="dial__readout">
        <span className="dial__value">{value}</span>
        <span className="dial__unit">%</span>
      </div>
    </div>
  );
}
