import { useState, type KeyboardEvent } from "react";
import "./PresetChips.css";

export interface Preset {
  id: string;
  label: string;
  value: number;
}

export const DEFAULT_PRESETS: Preset[] = [
  { id: "dia", label: "Dia", value: 100 },
  { id: "noite", label: "Noite", value: 25 },
  { id: "cinema", label: "Cinema", value: 10 },
  { id: "jogo", label: "Jogo", value: 70 },
];

interface Props {
  presets: Preset[];
  activeValue: number;
  onSelect: (value: number) => void;
  onAddProfile: (label: string) => void;
  onDeleteProfile: (id: string) => void;
  onRenameProfile: (id: string, label: string) => void;
}

export default function PresetChips({
  presets,
  activeValue,
  onSelect,
  onAddProfile,
  onDeleteProfile,
  onRenameProfile,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  // Preset que está sendo renomeado agora (ou null). Guardamos o rascunho
  // do nome separado do preset original até confirmar, pra poder cancelar
  // com Esc sem alterar nada.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const confirmAdding = () => {
    const trimmed = name.trim();
    if (trimmed) onAddProfile(trimmed);
    setAdding(false);
    setName("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") confirmAdding();
    if (e.key === "Escape") {
      setAdding(false);
      setName("");
    }
  };

  const startRenaming = (preset: Preset) => {
    setRenamingId(preset.id);
    setRenameDraft(preset.label);
  };

  const confirmRename = () => {
    const trimmed = renameDraft.trim();
    if (renamingId && trimmed) onRenameProfile(renamingId, trimmed);
    setRenamingId(null);
    setRenameDraft("");
  };

  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") confirmRename();
    if (e.key === "Escape") {
      setRenamingId(null);
      setRenameDraft("");
    }
  };

  return (
    <div className="presets" role="group" aria-label="Perfis de brilho">
      {presets.map((preset) => {
        const isCustom = preset.id.startsWith("custom-");

        if (renamingId === preset.id) {
          return (
            <input
              key={preset.id}
              autoFocus
              className="preset-add-input"
              value={renameDraft}
              maxLength={16}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={confirmRename}
              onFocus={(e) => e.target.select()}
            />
          );
        }

        return (
          <div key={preset.id} className="preset-chip-wrap">
            <button
              className={`preset-chip ${isCustom ? "preset-chip--custom" : ""} ${
                activeValue === preset.value ? "preset-chip--active" : ""
              }`}
              onClick={() => onSelect(preset.value)}
              onDoubleClick={() => startRenaming(preset)}
              title="Duplo clique para renomear"
            >
              {preset.label}
            </button>
            <button
              className="preset-chip__remove"
              aria-label={`Remover perfil ${preset.label}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteProfile(preset.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}

      {adding ? (
        <input
          autoFocus
          className="preset-add-input"
          placeholder="Nome do perfil"
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={confirmAdding}
        />
      ) : (
        <button
          className="preset-chip preset-chip--add"
          onClick={() => {
            setAdding(true);
            setName("");
          }}
          aria-label="Salvar o brilho atual como um novo perfil"
          title="Salva o brilho atual como um novo perfil"
        >
          +
        </button>
      )}
    </div>
  );
}
