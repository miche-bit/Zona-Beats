# Zona Beats

Plataforma de streaming para subir música y el público la escuche sin poder descargarla fácilmente. Sin dependencias externas — solo Node.js 22+ (usa `node:sqlite` nativo).

Desarrollado por 爪丨匚卄乇.studios.

## Copias de seguridad (backup y restauración)

El Volume evita que se pierdan los archivos en un deploy normal, pero no reemplaza una copia de seguridad real por si el disco falla, se borra algo sin querer, o Railway tiene un problema. Para eso, el panel admin trae dos botones arriba a la derecha:

**Descargar backup**: genera al vuelo un `.zip` con la base de datos completa y todos los archivos (audio, portadas, comprobantes, voz de marca de agua) tal como están en ese momento, y lo descarga a tu computadora. Conviene hacerlo de vez en cuando, sobre todo después de subir contenido importante.

**Restaurar backup**: sube un `.zip` generado con el botón anterior y reemplaza todos los datos actuales por los del backup. Pide dos confirmaciones porque **borra lo que haya en ese momento** antes de escribir los datos del backup — no hay forma de deshacerlo después. Tras restaurar, el servidor se reinicia solo (en Railway esto es automático; si lo corres en tu computadora, hay que volver a ejecutar `node server.js` a mano).

Este es justo el flujo para el caso de "subí una actualización y la app quedó sin datos": descarga el backup de antes de actualizar (si no lo hiciste, revisa primero que el Volume esté bien conectado, porque probablemente ese sea el problema real), y una vez la nueva versión esté funcionando, usa "Restaurar backup" con ese archivo.

## Protección de audio (marca de agua audible)

Desde el panel admin, en la sección "Protección de audio":

1. Se sube un audio corto de voz (una frase, el nombre artístico, un "tag" — unos segundos bastan).
2. Se configura cada cuántos segundos se repite (por defecto 20s) y a qué volumen se mezcla (por defecto 0.35, en una escala de 0.05 a 1).
3. A partir de ese momento, **cada pista nueva que se suba** se procesa con `ffmpeg` para mezclar esa voz por encima del audio original, repitiéndose durante toda la duración de la pista.
4. Se puede escuchar la voz configurada actualmente con el botón "Escuchar la voz actual", o quitarla del todo con "Quitar marca de agua".

Detalles importantes:

- **Solo afecta a pistas subidas después de configurarla.** Las que ya estaban publicadas no se reprocesan automáticamente — si se quiere aplicar retroactivamente, habría que volver a subirlas.
- El archivo final que se sirve al público es siempre el resultado ya mezclado (formato WAV). El archivo original que se subió no se guarda por separado.
- Si el servidor no tiene `ffmpeg` disponible (por ejemplo, si Railway no usó el Dockerfile), la subida de pistas con marca de agua activa fallará con un error claro en el panel — no se sube nada a medias ni se corrompe el catálogo.
- Como con cualquier protección de audio, esto no impide que alguien grabe la pista — su función es que, si lo hace y lo comparte, la copia lleve la marca incrustada.

## Venta de pistas (pago manual por transferencia)

Se puede poner precio a cualquier pista y activar la venta desde el panel admin. Esto **no es una pasarela de pago automática** — es un flujo manual, pero diseñado para tener el menor contacto posible con cada comprador antes de que llegue el aviso por WhatsApp:

1. En "Cobros y ventas" (panel admin), se cargan las cuentas por moneda y el teléfono al que confirmar la transferencia.
2. En cada pista del catálogo, puede marcar "En venta" y/o "Exclusiva" con un precio en CUP. Al marcar "Exclusiva" se activa "En venta" automáticamente, y no se puede guardar ni subir sin precio — el servidor lo rechaza igual que el formulario.
3. En la vista pública, si una pista tiene precio, aparece un botón "Comprar" en el reproductor, que abre un modal con las cuentas correspondientes a la moneda elegida y el teléfono al que confirmar la transferencia, visible antes de pagar.
4. El comprador transfiere, luego completa su **nombre**, su **teléfono**, y sube la **foto del comprobante**. El botón de envío permanece bloqueado hasta llenar los tres campos.
5. Al enviarlo, el comprobante (con nombre, teléfono, pista y precio) **se sube y se guarda en el servidor** — no en el navegador del comprador. Recién ahí se activa un botón "Avisar por WhatsApp", que abre un chat con un mensaje ya redactado usando el nombre real de la persona: *"Hola, soy [Nombre] 👋 Acabo de comprar '[Pista]' ([Precio]). Ya te envié el comprobante de mi transferencia a través de la plataforma. ¡Gracias!"*
6. Desde el panel admin se ve la sección "Comprobantes de compra" con la foto, nombre, teléfono y pista de cada uno. Se puede "Aprobar" el pedido — si la pista era exclusiva, se marca como vendida y pasa a la pestaña "Beats VIP", dejando de estar disponible para cualquier otra persona. También se puede eliminar el comprobante una vez procesado, para no acumular espacio.

**Sobre el límite real de WhatsApp**: ninguna página web puede adjuntar una imagen a un chat de WhatsApp de forma automática — es una restricción que WhatsApp impone deliberadamente, no algo que dependa del código de esta app. Por eso el comprobante se sube directo al servidor (no se reenvía por WhatsApp), y el mensaje de WhatsApp solo sirve para avisar y dar contexto; la evidencia real vive en el panel admin, donde ya está guardada y visible antes de intercambiar un solo mensaje con el comprador.

**Nota de seguridad**: los números de cuenta, el teléfono de contacto y los comprobantes se guardan en la base de datos y el disco locales (`db/app.db` y `uploads/receipts/`), nunca en el código fuente. Si usas Railway con un Volume persistente, sobreviven a los despliegues igual que las pistas. Recuerda eliminar los comprobantes ya procesados desde el panel admin para no acumular espacio en disco con el tiempo.

## Likes y reproducciones en Playlist

Cada pista de Playlist muestra un contador de reproducciones (automático) y un botón de "me gusta" con su contador. El like queda registrado en `localStorage` del navegador del usuario, así que puede quitarlo y volver a darlo, pero no puede inflar el contador dando like repetido desde el mismo navegador.

## Redes sociales

En el panel admin, sección "Redes sociales": se puede agregar, editar o quitar cualquier cantidad de links (nombre + URL), sin límite de plataformas. Se muestran como íconos circulares en la página pública, debajo del nombre y la biografía del artista.

- La plataforma se detecta automáticamente por el dominio del link: Spotify, Facebook, YouTube (incluye YouTube Music), Instagram, TikTok y SoundCloud tienen ícono propio.
- Cualquier otra red (Beatport, Twitter/X, un sitio propio, etc.) se muestra con un ícono genérico de enlace — no hace falta que la plataforma esté en una lista predefinida.
- El campo "Nombre" es lo que aparece como tooltip al pasar el cursor sobre el ícono; puede ser el nombre de la red o cualquier etiqueta.
- Los links deben empezar con `http://` o `https://`; el servidor rechaza cualquier otro esquema (por ejemplo `javascript:`) como medida de seguridad básica.
- Si no se configura ninguna red social, la fila de íconos simplemente no aparece en la página pública.

## Formatos soportados

- **Audio**: MP3, WAV, M4A, OGG, FLAC (máx. 150MB por archivo — pensado para WAV sin comprimir)
- **Imágenes**: JPG, PNG, WEBP (máx. 8MB)

