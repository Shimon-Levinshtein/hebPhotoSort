const DuplicatesView = ({
  groups,
  selectedPaths,
  onToggle,
  onSelectGroup,
  relative,
  showPreview = false,
  apiBase = 'http://localhost:4000',
}) => {
  if (!groups?.length) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
        טרם נסרק או לא נמצאו כפילויות
      </div>
    )
  }

  return (
    <div className="space-y-3 max-h-80 overflow-auto pr-1">
      {groups.map((group) => {
        const allChecked = group.files.every((f) => selectedPaths.has(f.path))
        return (
          <div
            key={group.name}
            className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{group.name}</div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => onSelectGroup(group.files, e.target.checked)}
                />
                בחר קבוצה
              </label>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-slate-300">
              {group.files.map((file) => (
                <li key={file.path} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedPaths.has(file.path)}
                    onChange={() => onToggle(file.path)}
                  />
                  {showPreview && (
                    <img
                      src={`${apiBase}/api/file?path=${encodeURIComponent(file.path)}`}
                      alt={relative(file.path)}
                      className="h-12 w-12 rounded object-cover border border-slate-800"
                      loading="lazy"
                    />
                  )}
                  <span className="font-mono text-slate-200">{relative(file.path)}</span>
                  <span className="text-slate-500">({file.size} bytes)</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export default DuplicatesView

