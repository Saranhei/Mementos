export const SetupNotice = () => (
  <main className="screen center">
    <div className="stack narrow">
      <h1 className="display">Mementos</h1>
      <p className="muted">
        Falta conectar Supabase. Cargá las variables <code>VITE_SUPABASE_URL</code> y{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> en GitHub (el archivo .env.production) y
        volvé a correr el deploy. Los pasos están en el README.
      </p>
    </div>
  </main>
)
