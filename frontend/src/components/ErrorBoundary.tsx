import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onReset?: () => void
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  handleReload = () => {
    const { onReset } = this.props
    if (onReset) {
      this.setState({ error: null })
      onReset()
    } else {
      window.location.reload()
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-2xl font-bold text-amber-400">
            !
          </div>
          <h1 className="mb-2 text-lg font-semibold text-white">Algo salió mal</h1>
          <p className="mb-6 text-sm text-slate-400">
            Ocurrió un error inesperado al cargar esta sección. Recarga la página para continuar.
          </p>
          <button
            onClick={this.handleReload}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            Recargar página
          </button>
          {error.message && (
            <p className="mt-6 break-words text-left font-mono text-xs text-slate-500">
              {error.message}
            </p>
          )}
        </div>
      </div>
    )
  }
}