"""
brilho.py
==========
Controle REAL do brilho do monitor usando o protocolo DDC/CI
(o mesmo protocolo que os botões físicos do monitor e os programas
dos fabricantes usam).

Depende da biblioteca "monitorcontrol", que fala diretamente com o
monitor através da placa de vídeo (Windows: via WMI).
"""

from monitorcontrol import get_monitors


class ControladorBrilho:
    """Gerencia o brilho de um ou mais monitores conectados ao PC."""

    def __init__(self):
        self.monitores = get_monitors()
        if not self.monitores:
            raise RuntimeError(
                "Nenhum monitor compatível com DDC/CI foi encontrado. "
                "Verifique se o DDC/CI está habilitado no menu do monitor "
                "e se ele está conectado via HDMI ou DisplayPort."
            )

    def listar_monitores(self) -> list[str]:
        """Retorna uma lista com o nome/modelo de cada monitor detectado."""
        nomes = []
        for i, monitor in enumerate(self.monitores):
            try:
                with monitor:
                    caps = monitor.get_vcp_capabilities()
                    nome = caps.get("model") or f"Monitor {i + 1}"
            except Exception:
                nome = f"Monitor {i + 1}"
            nomes.append(nome)
        return nomes

    def obter_brilho(self, indice: int = 0) -> int:
        """Lê o brilho atual (0-100) de um monitor específico."""
        with self.monitores[indice]:
            return self.monitores[indice].get_luminance()

    def definir_brilho(self, valor: int, indice: int | None = None) -> None:
        """
        Define o brilho (0-100).
        Se `indice` for None, aplica em TODOS os monitores conectados.
        """
        valor = max(0, min(100, int(valor)))
        alvo = self.monitores if indice is None else [self.monitores[indice]]
        for monitor in alvo:
            try:
                with monitor:
                    monitor.set_luminance(valor)
            except Exception as erro:
                # Alguns monitores demoram/falham ocasionalmente ao responder
                # via DDC/CI - não queremos derrubar o programa por isso.
                print(f"Aviso: não foi possível ajustar um dos monitores ({erro})")
