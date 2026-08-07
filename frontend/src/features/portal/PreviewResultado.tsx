export default function PreviewResultado({
  valores,
  resumen,
}: {
  valores: Record<string, unknown> | null
  resumen: string
}) {
  if (valores && Object.keys(valores).length) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(valores)
              .filter(([, val]) => val !== null && val !== undefined && val !== '')
              .map(([k, val]) => (
                <tr key={k} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-600">
                    {k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{String(val)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    )
  }
  return <p className="text-sm text-slate-500">{resumen}</p>
}