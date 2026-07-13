# Controle de Brilho

App desktop pra controlar o brilho **real** do monitor externo via DDC/CI,
com interface em React (visual estilo app comercial) e backend em Rust
via Tauri — compila num `.exe` pequeno, sem precisar de Python nem de
nenhum runtime extra na máquina final.

---

## Estrutura do projeto

```
├── src/                          # Frontend (React + TypeScript)
│   ├── main.tsx                   # Ponto de entrada do React
│   ├── App.tsx                    # Componente raiz / estado da aplicação
│   ├── App.css
│   ├── settings.ts                 # Tipos/persistência de settings + gravação de atalho
│   ├── components/
│   │   ├── TitleBar.tsx            # Barra de título customizada (arrastar/fechar)
│   │   ├── BrightnessDial.tsx      # Dial circular de brilho (drag + teclado)
│   │   ├── BrightnessOsd.tsx       # Popup "estilo volume do Windows" ao mudar o brilho
│   │   ├── PresetChips.tsx         # Presets (Dia/Noite/Cinema/Jogo + presets custom)
│   │   ├── MonitorSelect.tsx       # Seletor de monitor (se houver mais de um)
│   │   └── Settings.tsx            # Tela de configurações (atalhos, autostart, backup...)
│   └── styles/index.css            # Tokens de cor/tipografia
│
├── src-tauri/                    # Backend (Rust)
│   ├── src/
│   │   ├── main.rs                 # Janela, bandeja do sistema, atalhos globais, comandos
│   │   └── brightness.rs           # Comandos de brilho via DDC/CI (ddc-hi)
│   ├── capabilities/default.json   # Permissões da janela (Tauri v2)
│   ├── icons/                      # Ícones do app/instalador
│   ├── Cargo.toml
│   └── tauri.conf.json             # Configuração da janela/bundle
│
├── prototipo-python-antigo/      # Protótipo antigo em Python (não usado mais no app final)
├── package.json
├── vite.config.ts
└── index.html
```

---

## Requisitos pra rodar/compilar

1. **Node.js** 
2. **Rust** — instale em https://rustup.rs (é o `rustup-init.exe` pro Windows).
3. **Tauri CLI**
4. **WebView2** — já vem pré-instalado no Windows 10/11

---

## Como rodar em desenvolvimento

```bash
npm install
npm run tauri dev
```

Isso abre a janela do app com hot-reload: qualquer mudança no React
atualiza a interface na hora, sem precisar recompilar o Rust.

---

## Como gerar o `.exe` final

```bash
npm run tauri build
```

O instalador NSIS sai em:

```
src-tauri/target/release/bundle/nsis/Controle de Brilho_0.1.0_x64-setup.exe
```

Esse é o arquivo que você roda pra instalar o app (cria atalho no menu
iniciar, etc.) — quem for usar só baixa e instala, sem precisar de
Python, Node ou Rust na máquina dele.

Se preferir só o executável solto (sem instalador), ele fica em:

```
src-tauri/target/release/controle-de-brilho.exe
```

mas nesse caso é melhor não mover essa pasta depois de ativar o
autostart (ver abaixo), já que o Windows vai guardar o caminho exato
desse `.exe`.

### Iniciar automaticamente com o Windows

O app já vem com o plugin de autostart integrado — não precisa mexer
em nada manualmente:

1. Instale/abra o app normalmente.
2. Abra a tela de **Configurações** (ícone de engrenagem).
3. Ative o toggle **iniciar com o Windows**.

Isso registra o app pra abrir sozinho no login, direto pelo Windows
(sem precisar de atalho na pasta de Inicialização).

---

## Sobre os ícones

O projeto referencia ícones em `src-tauri/icons/` que ainda não existem
neste scaffold. Antes do primeiro `npm run tauri build`, gere eles a
partir de uma imagem quadrada (PNG, 1024x1024 de preferência):

```bash
npm run tauri icon caminho/para/sua-imagem.png
```

Isso cria automaticamente todos os tamanhos (`32x32.png`, `128x128.png`,
`icon.ico`, etc.) dentro de `src-tauri/icons/`.

---

## Sobre a crate `ddc-hi` (importante)

O arquivo `src-tauri/src/brightness.rs` usa a crate `ddc-hi` pra falar
com o monitor via DDC/CI. É uma crate pequena e ainda na versão `0.x`,
então a API pode ter pequenas diferenças entre versões. Eu não consegui
compilar/testar esse código aqui (ambiente sem Windows/monitor físico),
então é possível que, no seu primeiro `cargo build`, apareça algum erro
de nome de método. Se isso acontecer:

1. Rode `cargo doc --open -p ddc-hi` ou veja https://docs.rs/ddc-hi
2. Ajuste os nomes em `brightness.rs` (a lógica geral - enumerar
   monitores, ler/escrever o VCP feature `0x10` de luminância - continua
   sendo a mesma, só o nome exato do método pode mudar).

Me manda o erro exato do `cargo build` que eu te ajudo a corrigir.

---

## Requisito do próprio monitor

Só funciona se o monitor suportar DDC/CI e essa opção estiver habilitada
no menu OSD dele (às vezes vem desligada por padrão), conectado via
**HDMI ou DisplayPort** (VGA geralmente não suporta).

---

## Funcionalidades já incluídas

- Dial circular arrastável (mouse) e navegável (setas do teclado)
- Debounce de escrita no DDC/CI (não trava arrastando o dial)
- Presets: Dia, Noite, Cinema, Jogo — além de presets customizados
  (criar, renomear, remover), persistidos localmente
- Suporte a múltiplos monitores
- Atalho de teclado global (fora da janela, ex. `Ctrl+Alt+↑`/`↓`) pra
  ajustar o brilho mesmo com o app minimizado, configurável na tela de
  Configurações
- Mudar o brilho com a roda do mouse + modificadores configuráveis
  (Ctrl/Alt/Shift)
- Popup de OSD ao mudar o brilho (estilo o popup de volume do Windows),
  pode ser desativado
- Janela sem moldura nativa, com titlebar customizada, tema claro/escuro
- Fechar a janela esconde pro segundo plano (não encerra o processo)
- Ícone na bandeja do sistema com menu "Abrir" / "Sair"
- Autostart real com o Windows, ativável por um toggle na tela de
  Configurações (usa `tauri-plugin-autostart`)
- Exportar/importar backup das configurações e presets (arquivo salvo
  via diálogo nativo, `tauri-plugin-dialog`)
