import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SelectOption } from "../types/ui.js";
import { Icon } from "./Icon.js";

export function DropdownSelect({ value, options, onChange, compact }: { value: string; options: SelectOption[]; onChange: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointer);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointer);
    };
  }, [open]);

  return (
    <div className={`rs-select ${compact ? "compact" : ""}`} ref={rootRef}>
      <button type="button" className="rs-select-trigger" onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label ?? ""}</span>
        <Icon name="chevron" />
      </button>
      {open && menuStyle ? createPortal(
        <div className="rs-select-menu" style={{ top: `${menuStyle.top}px`, left: `${menuStyle.left}px`, width: `${menuStyle.width}px` }}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rs-select-item ${option.value === value ? "active" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Icon name="check" /> : null}
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
