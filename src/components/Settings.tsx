import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
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
  onExport: () => void;
  // Recebe o texto bruto do arquivo escolhido; devolve uma mensagem de
  // erro pra mostrar, ou null se importou com sucesso.
  onImport: (raw: string) => string | null;
}

const SCROLL_MODIFIER_OPTIONS: { key: ScrollModifier; label: string }[] = [
  { key: "ctrl", label: "Ctrl" },
  { key: "alt", label: "Alt" },
  { key: "shift", label: "Shift" },
];

// Qual atalho está sendo gravado agora (ou nenhum). Só um por vez -
// gravar o de "diminuir" cancela a gravação do de "aumentar", etc.
type RecordingField = "shortcutUp" | "shortcutDown" | null;

export default function Settings({ settings, onChange, onExport, onImport }: Props) {
  const [recording, setRecording] = useState<RecordingField>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpa o valor do input já aqui, não só no fim - assim escolher o
    // MESMO arquivo duas vezes seguidas (ex.: tentar de novo depois de um
    // erro) dispara onChange de novo, o que não aconteceria se o browser
    // visse o value "igual ao de antes".
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const error = onImport(raw);
      setImportError(error);
    };
    reader.onerror = () => setImportError("Não foi possível ler o arquivo.");
    reader.readAsText(file);
  };

  // O autostart não vive no localStorage (settings.ts) porque a fonte da
  // verdade real é o registro do SO - por isso é lido do Rust ao abrir
  // essa tela, em vez de vir junto com o resto de `settings`.
  const [autostart, setAutostart] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<boolean>("get_autostart_enabled")
      .then(setAutostart)
      .catch(() => setAutostart(null));
  }, []);

  const toggleAutostart = () => {
    if (autostart === null) return;
    const next = !autostart;
    setAutostart(next); // otimista - a UI responde na hora
    invoke("set_autostart_enabled", { enabled: next }).catch(() => {
      setAutostart(!next); // desfaz se o Rust recusar
    });
  };

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

      <div className="settings__section">
        <h2 className="settings__heading">Inicialização</h2>
        <div className="settings__row">
          <span className="settings__label">Iniciar com o Windows</span>
          <button
            type="button"
            role="switch"
            aria-checked={autostart ?? false}
            disabled={autostart === null}
            className={`settings__toggle ${autostart ? "settings__toggle--on" : ""}`}
            onClick={toggleAutostart}
          >
            <span className="settings__toggle-knob" />
          </button>
        </div>
      </div>

      <div className="settings__section">
        <h2 className="settings__heading">Backup</h2>
        <div className="settings__row">
          <span className="settings__label">
            Configurações e perfis num arquivo .json
          </span>
          <div className="settings__backup-actions">
            <button type="button" className="settings__backup-btn" onClick={onExport}>
              Exportar
            </button>
            <button
              type="button"
              className="settings__backup-btn"
              onClick={handleImportClick}
            >
              Importar
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="settings__file-input"
          onChange={handleFileSelected}
        />
        {importError && <p className="settings__hint settings__hint--error">{importError}</p>}
        <p className="settings__hint">
          Importar substitui os atalhos, o tema e os perfis atuais pelos do
          arquivo.
        </p>
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
