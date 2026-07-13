# Controle de Brilho

Aplicação desktop para controlar o brilho **real** do monitor (via DDC/CI),
com interface gráfica moderna e execução em segundo plano.

---

## Funcionalidades

- Ajuste do brilho real do monitor (0-100%) via slider
- Controle direto por DDC/CI - o mesmo protocolo usado pelos botões
  físicos do monitor e pelo software dos fabricantes
- Suporte a múltiplos monitores
- Fica rodando em segundo plano ao fechar a janela (como o Discord)
- Ícone na bandeja do sistema para reabrir ou encerrar de vez
- Interface com tema escuro (CustomTkinter)

---

## Estrutura do Projeto

```
├── brilho.py         # Lógica de controle de brilho (DDC/CI)
├── bandeja.py         # Ícone na bandeja do sistema (segundo plano)
├── interface.py        # Interface gráfica (CustomTkinter)
├── requirements.txt
├── instalar.bat        # Instala tudo automaticamente (1 clique)
└── README.md
```

---

## Requisitos

- Python 3.10+
- Windows (usa WMI para falar com o monitor via DDC/CI)
- Monitor conectado via **HDMI ou DisplayPort** com DDC/CI habilitado
  no menu OSD do monitor (verifique nas configurações do próprio monitor,
  geralmente em "Menu > Sistema/OSD > DDC/CI")

---

## Instalação

**1. Dê dois cliques em `instalar.bat`**

Ele verifica se você tem Python instalado e baixa automaticamente todas
as bibliotecas necessárias. Se aparecer aviso do Windows Defender/SmartScreen
("Windows protegeu seu PC"), clique em "Mais informações" > "Executar assim mesmo"
(isso acontece porque o arquivo não é assinado digitalmente, é normal para
scripts pessoais).

**2. Rode com:**

```
python interface.py
```

---

## Como usar

1. Abra o programa - ele detecta automaticamente o(s) monitor(es) conectado(s)
2. Arraste o slider para ajustar o brilho em tempo real
3. Feche a janela (X) normalmente - o programa continua rodando na bandeja
4. Clique no ícone na bandeja (perto do relógio do Windows) para reabrir
5. Clique com o botão direito no ícone > **Sair** para encerrar de vez

---

## Tecnologias

| Tecnologia      | Uso                                            |
|-----------------|-------------------------------------------------|
| monitorcontrol  | Controle real do brilho via DDC/CI              |
| customtkinter   | Interface gráfica com tema escuro               |
| pystray         | Ícone e menu na bandeja do sistema              |
| Pillow          | Geração do ícone da bandeja                     |

---

## Observações

- Se o programa não detectar nenhum monitor, verifique se o DDC/CI está
  habilitado no menu do monitor e se o cabo é HDMI ou DisplayPort
  (cabo VGA geralmente não suporta DDC/CI).
- Notebooks controlam o brilho da tela interna de outra forma (WMI de
  brilho de tela, não DDC/CI) - esse projeto foi feito para monitor externo.
