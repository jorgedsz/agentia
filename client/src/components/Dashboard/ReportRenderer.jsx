import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#14b8a6', '#eab308']

function ChartBlock({ spec }) {
  if (!spec || !Array.isArray(spec.data) || spec.data.length === 0) {
    return (
      <div className="my-4 px-4 py-3 rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-800">
        Chart could not be rendered (missing or empty data).
      </div>
    )
  }

  const title = spec.title

  if (spec.type === 'bar') {
    return (
      <figure className="my-6">
        {title && <figcaption className="text-sm font-semibold text-gray-700 mb-2 text-center">{title}</figcaption>}
        <div className="w-full" style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={spec.data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey={spec.xKey || 'name'} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey={spec.yKey || 'value'} fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    )
  }

  if (spec.type === 'line') {
    return (
      <figure className="my-6">
        {title && <figcaption className="text-sm font-semibold text-gray-700 mb-2 text-center">{title}</figcaption>}
        <div className="w-full" style={{ height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={spec.data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey={spec.xKey || 'name'} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey={spec.yKey || 'value'} stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    )
  }

  if (spec.type === 'pie') {
    const nameKey = spec.nameKey || 'name'
    const valueKey = spec.valueKey || 'value'
    return (
      <figure className="my-6">
        {title && <figcaption className="text-sm font-semibold text-gray-700 mb-2 text-center">{title}</figcaption>}
        <div className="w-full" style={{ height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={spec.data} dataKey={valueKey} nameKey={nameKey} outerRadius={100} label>
                {spec.data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </figure>
    )
  }

  return (
    <div className="my-4 px-4 py-3 rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-800">
      Unsupported chart type: {String(spec.type)}
    </div>
  )
}

const components = {
  code({ inline, className, children, ...props }) {
    const lang = /language-(\w+)/.exec(className || '')?.[1]
    if (!inline && lang === 'chart') {
      const raw = String(children).trim()
      let spec = null
      try {
        spec = JSON.parse(raw)
      } catch {
        return (
          <div className="my-4 px-4 py-3 rounded-lg border border-red-300 bg-red-50 text-xs text-red-800">
            Chart JSON could not be parsed. Showing raw block instead:
            <pre className="mt-2 whitespace-pre-wrap font-mono">{raw}</pre>
          </div>
        )
      }
      return <ChartBlock spec={spec} />
    }
    if (inline) {
      return <code className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 font-mono text-[0.85em]" {...props}>{children}</code>
    }
    return (
      <pre className="my-4 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 overflow-x-auto text-sm">
        <code className={className} {...props}>{children}</code>
      </pre>
    )
  },
  h1: ({ node, ...props }) => <h1 className="text-3xl font-bold text-gray-900 mt-2 mb-4 leading-tight" {...props} />,
  h2: ({ node, ...props }) => <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-3 pb-2 border-b border-gray-200" {...props} />,
  h3: ({ node, ...props }) => <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-2" {...props} />,
  h4: ({ node, ...props }) => <h4 className="text-base font-semibold text-gray-900 mt-4 mb-1" {...props} />,
  p:  ({ node, ...props }) => <p className="text-gray-800 leading-7 my-3" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc pl-6 my-3 space-y-1 text-gray-800" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal pl-6 my-3 space-y-1 text-gray-800" {...props} />,
  li: ({ node, ...props }) => <li className="leading-7" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-gray-900" {...props} />,
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="my-4 pl-4 border-l-4 border-primary-300 text-gray-700 italic" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="my-5 overflow-x-auto">
      <table className="min-w-full border border-gray-200 text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-gray-50" {...props} />,
  tr:    ({ node, ...props }) => <tr className="border-b border-gray-100" {...props} />,
  th:    ({ node, ...props }) => <th className="px-3 py-2 text-left font-semibold text-gray-700 border-r border-gray-200 last:border-r-0" {...props} />,
  td:    ({ node, ...props }) => <td className="px-3 py-2 text-gray-800 border-r border-gray-100 last:border-r-0 align-top" {...props} />,
  hr:    () => <hr className="my-6 border-t border-gray-200" />,
  a:     ({ node, ...props }) => <a className="text-primary-600 underline" target="_blank" rel="noreferrer" {...props} />
}

export default function ReportRenderer({ markdown }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {markdown || ''}
    </ReactMarkdown>
  )
}
