// Em builds de release, esconde o console preto do Windows por trás do app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod brightness;

use brightness::{adjust_brightness, get_brightness, list_monitors, set_brightness};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, ShortcutState};

/// Guarda o índice do monitor selecionado no momento na UI, pra que o
/// atalho global (que roda fora do React, sem acesso ao estado do
/// frontend) saiba qual monitor ajustar.
struct SelectedMonitor(Mutex<usize>);

#[tauri::command]
fn set_selected_monitor(index: usize, state: State<SelectedMonitor>) {
    *state.0.lock().unwrap() = index;
}

/// Atalho de aumentar/diminuir brilho, como (modificadores, tecla).
/// Guardado separado da string original porque é o que o handler global
/// (que roda a cada tecla do sistema inteiro, não só quando o app está em
/// foco) usa pra comparar com `shortcut.matches(...)`.
struct ShortcutConfig(Mutex<(Modifiers, Code, Modifiers, Code)>);

fn default_shortcut_config() -> ShortcutConfig {
    let ctrl_alt = Modifiers::CONTROL | Modifiers::ALT;
    ShortcutConfig(Mutex::new((
        ctrl_alt,
        Code::ArrowUp,
        ctrl_alt,
        Code::ArrowDown,
    )))
}

/// Converte uma string tipo "ctrl+alt+ArrowUp" (o mesmo formato que o
/// front-end grava em settings.ts) em (Modifiers, Code). Cobre as teclas
/// que fazem sentido pra um atalho de brilho: setas, letras, números,
/// F1-F12 e algumas teclas especiais comuns.
fn parse_shortcut(raw: &str) -> Result<(Modifiers, Code), String> {
    let mut parts: Vec<&str> = raw.split('+').collect();
    let key_part = parts.pop().ok_or_else(|| "atalho vazio".to_string())?;

    let mut modifiers = Modifiers::empty();
    for part in parts {
        match part {
            "ctrl" => modifiers |= Modifiers::CONTROL,
            "alt" => modifiers |= Modifiers::ALT,
            "shift" => modifiers |= Modifiers::SHIFT,
            "super" => modifiers |= Modifiers::SUPER,
            other => return Err(format!("modificador desconhecido: {other}")),
        }
    }

    let code = match key_part {
        "ArrowUp" => Code::ArrowUp,
        "ArrowDown" => Code::ArrowDown,
        "ArrowLeft" => Code::ArrowLeft,
        "ArrowRight" => Code::ArrowRight,
        "Space" => Code::Space,
        "Enter" => Code::Enter,
        "Escape" => Code::Escape,
        "Tab" => Code::Tab,
        "Backspace" => Code::Backspace,
        "Delete" => Code::Delete,
        "Insert" => Code::Insert,
        "Home" => Code::Home,
        "End" => Code::End,
        "PageUp" => Code::PageUp,
        "PageDown" => Code::PageDown,
        "KeyA" => Code::KeyA,
        "KeyB" => Code::KeyB,
        "KeyC" => Code::KeyC,
        "KeyD" => Code::KeyD,
        "KeyE" => Code::KeyE,
        "KeyF" => Code::KeyF,
        "KeyG" => Code::KeyG,
        "KeyH" => Code::KeyH,
        "KeyI" => Code::KeyI,
        "KeyJ" => Code::KeyJ,
        "KeyK" => Code::KeyK,
        "KeyL" => Code::KeyL,
        "KeyM" => Code::KeyM,
        "KeyN" => Code::KeyN,
        "KeyO" => Code::KeyO,
        "KeyP" => Code::KeyP,
        "KeyQ" => Code::KeyQ,
        "KeyR" => Code::KeyR,
        "KeyS" => Code::KeyS,
        "KeyT" => Code::KeyT,
        "KeyU" => Code::KeyU,
        "KeyV" => Code::KeyV,
        "KeyW" => Code::KeyW,
        "KeyX" => Code::KeyX,
        "KeyY" => Code::KeyY,
        "KeyZ" => Code::KeyZ,
        "Digit0" => Code::Digit0,
        "Digit1" => Code::Digit1,
        "Digit2" => Code::Digit2,
        "Digit3" => Code::Digit3,
        "Digit4" => Code::Digit4,
        "Digit5" => Code::Digit5,
        "Digit6" => Code::Digit6,
        "Digit7" => Code::Digit7,
        "Digit8" => Code::Digit8,
        "Digit9" => Code::Digit9,
        "F1" => Code::F1,
        "F2" => Code::F2,
        "F3" => Code::F3,
        "F4" => Code::F4,
        "F5" => Code::F5,
        "F6" => Code::F6,
        "F7" => Code::F7,
        "F8" => Code::F8,
        "F9" => Code::F9,
        "F10" => Code::F10,
        "F11" => Code::F11,
        "F12" => Code::F12,
        other => return Err(format!("tecla não suportada: {other}")),
    };

    Ok((modifiers, code))
}

