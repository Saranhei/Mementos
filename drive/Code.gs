/**
 * Mementos — entrega del álbum por Google Drive + mail.
 *
 * Corre en TU cuenta de Google (script.google.com). Cuando cerrás el álbum y
 * tocás "Enviar álbum por Drive" en la app:
 *   1. Crea una carpeta "Mementos · <evento> · <fecha>" en tu Drive con todas las fotos.
 *   2. Crea adentro "★ Las más votadas" con el top ordenado.
 *   3. Deja la carpeta visible para cualquiera con el link.
 *   4. Le manda a cada invitado un mail con el link + adjuntas sus "quiero esta"
 *      y las 3 más votadas.
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   SUPABASE_URL       → https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY  → la anon/publishable key (la misma que usa la app)
 *
 * No necesita la service key: usa la sesión de quien organiza, y Supabase
 * verifica que sea el dueño del evento y que el álbum esté cerrado.
 */

const TOP_FOLDER_COUNT = 10
const TOP_IN_EMAIL = 3
const MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024 // Gmail permite 25 MB; dejamos margen
const FETCH_BATCH = 20

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents)
    if (!body.eventId || !body.accessToken) throw new Error('Faltan datos del evento')
    const result = deliver_(body.eventId, body.accessToken)
    return json_(Object.assign({ ok: true }, result))
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) })
  }
}

function doGet() {
  return json_({ ok: true, service: 'mementos-drive' })
}

function deliver_(eventId, token) {
  const data = rpc_('host_export', { p_event_id: eventId }, token)
  const event = data.event
  if (event.drive_folder_url) {
    return { folderUrl: event.drive_folder_url, emailsSent: 0, alreadyDelivered: true }
  }

  const photos = data.photos
  const date = Utilities.formatDate(new Date(event.created_at), Session.getScriptTimeZone(), 'dd/MM/yyyy')
  const folder = DriveApp.createFolder('Mementos · ' + event.name + ' · ' + date)
  folder.setDescription(photos.length + ' fotos sacadas entre todos en ' + event.name + '. Hecho con Mementos.')

  const blobs = fetchBlobs_(photos)
  const files = {}
  photos.forEach(function (photo) {
    const blob = blobs[photo.id]
    if (!blob) return
    files[photo.id] = folder.createFile(blob.copyBlob().setName(fileName_(photo)))
  })

  const ranked = photos
    .filter(function (photo) { return photo.score > 0 && files[photo.id] })
    .sort(function (a, b) { return b.score - a.score || b.ups - a.ups })

  if (ranked.length) {
    const topFolder = folder.createFolder('★ Las más votadas')
    ranked.slice(0, TOP_FOLDER_COUNT).forEach(function (photo, index) {
      files[photo.id].makeCopy(pad_(index + 1, 2) + ' · ' + fileName_(photo), topFolder)
    })
  }

  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
  const folderUrl = folder.getUrl()

  // Se marca como entregado antes de los mails: si algo falla, no se duplica la carpeta.
  rpc_('mark_delivered', { p_event_id: eventId, p_url: folderUrl }, token)

  const topForEmail = ranked.slice(0, TOP_IN_EMAIL)
  const failed = []
  let emailsSent = 0

  uniqueGuests_(data.guests).forEach(function (guest) {
    if (MailApp.getRemainingDailyQuota() <= 0) {
      failed.push(guest.email)
      return
    }
    try {
      const wanted = photos.filter(function (photo) { return photo.wanted_by.indexOf(guest.email) >= 0 })
      const picks = uniqueById_(wanted.concat(topForEmail))
      const attachments = attachmentsFor_(picks, blobs)
      MailApp.sendEmail({
        to: guest.email,
        name: 'Mementos',
        subject: 'Tus fotos de ' + event.name,
        htmlBody: emailHtml_(guest, event, folderUrl, photos.length, wanted.length, attachments.length, picks.length),
        attachments: attachments,
      })
      emailsSent++
    } catch (err) {
      failed.push(guest.email)
    }
  })

  return { folderUrl: folderUrl, emailsSent: emailsSent, failed: failed }
}

