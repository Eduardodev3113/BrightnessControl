"""
interface.py
=============
Interface gráfica do Controle de Brilho (CustomTkinter, tema escuro).

Comportamento:
- Fechar a janela (X) NÃO encerra o programa - ele apenas some da tela
  e continua rodando em segundo plano, escutando o ícone da bandeja.
- Clicar em "Abrir" no ícone da bandeja traz a janela de volta.
- "Sair" no menu da bandeja é a única forma de encerrar de verdade.
"""

import customtkinter as ctk
from brilho import ControladorBrilho
from bandeja import IconeBandeja

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")


class App(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Controle de Brilho")
        self.geometry("340x240")
        self.resizable(False, False)

        self.controlador: ControladorBrilho | None = None
        self.erro_inicial: str | None = None
        try:
            self.controlador = ControladorBrilho()
        except RuntimeError as erro:
            self.erro_inicial = str(erro)

        self._montar_widgets()

        # Fechar a janela apenas esconde - o processo continua rodando.
        self.protocol("WM_DELETE_WINDOW", self.esconder)

        self.bandeja = IconeBandeja(ao_abrir=self.mostrar, ao_sair=self._sair_de_vez)
        self.bandeja.iniciar()

    # ------------------------------------------------------------------ #
    # Construção da interface
    # ------------------------------------------------------------------ #
    def _montar_widgets(self):
        ctk.CTkLabel(
            self, text="Brilho do Monitor", font=("Segoe UI", 18, "bold")
        ).pack(pady=(22, 6))

        if self.controlador is None:
            ctk.CTkLabel(
                self,
                text=f"⚠ {self.erro_inicial}",
                text_color="#e0a030",
                wraplength=280,
                justify="left",
            ).pack(pady=15, padx=20)
            return

        brilho_atual = self.controlador.obter_brilho()

        self.valor_label = ctk.CTkLabel(
            self, text=f"{brilho_atual}%", font=("Segoe UI", 26, "bold")
        )
        self.valor_label.pack(pady=4)

        self.slider = ctk.CTkSlider(self, from_=0, to=100, command=self._on_slider)
        self.slider.set(brilho_atual)
        self.slider.pack(pady=12, padx=35, fill="x")

        monitores = self.controlador.listar_monitores()
        nome_monitor = monitores[0] if monitores else "Monitor"
        ctk.CTkLabel(
            self, text=nome_monitor, font=("Segoe UI", 11), text_color="gray"
        ).pack()

        ctk.CTkLabel(
            self,
            text="Fechar esta janela mantém o programa\nrodando em segundo plano.",
            font=("Segoe UI", 10),
            text_color="gray",
            justify="center",
        ).pack(pady=(18, 0))

    # ------------------------------------------------------------------ #
    # Ações
    # ------------------------------------------------------------------ #
    def _on_slider(self, valor):
        valor = int(valor)
        self.valor_label.configure(text=f"{valor}%")
        self.controlador.definir_brilho(valor)
        self.bandeja.atualizar_icone(valor)

    def esconder(self):
        self.withdraw()

    def mostrar(self):
        self.after(0, self.deiconify)
        self.after(0, self.lift)

    def _sair_de_vez(self):
        self.destroy()


if __name__ == "__main__":
    app = App()
    app.mainloop()
