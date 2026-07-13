"""
bandeja.py
===========
Ícone na bandeja do sistema (system tray), igual o Discord: quando você
fecha a janela principal, o programa não fecha de verdade - ele some da
tela mas continua rodando, e fica esperando na bandeja perto do relógio
do Windows até você clicar de novo para reabrir.
"""

import threading
from PIL import Image, ImageDraw
import pystray


def _criar_imagem_icone(brilho: int = 100) -> Image.Image:
    """Gera um ícone simples (sol) refletindo o nível de brilho atual."""
    tamanho = 64
    img = Image.new("RGBA", (tamanho, tamanho), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Quanto maior o brilho, mais "aceso" (amarelo) o ícone fica.
    intensidade = int(80 + (175 * brilho / 100))
    cor = (intensidade, intensidade, 0, 255)

    draw.ellipse((10, 10, tamanho - 10, tamanho - 10), fill=cor)
    return img


class IconeBandeja:
    """Encapsula o ícone da bandeja e seu menu (Abrir / Sair)."""

    def __init__(self, ao_abrir, ao_sair):
        self.ao_abrir = ao_abrir
        self.ao_sair = ao_sair
        self.icone = pystray.Icon(
            name="controle_de_brilho",
            icon=_criar_imagem_icone(),
            title="Controle de Brilho",
            menu=pystray.Menu(
                pystray.MenuItem("Abrir", self._abrir, default=True),
                pystray.MenuItem("Sair", self._sair),
            ),
        )

    def _abrir(self, icon, item):
        self.ao_abrir()

    def _sair(self, icon, item):
        self.icone.stop()
        self.ao_sair()

    def atualizar_icone(self, brilho: int) -> None:
        """Atualiza a corzinha do ícone para refletir o brilho atual."""
        self.icone.icon = _criar_imagem_icone(brilho)

    def iniciar(self) -> None:
        """Roda o ícone da bandeja numa thread separada (não trava a interface)."""
        threading.Thread(target=self.icone.run, daemon=True).start()

    def parar(self) -> None:
        self.icone.stop()
