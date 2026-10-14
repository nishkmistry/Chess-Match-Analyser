import { useTheme } from '../ThemeContext';

export default function ThemePicker() {
  const { theme, pickTheme, clearPreference, isUserSet, THEMES } = useTheme();

  return (
    <div className="flex items-center gap-2">
      {THEMES.map(t => (
        <button
          key={t.id}
          onClick={() => pickTheme(t.id)}
          title={t.label}
          className={`w-6 h-6 rounded-full border-2 transition cursor-pointer
            ${theme.id === t.id ? 'border-slate-600 scale-125' : 'border-transparent hover:scale-110'}`}
          style={{ background: `linear-gradient(135deg, ${t.board.light} 50%, ${t.board.dark} 50%)` }}
        />
      ))}
      {isUserSet && (
        <button
          onClick={clearPreference}
          title="Random theme each session"
          className="text-xs text-slate-400 hover:text-slate-600 transition px-1 cursor-pointer"
        >
          🎲
        </button>
      )}
    </div>
  );
}
