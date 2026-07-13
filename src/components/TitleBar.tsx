import { getCurrentWindow } from "@tauri-apps/api/window";
import "./TitleBar.css";

// Janela é criada sem moldura nativa (decorations: false no tauri.conf.json),
// então essa barra faz o papel de: permitir arrastar a janela, minimizar
// e "fechar" (na verdade esconde e manda pra bandeja, ver App.tsx).
export default function TitleBar({ onClose }: { onClose: () => void }) {
  const appWindow = getCurrentWindow();

  return (
    <header className="titlebar" data-tauri-drag-region>
      <span className="titlebar__label" data-tauri-drag-region>
        Brilho
      </span>
      <div className="titlebar__controls">
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
