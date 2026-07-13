// Em builds de release, esconde o console preto do Windows por trás do app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod brightness;

use brightness::{get_brightness, list_monitors, set_brightness, MonitorState};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(MonitorState::new())
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            get_brightness,
            set_brightness
        ])
        .setup(|app| {
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
