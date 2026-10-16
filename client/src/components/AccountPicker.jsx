export default function AccountPicker({ accounts, value, onChange }) {
  if (accounts.length < 2) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-full cursor-pointer border-0 border-b border-rule bg-transparent py-1 pr-6 text-sm text-ink outline-none focus:border-ink"
      aria-label="Whose games"
    >
      {accounts.map((a) => <option key={a.key} value={a.key}>{a.label} · {a.games} games</option>)}
      <option value="all">All accounts together</option>
    </select>
  );
}
