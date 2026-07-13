import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Preset } from "./components/PresetChips";

// Formato de string igual ao que o `tauri-plugin-global-shortcut` espera
// no lado Rust (ver src-tauri/src/main.rs): modificadores em minúsculo
// separados por "+", seguidos do nome do "Code" (ArrowUp, KeyA, Digit1,
// F5...). Guardar já nesse formato evita ter que converter na hora de
// mandar pro Rust.
export interface AppSettings {
  shortcutUp: string;
  shortcutDown: string;
  dialStep: number; // quanto o dial anda por tecla de seta (sem Shift)
  showOsd: boolean; // se o popup de brilho aparece ao usar atalho/scroll
  theme: "dark" | "light";
  // Quais teclas precisam estar seguradas pra rolar a roda do mouse mudar
  // o brilho (ex.: ["ctrl", "alt"]). Precisa ter pelo menos uma - scroll
  // sem nenhum modificador mudaria o brilho toda vez que a pessoa rolasse
  // qualquer coisa na tela.
  scrollModifiers: ScrollModifier[];
}

export type ScrollModifier = "ctrl" | "alt" | "shift";

export const DEFAULT_SETTINGS: AppSettings = {
  shortcutUp: "ctrl+alt+ArrowUp",
  shortcutDown: "ctrl+alt+ArrowDown",
  dialStep: 2,
  showOsd: true,
  theme: "dark",
  scrollModifiers: ["ctrl", "alt"],
};

const SETTINGS_STORAGE_KEY = "brilho.config";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      // Mescla com o padrão pra nunca faltar campo (ex.: se uma versão
      // futura adicionar uma opção nova, quem já tinha config salva não
      // fica com `undefined` nela).
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // ignora JSON inválido e cai pro padrão
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

// --- Gravação de atalho ----------------------------------------------

// Teclas que não contam como "a tecla principal" do atalho - são só
// modificadoras. Enquanto o usuário segura só isso, continuamos esperando
// ele apertar a tecla de verdade.
const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

export interface RecordedShortcut {
  value: string; // ex.: "ctrl+alt+ArrowUp", pronto pra salvar/mandar pro Rust
  label: string; // ex.: "Ctrl+Alt+↑", pronto pra mostrar na tela
}

// Nomes de exibição pras teclas mais comuns que não têm um símbolo óbvio.
// Qualquer `code` fora dessa lista usa o próprio nome (ex.: "KeyA" -> "A",
// "Digit1" -> "1"), tratado em `codeToLabel`.
const CODE_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Espaço",
};

function codeToLabel(code: string): string {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

// Captura um KeyboardEvent do React e, se a tecla pressionada for uma
// tecla "de verdade" (não só um modificador sozinho), devolve o atalho
// pronto nos dois formatos. Devolve null enquanto o usuário ainda só
// está segurando Ctrl/Alt/Shift, esperando a tecla final.
export function recordShortcutFromEvent(
  e: ReactKeyboardEvent
): RecordedShortcut | null {
  if (MODIFIER_CODES.has(e.code)) return null;

  const modifiers: string[] = [];
  if (e.ctrlKey) modifiers.push("ctrl");
  if (e.altKey) modifiers.push("alt");
  if (e.shiftKey) modifiers.push("shift");
  if (e.metaKey) modifiers.push("super");

  // Exige pelo menos um modificador. Sem isso, seria possível gravar um
  // atalho global de só "A" (por exemplo) - como o atalho é global (via
  // tauri-plugin-global-shortcut), isso sequestraria a tecla "A" da
  // máquina inteira, mesmo fora do app. Continua esperando o usuário
  // segurar um modificador antes de aceitar a tecla final.
  if (modifiers.length === 0) return null;

  const parts = [...modifiers, e.code];
  return {
    value: parts.join("+"),
    label: [...modifiers.map((m) => m[0].toUpperCase() + m.slice(1)), codeToLabel(e.code)].join(
      "+"
    ),
  };
}

// Pra exibir um atalho já salvo (ex.: "ctrl+alt+ArrowUp") sem precisar
// gravar de novo - usado ao abrir a tela de configurações.
export function formatShortcut(value: string): string {
  const parts = value.split("+");
  const code = parts.pop() ?? "";
  const modifierLabels = parts.map((m) => m[0].toUpperCase() + m.slice(1));
  return [...modifierLabels, codeToLabel(code)].join("+");
}

// --- Backup (exportar/importar) ---------------------------------------

// Versionado desde já: se o formato precisar mudar no futuro (campo
// novo obrigatório, formato de atalho diferente...), `parseBackup` pode
// decidir migrar ou recusar um arquivo de versão antiga/futura em vez de
// aceitar um JSON incompatível calado.
const BACKUP_VERSION = 1;

export interface SettingsBackup {
  version: number;
  exportedAt: string; // ISO 8601, só informativo pro usuário
  settings: AppSettings;
  presets: Preset[];
}

// Monta o objeto de backup pronto pra virar arquivo .json. Mescla com
// DEFAULT_SETTINGS antes de exportar pelo mesmo motivo do loadSettings -
// garante que todo campo exista, mesmo que `settings` em memória tenha
// vindo de uma versão mais antiga do app.
export function buildBackup(settings: AppSettings, presets: Preset[]): SettingsBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS, ...settings },
    presets,
  };
}

// Valida e extrai settings/presets de um JSON importado. Devolve null
// (em vez de lançar) pra quem chama decidir como avisar o usuário -
// arquivo importado é conteúdo não confiável (pode vir de outra
// instalação, versão antiga, ou só estar corrompido), então nada aqui
// pode assumir formato certo sem checar.
export function parseBackup(raw: string): SettingsBackup | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.version !== "number") return null;
  if (!obj.settings || typeof obj.settings !== "object") return null;
  if (!Array.isArray(obj.presets)) return null;

  const presets = obj.presets.filter(
    (p): p is Preset =>
      !!p &&
      typeof p === "object" &&
      typeof (p as Preset).id === "string" &&
      typeof (p as Preset).label === "string" &&
      typeof (p as Preset).value === "number"
  );

  return {
    version: obj.version,
    exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : "",
    // Mescla com o padrão em vez de confiar cegamente no arquivo - um
    // backup de uma versão mais antiga do app (com menos campos) não
    // deve deixar o resto das configurações com `undefined`.
    settings: { ...DEFAULT_SETTINGS, ...(obj.settings as Partial<AppSettings>) },
    presets,
  };
}
