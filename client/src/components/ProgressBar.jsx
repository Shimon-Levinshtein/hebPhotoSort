const ProgressBar = ({ current = 0, total = 0, active = 0 }) => {
  const percent = total ? Math.min(100, Math.round((current / total) * 100)) : 0
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between text-sm text-slate-300">
        <span>התקדמות מיון</span>
        <span>
          {current}/{total} ({percent}%)
          {active > 0 && (
            <span className="ml-2 text-emerald-300">
              • {active} במקביל
            </span>
          )}
        </span>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-500 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export default ProgressBar

