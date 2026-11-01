# Mementos 📸

Un solo rollo de fotos para toda la fiesta.

1. El anfitrión crea el evento y le queda un **QR fijo** que puede imprimir antes de la fiesta.
2. Los invitados lo escanean, ingresan con su mail (les llega un código) y ponen su nombre. Así el anfitrión sabe quién sacó cada foto.
3. Nadie puede disparar hasta que el anfitrión toca **Comenzar**.
4. Los disparos son compartidos y limitados. Cada foto se saca una sola vez: no se repite y no se borra. Durante toda la fiesta se vota la mejor y la peor, y cada invitado marca las que quiere con "quiero esta".
5. El anfitrión toca **Terminar fiesta**, o la fiesta termina sola a la hora que se haya programado. En ese momento arranca la votación final.
6. Cuando la votación se cierra, el álbum queda **en el cuarto oscuro**: los invitados no ven las fotos. El anfitrión lo edita (oculta fotos, elige una portada, escribe un mensaje) y lo envía.
7. Se arma una carpeta en Google Drive y a cada invitado le llega un mail con el álbum. Recién entonces los invitados pueden volver a ver las fotos en la app.

> El cobro se maneja desde la página web, no desde la app. La app solo maneja las sesiones y las fotos.

**Stack:** React + Vite (PWA en GitHub Pages) · Supabase (base de datos, login por mail, fotos privadas, tiempo real) · Google Apps Script (entrega por Drive y mail).

Todo se configura **desde el navegador**. No hace falta computadora.

---

## Paso 1 · Supabase

1. Entrá a [supabase.com](https://supabase.com) → **New project**. Elegí la región São Paulo.
2. **SQL Editor** → **New query** → pegá todo [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Authentication → Sign In / Providers → Email:** dejalo activado. Si existe la opción **Allow anonymous sign-ins**, tiene que quedar *apagada*.
4. **Authentication → URL Configuration:**
   - **Site URL:** `https://<tu-usuario>.github.io/<repo>/`
   - **Redirect URLs:** agregá `https://<tu-usuario>.github.io/<repo>/**`
5. **Authentication → Emails → Templates:** en **Magic Link** y en **Confirm signup**, pegá [`supabase/email-template.html`](supabase/email-template.html). Usá como asunto `Tu código para Mementos: {{ .Token }}`. Así el mail trae el código además del link.
6. **Authentication → Emails → SMTP Settings → activá un SMTP propio. Este paso es obligatorio.** El servidor de mail que trae Supabase solo manda mails a los miembros de tu equipo, así que sin SMTP propio los invitados no reciben el código. Opciones gratis que no piden dominio propio:
   - **Brevo:** unos 300 mails por día.
   - **Gmail:** con una contraseña de aplicación, unos 500 por día.

   Después, en **Rate Limits**, subí el límite de mails por hora. Si no, en una fiesta de 80 personas los códigos se traban.
7. **Project Settings → API:** copiá la **Project URL** y la **anon / publishable key**.

> La anon key es pública por diseño. La seguridad la dan las reglas del SQL. **Nunca** copies la `service_role` key a GitHub ni a la app.

## Paso 2 · GitHub Pages

1. **Settings → Pages → Source:** elegí **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables:** cargá dos variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Actions → Publicar en GitHub Pages → Run workflow.**

Cada push a `main` hace tres cosas: prueba las reglas de la base, compila la app y la publica. Si una prueba falla, no se publica.

## Paso 3 · Probarla en el celu

Abrí `https://<tu-usuario>.github.io/<repo>/` en el celu → **Organizar un evento**.

Para instalarla como app:
- **iPhone:** Safari → Compartir → **Agregar a inicio**.
- **Android:** Chrome → menú ⋮ → **Instalar app**.

> En el iPhone, la app instalada no comparte sesión con Safari. Por eso conviene **escribir el código** del mail en vez de tocar el link: el código funciona siempre.

## Paso 4 · Entrega por Google Drive

1. Entrá a [script.google.com](https://script.google.com) → **Nuevo proyecto** → pegá [`drive/Code.gs`](drive/Code.gs).
2. ⚙️ **Configuración del proyecto → Propiedades del script:** agregá `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
3. **Implementar → Nueva implementación → Aplicación web.** Configurala así:
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier usuario**

   Autorizá los permisos de Drive y Gmail.
4. Copiá la URL que termina en `/exec` y cargala en GitHub como la variable `VITE_DRIVE_SCRIPT_URL`. Después corré el workflow de nuevo.

> En el iPad, script.google.com anda mejor con "Solicitar sitio de escritorio" (botón **aA** en Safari).

---

## Reglas y dónde se garantizan

| Regla | Dónde se garantiza |
|---|---|
| Todos entran con mail verificado | Login por código/link de Supabase. El mail del invitado sale de la sesión, no de lo que escribe |
| Nadie dispara antes de "Comenzar" | `take_shot()` responde `NOT_STARTED` mientras el evento está en espera |
| Disparos compartidos, sin pasarse del total | `take_shot()` bloquea la fila del evento y cuenta de forma atómica |
| Cupo de invitados | `join_event()` responde `EVENT_FULL` al llegar al máximo |
| Fotos sin borrar ni reemplazar | Storage solo permite subir al path reservado, una vez. No hay permisos de borrado |
| Fotos privadas | El bucket es privado y las fotos se ven con links firmados que vencen en 1 hora |
| Cuarto oscuro tras el cierre | `album()` y Storage niegan las fotos a los invitados hasta la entrega |
| La edición no borra | Ocultar solo deja la foto fuera del álbum final; sigue guardada |
| Solo el anfitrión controla el evento | Todas las acciones de control pasan por `assert_host()` |

Las pruebas están en [`tests/db.test.mjs`](tests/db.test.mjs) (`npm run test:db`). Corren sobre un Postgres real en memoria.

## Próximos pasos

- **Web con pagos:** después del pago, una Supabase Edge Function con la `service_role` key (guardada como secreto en Supabase) crea el evento con los límites del plan y se lo asigna al mail del cliente.
- **App Store / Play Store:** envolver la app con [Capacitor](https://capacitorjs.com).
