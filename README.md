# Mementos 📸

Un solo rollo de fotos para toda la fiesta. Cada invitado entra con un link o un QR y saca fotos desde su teléfono. Los disparos son compartidos y limitados. Cada foto se saca una sola vez: no se repite y no se borra.

Durante toda la fiesta se puede votar cuál es la mejor y cuál la peor, y marcar "quiero esta". Cuando se terminan los disparos (o cuando quien organiza lo decide), arranca una votación final con tiempo. Al cerrarse el álbum, se arma una carpeta en Google Drive y cada invitado recibe un mail con sus fotos.

- **Frontend:** React + Vite. Es una PWA, así que se instala desde el navegador en iOS y Android. Se publica en GitHub Pages.
- **Backend:** Supabase. Guarda la base de datos y las fotos, maneja las sesiones anónimas y avisa los cambios en tiempo real.
- **Entrega:** un Google Apps Script que corre en tu propia cuenta de Google.

Todo se configura **desde el navegador**. No hace falta computadora.

---

## Paso 1 · Supabase (5 min)

1. Entrá a [supabase.com](https://supabase.com) → **New project**. Elegí la región São Paulo, que es la más cercana.
2. **SQL Editor** → **New query** → pegá todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Authentication** → **Sign In / Providers** → activá **Allow anonymous sign-ins**. Esto permite que los invitados entren sin crear cuenta.
4. **Project Settings** → **API**. Copiá dos datos:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon / publishable key**

> La anon key es pública por diseño. La seguridad la dan las reglas del SQL: nadie puede borrar fotos, reemplazarlas, ni ver los votos de otros.

## Paso 2 · GitHub Pages

1. En el repo: **Settings** → **Pages** → en **Source** elegí **GitHub Actions**.
2. **Settings** → **Secrets and variables** → **Actions** → pestaña **Variables** → **New repository variable**. Cargá estas dos:
   - `VITE_SUPABASE_URL` → la Project URL
   - `VITE_SUPABASE_ANON_KEY` → la anon key
3. **Actions** → **Publicar en GitHub Pages** → **Run workflow**. En unos 2 minutos queda online en:
   `https://<tu-usuario>.github.io/<nombre-del-repo>/`

Cada push a `main` vuelve a publicar la app sola.

## Paso 3 · Probarla en el celu

Abrí el link en el celu y tocá **Crear un evento**. Para probar con alguien más, compartile el link o el QR desde la pestaña **Panel**.

**Instalarla como app:**
- **iPhone/iPad:** en Safari → botón Compartir → **Agregar a inicio**.
- **Android:** en Chrome → menú ⋮ → **Instalar app**.

> En iOS, la app instalada no comparte datos con Safari. La primera vez que la abras desde el ícono, entrá con el código del evento (está en el encabezado).

## Paso 4 · Entrega por Google Drive

1. Entrá a [script.google.com](https://script.google.com) → **Nuevo proyecto**. Pegá el contenido de [`drive/Code.gs`](drive/Code.gs).
2. Andá a ⚙️ **Configuración del proyecto** → **Propiedades del script**. Agregá dos propiedades:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Tocá **Implementar** → **Nueva implementación** → tipo **Aplicación web**. Configurala así:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**

   Autorizá los permisos de Drive y Gmail. Google va a mostrar el aviso "app no verificada": entrá en **Configuración avanzada** → **Ir a…**.
4. Copiá la URL que termina en `/exec`. Cargala en GitHub como la variable `VITE_DRIVE_SCRIPT_URL` y volvé a correr el workflow.

> En el iPad, script.google.com anda mejor con "Solicitar sitio de escritorio" (botón **aA** en Safari).

Cuando el álbum se cierra, en **Panel** aparece **Enviar álbum por Drive**. Al tocarlo, el script hace esto:
- Crea la carpeta `Mementos · <evento> · <fecha>` con todas las fotos y una subcarpeta `★ Las más votadas`.
- La deja visible para cualquiera que tenga el link.
- Le manda a cada invitado un mail personalizado con el link al álbum completo. Le adjunta sus "quiero esta" y las 3 más votadas.

**Límites de Gmail gratis:** unos 100 mails por día desde Apps Script. Si un mail no sale, el resto del proceso sigue igual.

---

## Cómo funciona por dentro

| Regla | Dónde se garantiza |
|---|---|
| Los disparos son compartidos y no se pasan del total | `take_shot()` bloquea la fila del evento y cuenta de forma atómica |
| Una oportunidad por foto, sin repetir | El disparo se gasta al reservarlo. La app solo usa la cámara, no la galería |
| Las fotos no se borran ni se reemplazan | Storage solo permite subir al path reservado, una vez. No hay permisos de borrado |
| Se vota durante toda la fiesta | `vote()` funciona hasta que el álbum se cierra. No se pueden votar las fotos propias |
| La votación final tiene tiempo | Al agotarse el rollo (o con **Terminar fotos**) arranca la cuenta regresiva. Desde **Panel** se puede sumar +15 min o cerrar ya |
| Si se corta la señal, la foto no se pierde | La foto queda guardada en el teléfono y se sube sola cuando vuelve la conexión |

## Más adelante: App Store / Play Store

La misma app se puede envolver con [Capacitor](https://capacitorjs.com) para generar builds nativos. Para compilar sin computadora se usa un servicio de build en la nube, como Ionic Appflow o Codemagic. Para publicar en iOS hace falta la cuenta de Apple Developer (USD 99 por año).