/// Chamado pelo front-end (App.tsx) toda vez que o app abre e toda vez
/// que o usuário grava um atalho novo na tela de configurações. Desregistra
/// os atalhos antigos e registra os novos no SO, além de atualizar o
/// estado que o handler usa pra saber qual é "aumentar" e qual é
/// "diminuir".
#[tauri::command]
fn set_global_shortcuts(
    up: String,
    down: String,
    app: AppHandle,
    state: State<ShortcutConfig>,
) -> Result<(), String> {
    let parsed_up = parse_shortcut(&up)?;
    let parsed_down = parse_shortcut(&down)?;

    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    gs.register(up.as_str()).map_err(|e| e.to_string())?;
    gs.register(down.as_str()).map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = (parsed_up.0, parsed_up.1, parsed_down.0, parsed_down.1);
    Ok(())
}

/// Quais teclas precisam estar seguradas pra rolar a roda do mouse mudar
/// o brilho. Guardado como 3 bools (ctrl, alt, shift) em vez de uma
/// lista de strings porque é isso que o listener do rdev (que roda numa
/// thread separada, fora do Tokio/async) precisa checar a cada evento de
/// scroll - comparação direta é mais barata que procurar numa lista.
struct ScrollConfig(Mutex<(bool, bool, bool)>);

fn default_scroll_config() -> ScrollConfig {
    // Ctrl+Alt, igual o comportamento fixo que já existia antes dessa
    // tela de configurações ser possível.
    ScrollConfig(Mutex::new((true, true, false)))
}

/// Chamado pelo front-end ao abrir o app e toda vez que o usuário muda os
/// modificadores do scroll na tela de configurações.
#[tauri::command]
fn set_scroll_modifiers(modifiers: Vec<String>, state: State<ScrollConfig>) -> Result<(), String> {
    let ctrl = modifiers.iter().any(|m| m == "ctrl");
    let alt = modifiers.iter().any(|m| m == "alt");
    let shift = modifiers.iter().any(|m| m == "shift");

    if !ctrl && !alt && !shift {
        return Err("é preciso pelo menos um modificador".to_string());
    }

    *state.0.lock().unwrap() = (ctrl, alt, shift);
    Ok(())
}

/// O "quanto" cada ajuste move o brilho - compartilhado entre o atalho de
/// teclado global e o scroll, pra que os dois sigam sempre o mesmo passo
/// configurado na tela de configurações (antes cada um tinha um valor
/// fixo de 5 espalhado pelo código, sem ligação com o "Passo por seta"
/// que já existia).
struct BrightnessStep(Mutex<i32>);

