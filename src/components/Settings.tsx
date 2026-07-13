import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  type AppSettings,
  type ScrollModifier,
  DEFAULT_SETTINGS,
  formatShortcut,
  recordShortcutFromEvent,
} from "../settings";
import "./Settings.css";

interface Props {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}

const SCROLL_MODIFIER_OPTIONS: { key: ScrollModifier; label: string }[] = [
  { key: "ctrl", label: "Ctrl" },
  { key: "alt", label: "Alt" },
  { key: "shift", label: "Shift" },
];

// Qual atalho está sendo gravado agora (ou nenhum). Só um por vez -
// gravar o de "diminuir" cancela a gravação do de "aumentar", etc.
type RecordingField = "shortcutUp" | "shortcutDown" | null;

export default function Settings({ settings, onChange }: Props) {
  const [recording, setRecording] = useState<RecordingField>(null);

  const patch = (partial: Partial<AppSettings>) => {
    onChange({ ...settings, ...partial });
  };

  // Alterna um modificador do scroll. Bloqueia desmarcar o último que
  // sobrou - com zero modificadores, qualquer scroll na tela (mesmo fora
  // do app) mudaria o brilho, o que seria bem incômodo.
  const toggleScrollModifier = (key: ScrollModifier) => {
    const has = settings.scrollModifiers.includes(key);
    if (has && settings.scrollModifiers.length === 1) return;
    const next = has
      ? settings.scrollModifiers.filter((m) => m !== key)
      : [...settings.scrollModifiers, key];
    patch({ scrollModifiers: next });
  };

  const handleRecordKeyDown = (
    field: RecordingField,
    e: ReactKeyboardEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    if (e.key === "Escape") {
      setRecording(null);
      return;
    }
    if (!field) return;
    const result = recordShortcutFromEvent(e);
    if (result) {
      patch({ [field]: result.value } as Partial<AppSettings>);
      setRecording(null);
    }
  };

  const renderShortcutRow = (
    field: RecordingField,
    label: string,
    currentValue: string
  ) => {
    const isRecording = recording === field;
    return (
      <div className="settings__row">
        <span className="settings__label">{label}</span>
        <button
          type="button"
          className={`settings__shortcut-btn ${isRecording ? "settings__shortcut-btn--recording" : ""}`}
          onClick={() => setRecording(field)}
          onKeyDown={(e) => handleRecordKeyDown(field, e)}
          onBlur={() => setRecording((r) => (r === field ? null : r))}
        >
          {isRecording ? "Pressione uma tecla…" : formatShortcut(currentValue)}
        </button>
      </div>
    );
  };

  return (
    <div className="settings">
      <div className="settings__section">
        <h2 className="settings__heading">Atalhos globais</h2>
        {renderShortcutRow("shortcutUp", "Aumentar brilho", settings.shortcutUp)}
        {renderShortcutRow("shortcutDown", "Diminuir brilho", settings.shortcutDown)}
        <p className="settings__hint">
          Clique no atalho e pressione a combinação desejada. Esc cancela.
        </p>
      </div>

      <div className="settings__section">
        <h2 className="settings__heading">Dial</h2>
        <div className="settings__row">
          <span className="settings__label">Passo por ajuste (seta e scroll)</span>
          <div className="settings__step-control">
            <input
              type="range"
              min={1}
              max={20}
              value={settings.dialStep}
              onChange={(e) => patch({ dialStep: Number(e.target.value) })}
              className="settings__slider"
            />
            <span className="settings__step-value">{settings.dialStep}%</span>
          </div>
        </div>
      </div>

      <div className="settings__section">
        <h2 className="settings__heading">Scroll do mouse</h2>
        <div className="settings__row">
          <span className="settings__label">Teclas para rolar e mudar o brilho</span>
          <div className="settings__modifier-group">
            {SCROLL_MODIFIER_OPTIONS.map(({ key, label }) => {
              const active = settings.scrollModifiers.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`settings__modifier-chip ${
                    active ? "settings__modifier-chip--active" : ""
                  }`}
                  onClick={() => toggleScrollModifier(key)}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="settings__hint">
          Segure essas teclas e role a roda do mouse em qualquer lugar da tela
          pra ajustar o brilho. Pelo menos uma precisa ficar marcada.
        </p>
      </div>

      <div className="settings__section">
        <h2 className="settings__heading">Aviso na tela</h2>
        <div className="settings__row">
          <span className="settings__label">
            Mostrar popup ao ajustar via atalho/scroll
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.showOsd}
            className={`settings__toggle ${settings.showOsd ? "settings__toggle--on" : ""}`}
            onClick={() => patch({ showOsd: !settings.showOsd })}
          >
            <span className="settings__toggle-knob" />
          </button>
        </div>
      </div>

      <button
        type="button"
        className="settings__reset"
        onClick={() => onChange(DEFAULT_SETTINGS)}
      >
        Restaurar padrão
      </button>
    </div>
  );
}
