# Zona Beats

Plataforma de streaming para subir música y el público la escuche sin poder descargarla fácilmente. Sin dependencias externas — solo Node.js 22+ (usa `node:sqlite` nativo).

## Cómo funciona la protección del contenido

Es importante ser claro sobre esto: **ninguna plataforma (ni Spotify) puede impedir al 100% que alguien grabe el audio que sale por los parlantes o audífonos**. Eso es una limitación física, no de software. Ninguna de las capas de abajo lo cambia — solo suben el esfuerzo necesario para redistribuir el audio.

Lo que esta app sí hace:

- El audio nunca se ofrece como descarga. Se sirve en fragmentos (streaming por rangos de bytes), igual que Spotify o YouTube.
- Cada reproducción requiere un token temporal que expira solo (30 min). El link del audio no sirve si se comparte fuera de la app.
- Click derecho, atajos de guardar (`Ctrl+S`), y herramientas de desarrollador básicas están bloqueados en la interfaz pública (disuade al usuario casual, no a alguien técnico).
- Las portadas e imágenes tampoco se pueden arrastrar/guardar fácilmente.
- **Marca de agua audible** (opcional, configurable desde el panel admin en "Protección de audio"): se sube un audio corto de voz una sola vez, y el servidor lo mezcla automáticamente a bajo volumen sobre cada pista nueva que se suba, repitiéndolo cada cierto intervalo (configurable). Esto no impide grabar el audio, pero deja la marca incrustada en cualquier copia que se comparta — la misma técnica que usan los previews de SoundCloud y los packs de samples. Requiere `ffmpeg` en el servidor (ver sección de despliegue).

Esto bloquea el 95% de los intentos casuales de robo (copiar el link, descargar el MP3 directo) y desincentiva la redistribución de lo que sí se logre grabar. No bloquea a alguien grabando con otro dispositivo o software de captura de audio del sistema — eso no lo resuelve nadie.


