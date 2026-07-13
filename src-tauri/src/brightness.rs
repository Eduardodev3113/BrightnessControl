//! Controle real de brilho do monitor via protocolo DDC/CI, usando a
//! crate `ddc-hi` (mesma ideia da lib `monitorcontrol` que usávamos em
//! Python, só que compilada direto no binário final, sem depender de
//! Python instalado na máquina do usuário).
//!
//! NOTA: a API exata da crate `ddc-hi` pode variar um pouco entre
//! versões (é uma crate pequena, ainda em 0.x). Se algo aqui não bater
//! com a versão que o `cargo` baixar, olhe a documentação em
//! https://docs.rs/ddc-hi para ajustar os nomes dos métodos - a lógica
//! geral (enumerar monitores, ler/escrever o VCP feature 0x10) continua
//! sendo essa.

use ddc_hi::{Ddc, Display};
use serde::Serialize;
use std::sync::Mutex;

/// Feature VCP padrão MCCS para "luminance" (brilho), de 0 a 100.
const VCP_LUMINANCE: u8 = 0x10;

/// Estado compartilhado da aplicação: guarda os monitores já detectados
/// pra não precisar re-enumerar o barramento a cada clique.
pub struct MonitorState {
    displays: Mutex<Vec<Display>>,
}

impl MonitorState {
    pub fn new() -> Self {
        let mut displays = Display::enumerate();
        for display in &mut displays {
            // Lê as capacidades (nome/modelo) de cada monitor uma vez.
            let _ = display.update_capabilities();
        }
        Self {
            displays: Mutex::new(displays),
        }
    }
}

#[derive(Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
}

#[tauri::command]
pub fn list_monitors(state: tauri::State<MonitorState>) -> Vec<MonitorInfo> {
    let displays = state.displays.lock().unwrap();
    displays
        .iter()
        .enumerate()
        .map(|(index, display)| MonitorInfo {
            index,
            name: display
                .info
                .model_name
                .clone()
                .unwrap_or_else(|| format!("Monitor {}", index + 1)),
        })
        .collect()
}

#[tauri::command]
pub fn get_brightness(state: tauri::State<MonitorState>, index: usize) -> Result<u16, String> {
    let mut displays = state.displays.lock().unwrap();
    let display = displays
        .get_mut(index)
        .ok_or_else(|| "Monitor não encontrado".to_string())?;

    display
        .handle
        .get_vcp_feature(VCP_LUMINANCE)
        .map(|vcp| vcp.value())
        .map_err(|e| format!("Falha ao ler o brilho: {e}"))
}

#[tauri::command]
pub fn set_brightness(
    state: tauri::State<MonitorState>,
    index: usize,
    value: u16,
) -> Result<(), String> {
    let value = value.min(100);
    let mut displays = state.displays.lock().unwrap();
    let display = displays
        .get_mut(index)
        .ok_or_else(|| "Monitor não encontrado".to_string())?;

    display
        .handle
        .set_vcp_feature(VCP_LUMINANCE, value)
        .map_err(|e| format!("Falha ao ajustar o brilho: {e}"))
}
