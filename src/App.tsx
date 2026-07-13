import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/TitleBar";
import BrightnessDial from "./components/BrightnessDial";
import PresetChips, { DEFAULT_PRESETS } from "./components/PresetChips";
import MonitorSelect, { MonitorInfo } from "./components/MonitorSelect";
import "./App.css";

// Espera esse tempo sem o usuário mexer no dial antes de mandar o valor
// pro monitor de verdade. Isso evita inundar o barramento DDC/CI (que é
// lento, ~50-200ms por escrita) com uma escrita a cada pixel arrastado.
const WRITE_DEBOUNCE_MS = 60;

export default function App() {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState(0);
  const [brightness, setBrightness] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const writeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega a lista de monitores e o brilho atual ao abrir o app.
  useEffect(() => {
    (async () => {
      try {
        const list = await invoke<MonitorInfo[]>("list_monitors");
        setMonitors(list);
        if (list.length > 0) {
          const current = await invoke<number>("get_brightness", {
            index: list[0].index,
          });
          setBrightness(current);
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Troca de monitor selecionado -> busca o brilho atual dele.
  useEffect(() => {
    if (monitors.length === 0) return;
    invoke<number>("get_brightness", { index: selectedMonitor })
      .then(setBrightness)
      .catch((err) => setError(String(err)));
  }, [selectedMonitor, monitors.length]);

  const commitBrightness = (value: number) => {
    if (writeTimeout.current) clearTimeout(writeTimeout.current);
    writeTimeout.current = setTimeout(() => {
      invoke("set_brightness", { index: selectedMonitor, value }).catch((err) =>
        setError(String(err))
      );
    }, WRITE_DEBOUNCE_MS);
  };

  const handleChange = (value: number) => {
    setBrightness(value);
    commitBrightness(value);
  };

  const handleClose = () => {
    // "Fechar" só esconde a janela - o app continua rodando na bandeja.
    getCurrentWindow().hide();
  };

  return (
    <div className="app">
      <TitleBar onClose={handleClose} />

      <main className="app__content">
        {loading && <p className="app__status">Procurando monitores…</p>}

        {!loading && error && (
          <div className="app__error">
            <p>Não foi possível controlar o monitor.</p>
            <p className="app__error-detail">{error}</p>
            <p className="app__error-hint">
              Verifique se o DDC/CI está habilitado no menu do monitor e se ele
              está conectado via HDMI ou DisplayPort.
            </p>
          </div>
        )}

        {!loading && !error && (
          <>
            <BrightnessDial value={brightness} onChange={handleChange} />

            <PresetChips
              presets={DEFAULT_PRESETS}
              activeValue={brightness}
              onSelect={handleChange}
            />

            <MonitorSelect
              monitors={monitors}
              selected={selectedMonitor}
              onSelect={setSelectedMonitor}
            />
          </>
        )}
      </main>
    </div>
  );
}
