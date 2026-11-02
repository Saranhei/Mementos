/**
 * Mementos — entrega del álbum por Google Drive + mail.
 *
 * Corre en TU cuenta de Google (script.google.com). Cuando terminás la edición
 * y tocás "Enviar álbum por mail" en la app:
 *   1. Crea una carpeta "Mementos · <evento> · <fecha>" en tu Drive con todas las fotos.
 *   2. Crea adentro "★ Las más votadas" con el top ordenado.
 *   3. Deja la carpeta visible para cualquiera con el link.
 *   4. Le manda a cada invitado un mail con tu mensaje, la portada, el link y
 *      adjuntas sus "quiero esta" y las 3 más votadas.
 *   Las fotos que ocultaste en la edición no salen en ningún lado.
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   SUPABASE_URL       → https://xxxx.supabase.co
 *   SUPABASE_PUBLISHABLE_KEY → la publishable key (sb_publishable_..., la misma que usa la app)
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

  const blobs = fetchBlobs_(photos, token)
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
  const coverPhoto = photos.filter(function (photo) { return photo.storage_path === event.cover_path })[0] || ranked[0]
  const cover = coverPhoto && blobs[coverPhoto.id] ? blobs[coverPhoto.id].copyBlob().setName('portada.jpg') : null
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
      const mail = {
        to: guest.email,
        name: 'Mementos',
        subject: 'Tus fotos de ' + event.name,
        htmlBody: emailHtml_(guest, event, folderUrl, photos.length, wanted.length, attachments.length, picks.length, Boolean(cover)),
        attachments: attachments,
      }
      if (cover) mail.inlineImages = { cover: cover }
      MailApp.sendEmail(mail)
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
  const key = props.getProperty('SUPABASE_PUBLISHABLE_KEY')
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY en las propiedades del script')
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

// Las fotos son privadas: se bajan con la sesión del host.
function fetchBlobs_(photos, token) {
  const cfg = config_()
  const base = cfg.url + '/storage/v1/object/authenticated/photos/'
  const headers = { apikey: cfg.key, Authorization: 'Bearer ' + token }
  const blobs = {}
  for (let start = 0; start < photos.length; start += FETCH_BATCH) {
    const batch = photos.slice(start, start + FETCH_BATCH)
    const responses = UrlFetchApp.fetchAll(batch.map(function (photo) {
      return { url: base + photo.storage_path, headers: headers, muteHttpExceptions: true }
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

function emailHtml_(guest, event, folderUrl, totalPhotos, wantedCount, attachedCount, pickedCount, hasCover) {
  const missing = pickedCount - attachedCount
  const sans = 'font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#3b352e'
  return (
    '<div style="background:#f4efe6;padding:28px 16px">' +
    '<div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e3dccf;border-radius:14px;padding:28px">' +
    '<p style="font-family:monospace;font-size:11px;letter-spacing:3px;color:#7a7064;margin:0">MEMENTOS · ROLLO REVELADO</p>' +
    '<h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;margin:8px 0 18px;color:#1d1a16">' + escape_(event.name) + '</h1>' +
    (hasCover
      ? '<div style="background:#fff;padding:10px 10px 34px;box-shadow:0 6px 18px rgba(0,0,0,.18);transform:rotate(-2deg);margin:0 0 22px">' +
        '<img src="cid:cover" alt="Portada" style="display:block;width:100%;height:auto"></div>'
      : '') +
    '<p style="' + sans + '">Hola ' + escape_(guest.name) + ', ' + totalPhotos + ' fotos sacadas entre todos.</p>' +
    (event.message
      ? '<p style="font-family:Georgia,serif;font-style:italic;font-size:18px;color:#1d1a16;border-left:3px solid #c8381f;padding-left:12px">' +
        escape_(event.message).replace(/\n/g, '<br>') + '</p>'
      : '') +
    '<p style="' + sans + '">' +
    (attachedCount
      ? 'Te adjuntamos ' + (wantedCount ? 'las que marcaste como “quiero esta” y ' : '') + 'las más votadas.'
      : 'Todas las fotos están en el álbum.') +
    (missing > 0 ? ' Algunas no entraron en el mail; están en la carpeta.' : '') +
    '</p>' +
    '<p style="margin:26px 0 6px"><a href="' + folderUrl + '" style="background:#1d1a16;color:#f4efe6;padding:14px 22px;border-radius:999px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold">Ver el álbum completo</a></p>' +
    '</div></div>'
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
