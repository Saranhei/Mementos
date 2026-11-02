// Si el anfitrión no deja una nota, aparece una de estas. Se elige por el código del
// evento para que todos los invitados vean la misma y no cambie al recargar.
const CLOSING_NOTES = [
  'Hay noches que no se repiten. Esta fue una. Mientras el rollo se revela, quedate un rato más con lo que viviste: las risas, los abrazos, lo que nadie fotografió y todos vamos a recordar.',
  'Las mejores fotos de esta noche no son las más nítidas: son las que se sacaron entre carcajadas. Gracias por ser parte de cada una.',
  'Cada disparo fue una sola oportunidad, como cada momento de esta fiesta. Lo que pasó ya es nuestro para siempre.',
  'Se apagaron las luces, pero el recuerdo recién empieza. Pronto vas a tener en tus manos las pruebas de que estuvimos ahí, juntos.',
  'Gracias por los bailes, las charlas en la cocina y los brindis de último momento. El rollo está en el cuarto oscuro; los recuerdos ya están revelados.',
  'Algún día vamos a mirar estas fotos y nos vamos a reír de los peinados, de los pasos de baile y de lo felices que éramos sin darnos cuenta.',
  'Esta noche se juntaron historias que no siempre se cruzan. Gracias por traer la tuya.',
  'No importa cuántas fotos haya: lo valioso fue estar. Gracias por haber estado.',
  'Lo que se vivió acá no entra en un álbum, pero vamos a intentarlo. Tu copia está en camino.',
  'Entre flashes y canciones, armamos algo que ninguno podría haber hecho solo: un recuerdo de todos.',
  'Un brindis más, ahora en silencio, por la gente que hace que una noche cualquiera se vuelva inolvidable. Vos sos parte de esa gente.',
  'El tiempo pasa rápido cuando la pasamos bien. Por suerte, esta vez alguien apretó el disparador.',
]

const hash = (text) => [...text].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7)

export const closingNoteFor = (event) =>
  event.message
    ? { text: event.message, signature: event.host_name, fromHost: true }
    : { text: CLOSING_NOTES[hash(event.code) % CLOSING_NOTES.length], signature: null, fromHost: false }