/// Chamado pelo front-end ao abrir o app e toda vez que o usuário mexe no
/// controle deslizante "Passo por seta" da tela de configurações.
#[tauri::command]
fn set_brightness_step(step: i32, state: State<BrightnessStep>) -> Result<(), String> {
    if !(1..=50).contains(&step) {
        return Err("passo fora do intervalo permitido".to_string());
    }
    *state.0.lock().unwrap() = step;
    // TEMPORÁRIO - log de diagnóstico. Aparece no terminal onde você
    // rodou `npm run tauri dev`. Remove depois que confirmarmos que o
    // passo está chegando certo.
    eprintln!("[diagnóstico] passo configurado atualizado para {step}");
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(SelectedMonitor(Mutex::new(0)))
        .manage(default_shortcut_config())
        .manage(default_scroll_config())
        .manage(BrightnessStep(Mutex::new(5)))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["ctrl+alt+ArrowUp", "ctrl+alt+ArrowDown"])
                .expect("atalhos de brilho inválidos")
                .with_handler(|app, shortcut, event| {
                    // Só reage ao "pressionar" - ignora o "soltar" da tecla.
                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    let (up_mods, up_code, down_mods, down_code) = {
                        let state = app.state::<ShortcutConfig>();
                        let value = *state.0.lock().unwrap();
                        value
                    };

                    let step = {
                        let state = app.state::<BrightnessStep>();
                        let value = *state.0.lock().unwrap();
                        value
                    };

                    let delta: i32 = if shortcut.matches(up_mods, up_code) {
                        step
                    } else if shortcut.matches(down_mods, down_code) {
                        -step
                    } else {
                        return;
                    };

                    // TEMPORÁRIO - log de diagnóstico.
                    eprintln!("[diagnóstico] atalho de teclado - passo lido: {step}, delta aplicado: {delta}");

                    let state = app.state::<SelectedMonitor>();
                    let index = *state.0.lock().unwrap();

                    // Ajusta direto pelo Rust - funciona mesmo com o app
                    // minimizado/em segundo plano, já que é um atalho
                    // global registrado no SO, não um listener de teclado
                    // do React (que só funciona com a janela em foco).
                    if let Ok(new_value) = adjust_brightness(index, delta) {
                        let _ = app.emit("brightness-changed", (index, new_value));
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            get_brightness,
            set_brightness,
            set_selected_monitor,
            set_global_shortcuts,
            set_scroll_modifiers,
            set_brightness_step
        ])
        .setup(|app| {
            // Registra o app pra iniciar junto com o Windows. Chamar de
            // novo em toda inicialização é seguro (idempotente) - se já
            // estiver registrado, não faz nada de diferente.
            let _ = app.autolaunch().enable();

            // Posiciona a janela OSD (o "popup de volume", mas de brilho)
            // embaixo, centralizada na tela - igual o popup de volume do
            // Windows. Ela começa escondida (visible: false no config) e
            // quem mostra/esconde é o próprio JS dela.
            if let Some(osd) = app.get_webview_window("osd") {
                if let Ok(Some(monitor)) = osd.primary_monitor() {
                    if let Ok(size) = osd.outer_size() {
                        let screen = monitor.size();
                        let x = (screen.width as i32 - size.width as i32) / 2;
                        let y = screen.height as i32 - size.height as i32 - 96;
                        let _ = osd.set_position(tauri::PhysicalPosition::new(x, y));
                    }
                }
            }

            // Escuta Ctrl+Alt(+Shift, conforme configurado) + roda do mouse
            // globalmente (fora do foco do app, igual o atalho de teclado).
            // Como não existe "atalho de scroll" no tauri-plugin-global-shortcut,
            // isso usa um hook global de baixo nível via `rdev`.
            //
            // Duas coisas importantes aqui, que não são óbvias:
            //
            // 1. Usamos `grab` (não `listen`). `listen` só observa o evento,
            //    sem poder impedir que ele chegue no app por trás - por isso
            //    antes a página no navegador rolava JUNTO com o brilho
            //    mudando. `grab` deixa a gente devolver `None` pra "engolir"
            //    o evento (não passa adiante) quando ele for de fato um
            //    ajuste de brilho, e `Some(event)` pra deixar passar normal
            //    quando não for.
            //
            // 2. A escrita de verdade no monitor (`adjust_brightness`, via
            //    DDC/CI) NUNCA roda dentro do callback do hook. Esse
            //    callback roda na mesma fila que o Windows usa pra
            //    processar TODO input do sistema (mouse e teclado, de
            //    qualquer programa) - DDC/CI é lento (50-200ms por
            //    escrita), e travar aqui trava o mouse/teclado da máquina
            //    inteira até a escrita terminar. Por isso o callback só
            //    manda um número pra um canal (`brightness_tx`) e retorna
            //    na hora; quem escreve de verdade é uma thread separada.
            {
                let (brightness_tx, brightness_rx) = std::sync::mpsc::channel::<i32>();

                // Thread dedicada só a escrever no monitor. Fica fora do
                // caminho do hook de input de propósito (ver nota acima).
                {
                    let writer_handle = app.handle().clone();
                    std::thread::spawn(move || {
                        while let Ok(mut delta) = brightness_rx.recv() {
                            // Se vários eventos de scroll chegaram rápido
                            // (scroll contínuo), soma tudo que já estiver
                            // esperando antes de escrever, em vez de uma
                            // escrita lenta por evento - senão a escrita
                            // fica sempre atrasada em relação ao scroll.
                            while let Ok(extra) = brightness_rx.try_recv() {
                                delta += extra;
                            }
                            let state = writer_handle.state::<SelectedMonitor>();
                            let index = *state.0.lock().unwrap();
                            if let Ok(new_value) = adjust_brightness(index, delta) {
                                let _ = writer_handle
                                    .emit("brightness-changed", (index, new_value));
                            }
                        }
                    });
                }

                let app_handle = app.handle().clone();
                let ctrl_held = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
                let alt_held = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
                let shift_held = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
                std::thread::spawn(move || {
                    use rdev::{grab, Event, EventType, Key};
                    use std::sync::atomic::Ordering;

                    let result = grab(move |event: Event| -> Option<Event> {
                        match &event.event_type {
                            EventType::KeyPress(Key::ControlLeft)
                            | EventType::KeyPress(Key::ControlRight) => {
                                ctrl_held.store(true, Ordering::SeqCst);
                            }
                            EventType::KeyRelease(Key::ControlLeft)
                            | EventType::KeyRelease(Key::ControlRight) => {
                                ctrl_held.store(false, Ordering::SeqCst);
                            }
                            EventType::KeyPress(Key::Alt) | EventType::KeyPress(Key::AltGr) => {
                                alt_held.store(true, Ordering::SeqCst);
                            }
                            EventType::KeyRelease(Key::Alt) | EventType::KeyRelease(Key::AltGr) => {
                                alt_held.store(false, Ordering::SeqCst);
                            }
                            EventType::KeyPress(Key::ShiftLeft)
                            | EventType::KeyPress(Key::ShiftRight) => {
                                shift_held.store(true, Ordering::SeqCst);
                            }
                            EventType::KeyRelease(Key::ShiftLeft)
                            | EventType::KeyRelease(Key::ShiftRight) => {
                                shift_held.store(false, Ordering::SeqCst);
                            }
                            EventType::Wheel { delta_y, .. } => {
                                let (need_ctrl, need_alt, need_shift) = {
                                    let state = app_handle.state::<ScrollConfig>();
                                    let value = *state.0.lock().unwrap();
                                    value
                                };
                                let ctrl_ok = !need_ctrl || ctrl_held.load(Ordering::SeqCst);
                                let alt_ok = !need_alt || alt_held.load(Ordering::SeqCst);
                                let shift_ok = !need_shift || shift_held.load(Ordering::SeqCst);

                                if ctrl_ok && alt_ok && shift_ok {
                                    let step = {
                                        let state = app_handle.state::<BrightnessStep>();
                                        let value = *state.0.lock().unwrap();
                                        value
                                    };
                                    let delta: i32 = if *delta_y > 0 { step } else { -step };
                                    // TEMPORÁRIO - log de diagnóstico.
                                    eprintln!("[diagnóstico] scroll - passo lido: {step}, delta enviado: {delta}");
                                    let _ = brightness_tx.send(delta);
                                    // Engole o evento: a rolagem não chega
                                    // no app por trás, porque virou "ajustar
                                    // brilho" em vez de "rolar a página".
                                    return None;
                                }
                            }
                            _ => {}
                        }
                        // Qualquer evento que não seja um scroll-de-brilho
                        // (incluindo os próprios Ctrl/Alt/Shift, e qualquer
                        // scroll sem os modificadores certos) passa direto,
                        // sem interferir no resto do sistema.
                        Some(event)
                    });
                    if let Err(err) = result {
                        eprintln!("Erro no listener global de teclado/mouse: {:?}", err);
                    }
                });
            }

            // --- Menu do ícone da bandeja (clique direito) -----------------
            let abrir = MenuItem::with_id(app, "abrir", "Abrir", true, None::<&str>)?;
            let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Controle de Brilho")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "abrir" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "sair" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Clique simples no ícone também reabre a janela.
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Fechar a janela (X do Windows, Alt+F4) não encerra o processo -
            // só esconde, igual o botão da nossa titlebar customizada.
            // Isso é o que faz o app "continuar rodando em segundo plano".
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao rodar a aplicação");
}
