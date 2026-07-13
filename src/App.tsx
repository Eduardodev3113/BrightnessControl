import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/TitleBar";
import BrightnessDial from "./components/BrightnessDial";
import PresetChips, { DEFAULT_PRESETS, type Preset } from "./components/PresetChips";
import MonitorSelect, { MonitorInfo } from "./components/MonitorSelect";
import Settings from "./components/Settings";
import {
  loadSettings,
  saveSettings,
  buildBackup,
  parseBackup,
  type AppSettings,
} from "./settings";
import "./App.css";

// Espera esse tempo sem o usuário mexer no dial antes de mandar o valor
// pro monitor de verdade. Isso evita inundar o barramento DDC/CI (que é
// lento, ~50-200ms por escrita) com uma escrita a cada pixel arrastado.
const WRITE_DEBOUNCE_MS = 60;

// De quanto em quanto tempo relê o brilho direto do monitor, pra pegar
// mudanças feitas por fora do app (botões físicos do monitor, outro
// software). DDC/CI é lento, então esse intervalo é bem mais folgado que
// qualquer coisa relacionada a interação do usuário.
const POLL_INTERVAL_MS = 4000;

// Depois de qualquer escrita nossa (dial, preset, atalho, scroll), ignora
// leituras do polling por esse tempo - senão uma leitura que chegue no
// meio de uma sequência de ajustes rápidos pode aplicar um valor já
// desatualizado por cima do que o usuário acabou de fazer.
const POLL_SUPPRESS_AFTER_WRITE_MS = 1500;

