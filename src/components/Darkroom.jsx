// Lo que ve el invitado entre el cierre y la entrega: el rollo está en el cuarto oscuro.
export const Darkroom = ({ event }) => (
  <section className="darkroom">
    <div className="darkroom-light" aria-hidden="true" />
    <p className="eyebrow">Cuarto oscuro</p>
    <h2 className="display">Revelando el rollo…</h2>
    <p>
      La fiesta terminó. El anfitrión está editando el álbum de <strong>{event.name}</strong>. Cuando esté listo te llega
      a <strong>{event.guest.email}</strong> y vas a poder verlo acá.
    </p>
    <p className="tiny">Gracias por cada foto 📷</p>
  </section>
)
