export const SetupNotice = () => (
  <main className="screen center">
    <div className="stack narrow">
      <h1 className="display">Mementos</h1>
      <p className="muted">
        Falta conectar Supabase. Cargá los secretos <code>SUPABASE_URL</code> y <code>SUPABASE_PUBLISHABLE_KEY</code> en
        GitHub (Settings → Secrets and variables → Actions) y volvé a correr el deploy.
      </p>
    </div>
  </main>
)
