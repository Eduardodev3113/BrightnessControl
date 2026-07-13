use ddc_hi::{Ddc, Display};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
}

#[tauri::command]
pub fn list_monitors() -> Vec<MonitorInfo> {
    Display::enumerate()
        .into_iter()
        .enumerate()
        .map(|(i, display)| {
            let name = display
                .info
                .model_name
                .clone()
                .unwrap_or_else(|| format!("Monitor {}", i + 1));
            MonitorInfo { index: i, name }
        })
        .collect()
}

#[tauri::command]
pub fn get_brightness(index: usize) -> Result<u16, String> {
    let mut displays = Display::enumerate();
    let display = displays
        .get_mut(index)
        .ok_or_else(|| "Monitor não encontrado".to_string())?;

    display
        .handle
        .get_vcp_feature(0x10)
        .map(|v| v.value())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_brightness(index: usize, value: u16) -> Result<(), String> {
    let mut displays = Display::enumerate();
    let display = displays
        .get_mut(index)
        .ok_or_else(|| "Monitor não encontrado".to_string())?;

    display
        .handle
        .set_vcp_feature(0x10, value)
        .map_err(|e| e.to_string())
}

/// Lê o brilho atual do monitor, soma `delta` (pode ser negativo), limita
/// entre 0-100 e escreve o novo valor de volta. Usado pelo atalho global
/// (Ctrl+Alt+Seta), que não tem o valor atual vindo do frontend.
pub fn adjust_brightness(index: usize, delta: i32) -> Result<u16, String> {
    let current = get_brightness(index)?;
    let new_value = (current as i32 + delta).clamp(0, 100) as u16;
    set_brightness(index, new_value)?;
    Ok(new_value)
}