'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
    >
      Exporter PDF
    </button>
  )
}