// ---------------------------------------------------------------------

function config_() {
  const props = PropertiesService.getScriptProperties()
  const url = props.getProperty('SUPABASE_URL')
  const key = props.getProperty('SUPABASE_ANON_KEY')
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en las propiedades del script')
  return { url: url.replace(/\/$/, ''), key: key }
}

function rpc_(name, args, token) {
  const cfg = config_()
  const response = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/' + name, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: cfg.key, Authorization: 'Bearer ' + token },
    payload: JSON.stringify(args),
    muteHttpExceptions: true,
  })
  const text = response.getContentText()
  if (response.getResponseCode() >= 300) {
    let message = text
    try { message = JSON.parse(text).message || text } catch (ignored) {}
    throw new Error(message)
  }
  return text ? JSON.parse(text) : null
}

function fetchBlobs_(photos) {
  const base = config_().url + '/storage/v1/object/public/photos/'
  const blobs = {}
  for (let start = 0; start < photos.length; start += FETCH_BATCH) {
    const batch = photos.slice(start, start + FETCH_BATCH)
    const responses = UrlFetchApp.fetchAll(batch.map(function (photo) {
      return { url: base + photo.storage_path, muteHttpExceptions: true }
    }))
    responses.forEach(function (response, index) {
      if (response.getResponseCode() === 200) {
        blobs[batch[index].id] = response.getBlob().setContentType('image/jpeg')
      }
    })
  }
  return blobs
}

function attachmentsFor_(photos, blobs) {
  const attachments = []
  let total = 0
  photos.forEach(function (photo) {
    const blob = blobs[photo.id]
    if (!blob) return
    const size = blob.getBytes().length
    if (total + size > MAX_ATTACHMENT_BYTES) return
    total += size
    attachments.push(blob.copyBlob().setName(fileName_(photo)))
  })
  return attachments
}

function emailHtml_(guest, event, folderUrl, totalPhotos, wantedCount, attachedCount, pickedCount) {
  const missing = pickedCount - attachedCount
  return (
    '<div style="font-family:Georgia,serif;background:#14110f;color:#f4ece1;padding:32px;border-radius:16px;max-width:520px">' +
    '<p style="font-family:monospace;font-size:12px;letter-spacing:2px;color:#a8998a;margin:0">MEMENTOS</p>' +
    '<h1 style="font-weight:400;font-size:32px;margin:8px 0 16px">' + escape_(event.name) + '</h1>' +
    '<p style="font-family:Arial,sans-serif;line-height:1.5">Hola ' + escape_(guest.name) + ', el rollo se reveló: ' +
    totalPhotos + ' fotos sacadas entre todos.</p>' +
    '<p style="font-family:Arial,sans-serif;line-height:1.5">' +
    (attachedCount
      ? 'Te adjuntamos ' + (wantedCount ? 'las que marcaste como “quiero esta” y ' : '') + 'las más votadas.'
      : 'Todas las fotos están en el álbum.') +
    (missing > 0 ? ' Algunas no entraron en el mail; están en la carpeta.' : '') +
    '</p>' +
    '<p style="margin:24px 0"><a href="' + folderUrl + '" style="background:#ff5a36;color:#1a0d08;padding:14px 22px;border-radius:999px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold">Ver el álbum completo</a></p>' +
    '</div>'
  )
}

function uniqueGuests_(guests) {
  const seen = {}
  return guests.filter(function (guest) {
    const email = String(guest.email).toLowerCase()
    if (seen[email]) return false
    seen[email] = true
    guest.email = email
    return true
  })
}

function uniqueById_(photos) {
  const seen = {}
  return photos.filter(function (photo) {
    if (seen[photo.id]) return false
    seen[photo.id] = true
    return true
  })
}

function fileName_(photo) {
  const author = String(photo.author || 'invitado').replace(/[\\/:*?"<>|]/g, '').trim()
  return pad_(photo.shot_number, 3) + ' - ' + author + '.jpg'
}

function pad_(value, width) {
  return String(value).padStart(width, '0')
}

function escape_(text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON)
}
