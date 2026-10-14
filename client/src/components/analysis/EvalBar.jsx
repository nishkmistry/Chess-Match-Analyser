import { formatEval, winChances } from '../../lib/evaluation';

export default function EvalBar({ score, orientation }) {
  const whitePct = 50 + 50 * winChances(score);
  const whiteOnBottom = orientation === 'white';

  return (
    <div
      className="relative w-3 shrink-0 overflow-hidden bg-[#3a3633] sm:w-3.5"
      role="meter"
      aria-label="Engine evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(whitePct)}
      aria-valuetext={formatEval(score)}
      title={formatEval(score)}
    >
      <div
        className={`absolute inset-x-0 bg-[#f4f2ee] transition-[height] duration-500 ease-out ${whiteOnBottom ? 'bottom-0' : 'top-0'}`}
        style={{ height: `${whitePct}%` }}
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-[#c2410c]/70" />
    </div>
  );
}
