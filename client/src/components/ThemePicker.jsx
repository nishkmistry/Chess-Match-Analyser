import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useTheme } from '../ThemeContext';

function BoardSwatch({ board }) {
  return (
    <span className="grid size-4 shrink-0 grid-cols-2 border border-black/15">
      <span style={{ background: board.light }} />
      <span style={{ background: board.dark }} />
      <span style={{ background: board.dark }} />
      <span style={{ background: board.light }} />
    </span>
  );
}

export default function ThemePicker() {
  const { theme, pickTheme, clearPreference, isUserSet, THEMES } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-2 py-1 text-sm text-muted transition hover:text-ink cursor-pointer"
      >
        <BoardSwatch board={theme.board} />
        <span><span className="hidden sm:inline">Board: </span><span className="text-ink">{theme.label}</span></span>
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-52 rounded-[3px] border border-rule bg-paper py-1.5 text-sm shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)]">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { pickTheme(t.id); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-ink transition hover:bg-wash cursor-pointer"
            >
              <BoardSwatch board={t.board} />
              <span className="flex-1">{t.label}</span>
              <span className="text-xs text-muted">{t.mode}</span>
              {t.id === theme.id && isUserSet ? <Check size={14} className="text-accent" /> : <span className="w-3.5" />}
            </button>
          ))}
          <div className="mx-3 my-1.5 border-t border-rule" />
          <button
            type="button"
            onClick={() => { clearPreference(); setOpen(false); }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-muted transition hover:bg-wash hover:text-ink cursor-pointer"
          >
            <span className="flex-1">Surprise me each visit</span>
            {!isUserSet ? <Check size={14} className="text-accent" /> : <span className="w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
