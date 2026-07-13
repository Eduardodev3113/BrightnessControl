import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/TitleBar";
import BrightnessDial from "./components/BrightnessDial";
import PresetChips, { DEFAULT_PRESETS, type Preset } from "./components/PresetChips";
import MonitorSelect, { MonitorInfo } from "./components/MonitorSelect";
import Settings from "./components/Settings";
import { loadSettings, saveSettings, type AppSettings } from "./settings";
import "./App.css";

// Espera esse tempo sem o usuário mexer no dial antes de mandar o valor
// pro monitor de verdade. Isso evita inundar o barramento DDC/CI (que é
// lento, ~50-200ms por escrita) com uma escrita a cada pixel arrastado.
const WRITE_DEBOUNCE_MS = 60;

// Todos os perfis (os 4 padrão + os que o usuário criar) ficam salvos
// juntos aqui, sobrevivendo a fechar e reabrir o app. Guardar tudo numa
// lista só (em vez de separar "padrão" de "customizado") é o que permite
// remover qualquer perfil, não só os criados pelo usuário.
const PROFILES_STORAGE_KEY = "brilho.perfis";

function loadProfiles(): Preset[] {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignora JSON inválido e cai pro padrão
  }
  return DEFAULT_PRESETS;
}

export default function App() {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState(0);
  const [brightness, setBrightness] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Preset[]>(() => loadProfiles());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [showingSettings, setShowingSettings] = useState(false);

  const writeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Espelha o `brightness` mais atual num ref, pra que a animação de
  // transição (que roda fora do ciclo de render, num loop de
  // requestAnimationFrame) sempre parta do valor certo, mesmo se o
  // estado ainda não tiver sido re-renderizado.
  const brightnessRef = useRef(brightness);
  useEffect(() => {
    brightnessRef.current = brightness;
  }, [brightness]);
  // Id do frame agendado da transição suave em curso (se houver), pra
  // poder cancelar se o usuário selecionar outro preset no meio do
  // caminho.
  const animationFrame = useRef<number | null>(null);

  // Detecta os monitores e o brilho do primeiro deles. Extraído numa
  // função à parte pra poder ser chamado tanto na abertura do app quanto
  // pelo botão "Tentar de novo" quando a detecção falha (ex.: usuário
  // habilitou o DDC/CI no menu do monitor e quer testar de novo sem
  // reiniciar o app).
  const detectMonitors = async () => {
    setLoading(true);
    setError(null);
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
  };

  // Salva a lista de perfis sempre que ela muda.
  useEffect(() => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  // Salva as configurações sempre que mudam.
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Aplica o tema (claro/escuro) no elemento raiz - é isso que ativa as
  // variáveis de cor de [data-theme="light"] em index.css.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Manda os atalhos configurados pro lado Rust - tanto ao abrir o app
  // (pra reaplicar um atalho customizado salvo de uma sessão anterior,
  // já que o Rust não lê o localStorage) quanto toda vez que o usuário
  // grava um atalho novo na tela de configurações.
  useEffect(() => {
    invoke("set_global_shortcuts", {
      up: settings.shortcutUp,
      down: settings.shortcutDown,
    }).catch((err) => setError(String(err)));
  }, [settings.shortcutUp, settings.shortcutDown]);

  // Mesma ideia, mas pros modificadores do scroll - o listener global do
  // Rust (rdev) não tem acesso ao localStorage, então precisa que o
  // front-end avise toda vez que abrir o app e toda vez que o usuário
  // mudar a combinação na tela de configurações.
  useEffect(() => {
    invoke("set_scroll_modifiers", {
      modifiers: settings.scrollModifiers,
    }).catch((err) => setError(String(err)));
  }, [settings.scrollModifiers]);

  // O "passo" configurado (Passo por seta, na tela de configurações) vale
  // tanto pro atalho de teclado global quanto pro scroll - os dois vivem
  // no lado Rust e não têm acesso ao localStorage, então precisam que o
  // front-end avise.
  useEffect(() => {
    invoke("set_brightness_step", { step: settings.dialStep }).catch((err) =>
      setError(String(err))
    );
  }, [settings.dialStep]);

  // Carrega a lista de monitores e o brilho atual ao abrir o app.
  useEffect(() => {
    detectMonitors();
  }, []);

  // Troca de monitor selecionado -> busca o brilho atual dele e avisa o
  // lado Rust, que precisa saber qual monitor ajustar quando o atalho
  // global (Ctrl+Alt+Seta) for acionado - ele roda fora do React.
  useEffect(() => {
    if (monitors.length === 0) return;
    invoke<number>("get_brightness", { index: selectedMonitor })
      .then(setBrightness)
      .catch((err) => setError(String(err)));
    invoke("set_selected_monitor", { index: selectedMonitor }).catch(() => {});
  }, [selectedMonitor, monitors.length]);

  // Escuta o evento emitido pelo Rust quando o atalho global
  // (Ctrl+Alt+Seta) muda o brilho, pra manter o dial sincronizado mesmo
  // com a janela em segundo plano.
  useEffect(() => {
    const unlisten = listen<[number, number]>("brightness-changed", (event) => {
      const [index, value] = event.payload;
      if (index === selectedMonitor) setBrightness(value);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [selectedMonitor]);

  const commitBrightness = (value: number) => {
    if (writeTimeout.current) clearTimeout(writeTimeout.current);
    writeTimeout.current = setTimeout(() => {
      invoke("set_brightness", { index: selectedMonitor, value }).catch((err) =>
        setError(String(err))
      );
    }, WRITE_DEBOUNCE_MS);
  };

  const handleChange = (value: number) => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
    setBrightness(value);
    commitBrightness(value);
  };

  // Transição suave: em vez do brilho pular direto pro valor de um preset,
  // desliza até lá em meio segundo. Usada só na seleção de presets - o
  // dial continua usando handleChange (direto), porque arrastar já é um
  // gesto contínuo, animar por cima ia deixar ele "atrasado" da mão do
  // usuário.
  const TRANSITION_MS = 500;
  // Não dá pra escrever no monitor a cada frame (~16ms) - o DDC/CI é
  // lento e o barramento engasgaria. Escreve no máximo a cada 80ms
  // durante a animação; o valor final sempre é escrito exato, sem essa
  // limitação, no fim do trajeto.
  const ANIMATION_WRITE_INTERVAL_MS = 80;
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const animateBrightnessTo = (target: number) => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
    if (writeTimeout.current) {
      clearTimeout(writeTimeout.current);
      writeTimeout.current = null;
    }

    const start = brightnessRef.current;
    const startTime = performance.now();
    let lastWrite = 0;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / TRANSITION_MS);
      const value = Math.round(start + (target - start) * easeOutCubic(t));
      setBrightness(value);

      if (t >= 1) {
        animationFrame.current = null;
        invoke("set_brightness", { index: selectedMonitor, value: target }).catch(
          (err) => setError(String(err))
        );
        return;
      }

      if (now - lastWrite >= ANIMATION_WRITE_INTERVAL_MS) {
        lastWrite = now;
        invoke("set_brightness", { index: selectedMonitor, value }).catch(() => {});
      }

      animationFrame.current = requestAnimationFrame(step);
    };

    animationFrame.current = requestAnimationFrame(step);
  };

  const handleAddProfile = (label: string) => {
    const id = `custom-${Date.now()}`;
    setProfiles((prev) => [...prev, { id, label, value: brightness }]);
  };

  const handleDeleteProfile = (id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  };

  const handleRenameProfile = (id: string, label: string) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, label } : p)));
  };

  const handleClose = () => {
    // "Fechar" só esconde a janela - o app continua rodando na bandeja.
    getCurrentWindow().hide();
  };

  return (
    <div className="app">
      <TitleBar
        onClose={handleClose}
        showingSettings={showingSettings}
        onToggleSettings={() => setShowingSettings((s) => !s)}
        theme={settings.theme}
        onToggleTheme={() =>
          setSettings((s) => ({ ...s, theme: s.theme === "dark" ? "light" : "dark" }))
        }
      />

      <main className={`app__content ${showingSettings ? "app__content--settings" : ""}`}>
        {showingSettings ? (
          <Settings settings={settings} onChange={setSettings} />
        ) : (
          <>
            {loading && <p className="app__status">Procurando monitores…</p>}

            {!loading && error && (
              <div className="app__error">
                <p>Não foi possível controlar o monitor.</p>
                <p className="app__error-detail">{error}</p>
                <p className="app__error-hint">
                  Verifique se o DDC/CI está habilitado no menu do monitor e se
                  ele está conectado via HDMI ou DisplayPort.
                </p>
                <button
                  type="button"
                  className="app__error-retry"
                  onClick={detectMonitors}
                >
                  Tentar de novo
                </button>
              </div>
            )}

            {!loading && !error && (
              <>
                <BrightnessDial
                  value={brightness}
                  onChange={handleChange}
                  step={settings.dialStep}
                />

                <PresetChips
                  presets={profiles}
                  activeValue={brightness}
                  onSelect={animateBrightnessTo}
                  onAddProfile={handleAddProfile}
                  onDeleteProfile={handleDeleteProfile}
                  onRenameProfile={handleRenameProfile}
                />

                <MonitorSelect
                  monitors={monitors}
                  selected={selectedMonitor}
                  onSelect={setSelectedMonitor}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
