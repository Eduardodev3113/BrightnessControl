import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./BrightnessOsd.css";

// Quanto tempo o popup fica na tela depois do último ajuste (Ctrl+Alt+Seta
// ou Ctrl+Alt+Scroll) antes de sumir sozinho - igual o popup de volume do
// Windows.
const HIDE_DELAY_MS = 1400;

// Esse componente roda numa janela Tauri separada ("osd"), sempre no ar
// mas escondida (visible: false), sem ícone na barra de tarefas. Ela só
// aparece quando chega um evento de brilho vindo de fora da janela
// principal (atalho global ou scroll global) e some sozinha em seguida.
export default function BrightnessOsd() {
  const [value, setValue] = useState(50);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();

    const unlisten = listen<[number, number]>("brightness-changed", async (event) => {
      const [, newValue] = event.payload;
      setValue(newValue);

      // Essa janela roda isolada da principal, então não tem como ler o
      // "Mostrar popup" do localStorage direto - pergunta pro Rust, que é
      // quem a janela principal mantém atualizado (ver App.tsx).
      const shouldShow = await invoke<boolean>("get_show_osd").catch(() => true);
      if (!shouldShow) return;

      win.show();

      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        win.hide();
      }, HIDE_DELAY_MS);
    });

    return () => {
      unlisten.then((fn) => fn());
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, []);

  return (
    <div className="osd">
      <span className="osd__icon">☀</span>
      <div className="osd__bar">
        <div className="osd__bar-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="osd__value">{value}%</span>
    </div>
  );
}