// Quantos passos de "desfazer" guardamos por monitor. Uma pilha por
// monitor (em vez de uma global) porque desfazer um ajuste feito no
// monitor A não deveria mexer no valor do monitor B.
const HISTORY_MAX = 20;

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
  // Timestamp da última vez que o próprio app escreveu no monitor -
  // consultado pelo polling (ver useEffect mais abaixo) pra saber se deve
  // ignorar a leitura porque acabamos de mexer no brilho nós mesmos.
  const lastLocalWriteRef = useRef(0);
  const markLocalWrite = () => {
    lastLocalWriteRef.current = Date.now();
  };

  // Pilha de valores anteriores, por monitor, pra permitir "desfazer" o
  // último ajuste de brilho. Fica num ref (não em state) porque é
  // consultada/alterada dentro de callbacks que não precisam re-renderizar
  // sozinhos - o `historyVersion` abaixo é só o gatilho pra atualizar o
  // botão "Desfazer" na tela.
  const historyRef = useRef<Record<number, number[]>>({});
  const [historyVersion, setHistoryVersion] = useState(0);
  // Guarda o valor de brilho de antes de uma sequência de ajustes (um
  // arraste no dial, uma rajada de setas) começar, pra que o "desfazer"
  // volte pra antes do gesto inteiro, não pra um meio-passo dele.
  const gestureStart = useRef<{ monitor: number; value: number } | null>(null);

  const pushHistory = (monitorIndex: number, previousValue: number) => {
    const arr = historyRef.current[monitorIndex] ?? [];
    if (arr[arr.length - 1] === previousValue) return;
    historyRef.current[monitorIndex] = [...arr, previousValue].slice(-HISTORY_MAX);
    setHistoryVersion((v) => v + 1);
  };

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

  // O popup ("osd") roda numa janela separada, que não tem acesso ao
  // localStorage/estado da janela principal - por isso ele mesmo pergunta
  // pro Rust (via get_show_osd) se deve aparecer, e é esse effect aqui
  // que mantém o Rust com o valor atualizado.
  useEffect(() => {
    invoke("set_show_osd", { show: settings.showOsd }).catch((err) =>
      setError(String(err))
    );
  }, [settings.showOsd]);

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
      if (index === selectedMonitor) {
        markLocalWrite();
        if (value !== brightnessRef.current) {
          pushHistory(index, brightnessRef.current);
        }
        setBrightness(value);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [selectedMonitor]);

  // Relê o brilho real do monitor de tempos em tempos, pra pegar mudanças
  // feitas por fora do app (botões físicos do monitor, outro software de
  // controle). Só roda com a janela visível (não tem por quê gastar
  // ciclos de DDC/CI com o app minimizado/escondido na bandeja) e ignora
  // leituras que caiam logo depois de uma escrita nossa (ver
  // markLocalWrite), pra não sobrepor um ajuste que o próprio usuário
  // acabou de fazer com um valor que já ficou velho.
  useEffect(() => {
    if (monitors.length === 0) return;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLocalWriteRef.current < POLL_SUPPRESS_AFTER_WRITE_MS) return;
      if (animationFrame.current !== null) return;
      try {
        const current = await invoke<number>("get_brightness", {
          index: selectedMonitor,
        });
        setBrightness((prev) => (prev === current ? prev : current));
      } catch {
        // Falha isolada de leitura não é motivo pra mostrar erro na tela -
        // o próximo ciclo tenta de novo.
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [selectedMonitor, monitors.length]);

  const commitBrightness = (value: number) => {
    if (writeTimeout.current) {
      clearTimeout(writeTimeout.current);
    } else {
      // Não há uma escrita pendente ainda, então isso é o início de uma
      // nova sequência de ajuste (primeiro movimento de um arraste, ou
      // uma tecla de seta isolada) - guarda o valor de antes dela pra
      // permitir desfazer o gesto inteiro depois, não só o último pixel.
      gestureStart.current = { monitor: selectedMonitor, value: brightnessRef.current };
    }
    writeTimeout.current = setTimeout(() => {
      writeTimeout.current = null;
      markLocalWrite();
      invoke("set_brightness", { index: selectedMonitor, value }).catch((err) =>
        setError(String(err))
      );
      if (gestureStart.current && gestureStart.current.monitor === selectedMonitor) {
        pushHistory(selectedMonitor, gestureStart.current.value);
      }
      gestureStart.current = null;
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
    if (start !== target) pushHistory(selectedMonitor, start);
    const startTime = performance.now();
    let lastWrite = 0;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / TRANSITION_MS);
      const value = Math.round(start + (target - start) * easeOutCubic(t));
      setBrightness(value);

      if (t >= 1) {
        animationFrame.current = null;
        markLocalWrite();
        invoke("set_brightness", { index: selectedMonitor, value: target }).catch(
          (err) => setError(String(err))
        );
        return;
      }

      if (now - lastWrite >= ANIMATION_WRITE_INTERVAL_MS) {
        lastWrite = now;
        markLocalWrite();
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

  // Gera o JSON do backup (settings + perfis) e salva num arquivo.
  //
  // Antes isso usava um Blob + link `<a download>`, um truque que só
  // funciona num navegador de verdade (que tem uma UI de downloads pra
  // pegar o clique e perguntar onde salvar). A janela do Tauri não tem
  // essa UI, então o clique não fazia nada visível - por isso o botão
  // "parecia" quebrado. Agora é tudo nativo: o plugin de diálogo abre o
  // "Salvar como" do próprio Windows, e quem escreve o arquivo de
  // verdade é um comando Rust (write_text_file, em src-tauri/src/main.rs).
  const handleExportSettings = async () => {
    const backup = buildBackup(settings, profiles);
    const date = new Date().toISOString().slice(0, 10);
    try {
      const path = await save({
        defaultPath: `brilho-config-${date}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return; // usuário cancelou o diálogo
      await invoke("write_text_file", {
        path,
        contents: JSON.stringify(backup, null, 2),
      });
    } catch (err) {
      setError(String(err));
    }
  };

  // Recebe o texto bruto de um arquivo .json escolhido pelo usuário (ver
  // Settings.tsx, que lê o arquivo com FileReader e chama isto). Devolve
  // uma mensagem de erro (string) em caso de falha, ou null se aplicou
  // com sucesso - assim a tela de configurações pode mostrar um aviso
  // sem precisar de mais um estado de erro duplicado aqui em App.
  const handleImportSettings = (raw: string): string | null => {
    const backup = parseBackup(raw);
    if (!backup) return "Arquivo inválido ou corrompido.";
    setSettings(backup.settings);
    setProfiles(backup.presets.length > 0 ? backup.presets : DEFAULT_PRESETS);
    return null;
  };

  // Desfaz o último ajuste de brilho do monitor selecionado, voltando pro
  // valor guardado no topo da pilha de histórico dele. Cancela qualquer
  // animação/escrita pendente antes, senão ela poderia sobrescrever o
  // valor restaurado um instante depois.
  // O `historyVersion` na lista de dependências é o que força recalcular
  // isto quando a pilha muda - o histórico em si vive num ref (não em
  // state) porque é lido/alterado dentro de callbacks que não devem
  // disparar re-render sozinhos.
  const canUndo = useMemo(
    () => (historyRef.current[selectedMonitor] ?? []).length > 0,
    [selectedMonitor, historyVersion]
  );

  const handleUndo = () => {
    const stack = historyRef.current[selectedMonitor] ?? [];
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    historyRef.current[selectedMonitor] = stack.slice(0, -1);
    setHistoryVersion((v) => v + 1);

    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
    if (writeTimeout.current) {
      clearTimeout(writeTimeout.current);
      writeTimeout.current = null;
    }
    gestureStart.current = null;

    markLocalWrite();
    setBrightness(previous);
    invoke("set_brightness", { index: selectedMonitor, value: previous }).catch((err) =>
      setError(String(err))
    );
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
          <Settings
            settings={settings}
            onChange={setSettings}
            onExport={handleExportSettings}
            onImport={handleImportSettings}
          />
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

                {canUndo && (
                  <button
                    type="button"
                    className="app__undo-btn"
                    onClick={handleUndo}
                    title="Desfazer o último ajuste de brilho"
                    aria-label="Desfazer o último ajuste de brilho"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M4 3v3.5H7.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4.2 6.3A5.3 5.3 0 1 1 3.4 9.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </svg>
                    Desfazer
                  </button>
                )}

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
