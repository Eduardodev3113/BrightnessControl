import { getCurrentWindow } from "@tauri-apps/api/window";
import "./TitleBar.css";

// Janela é criada sem moldura nativa (decorations: false no tauri.conf.json),
// então essa barra faz o papel de: permitir arrastar a janela, minimizar
// e "fechar" (na verdade esconde e manda pra bandeja, ver App.tsx).
//
// Quando `showingSettings` é true, o label vira "Configurações" e aparece
// uma seta de voltar do lado esquerdo - assim não precisa de um botão
// extra só pra sair da tela de config.
interface Props {
  onClose: () => void;
  showingSettings: boolean;
  onToggleSettings: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export default function TitleBar({
  onClose,
  showingSettings,
  onToggleSettings,
  theme,
  onToggleTheme,
}: Props) {
  const appWindow = getCurrentWindow();

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__left" data-tauri-drag-region>
        {showingSettings && (
          <button
            className="titlebar__btn titlebar__btn--back"
            aria-label="Voltar"
            onClick={onToggleSettings}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path
                d="M6.5 1L2 5L6.5 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <span className="titlebar__label" data-tauri-drag-region>
          {showingSettings ? "Configurações" : "Brilho"}
        </span>
      </div>

      <div className="titlebar__controls">
        <button
          className="titlebar__btn"
          aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M8 1.2v1.8M8 13v1.8M14.8 8h-1.8M3 8H1.2M13 3l-1.3 1.3M4.3 11.7L3 13M13 13l-1.3-1.3M4.3 4.3L3 3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M13.5 9.8A5.8 5.8 0 0 1 6.2 2.5a5.8 5.8 0 1 0 7.3 7.3z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
        {!showingSettings && (
          <button
            className="titlebar__btn"
            aria-label="Configurações"
            onClick={onToggleSettings}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6L3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <button
          className="titlebar__btn"
          aria-label="Minimizar"
          onClick={() => appWindow.minimize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          aria-label="Fechar (continua em segundo plano)"
          onClick={onClose}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
