# Zona Beats

Tienda de beats con tres partes:

- **Tienda pública** (`/`): catálogo, Playlist gratuita, Beats VIP y Productores. Se escucha un preview, se compra una licencia pagando por transferencia y, cuando el administrador aprueba el pago, el comprador descarga sus archivos y su licencia en PDF desde «Mis compras».
- **Portal de productores** (`/productores`): registro, planes Free / Pro / Studio, subida de beats, edición, estadísticas, referidos, bonos y retiros de dinero.
- **Panel de administración** (`/admin`): pedidos, productores, planes, retiros, tu propia música, tasas de cambio, cuentas de cobro, marca de agua y copias de seguridad.

Sin dependencias npm: solo **Node.js 22+** (usa `node:sqlite`) y **ffmpeg** (previews, marca de agua, MP3 de 320 kbps y miniaturas).

## Estructura

```
server.js          Servidor HTTP: API, streaming, descargas y archivos estáticos
db.js              Base de datos SQLite y migraciones (se aplican solas al arrancar)
backup.js          Backups ZIP por partes (ZIP64) y restauración segura
watermark.js       ffmpeg: marca de agua, MP3, duración y miniaturas
license.js         PDF de la licencia
producerAuth.js    Contraseñas y sesiones de productores
streamAuth.js      Tokens temporales para escuchar
public/            Tienda (index.html, app.js, style.css), tokens.css (design tokens), ui.js (skeletons y accesibilidad), historial.js, verify.html, subidas.js, favicon.svg
productores/       Portal de productores
admin/             Panel de administración
uploads/           audio (previews) · covers · receipts · watermark · masters (audio original, WAV, STEMS) · tmp
db/                app.db
```

## Correrlo en tu computadora

1. Node.js 22 o más nuevo (`node --version`) y ffmpeg instalado.
2. `cp .env.example .env` y pon tu contraseña en `ADMIN_PASSWORD`.
3. `node server.js` (o `npm start`).
4. Tienda: `http://localhost:3000` · Portal: `/productores` · Panel: `/admin`.

## Desplegar en Railway

1. Sube el proyecto a GitHub (el `.gitignore` ya excluye `.env`, la base de datos y los archivos subidos) y crea el servicio desde ese repo. Railway usa el `Dockerfile` (instala ffmpeg); si no lo toma solo, en *Settings → Builder* elige **Dockerfile**.
2. **Volume (obligatorio):** pestaña *Volumes → New Volume*, por ejemplo en `/data`. Railway crea sola la variable `RAILWAY_VOLUME_MOUNT_PATH` y la app guarda ahí la base de datos y todos los archivos. Sin Volume, cada deploy borra todo.
3. **Variables:**
   - `ADMIN_PASSWORD` — **obligatoria**. Si falta o es la de ejemplo, el panel queda bloqueado (cualquiera la conocería). Usa 10 caracteres o más.
   - `ADMIN_SESSION_SECRET` — opcional. Si no la pones, la app genera una y la guarda en la base de datos.
4. **Restart policy:** al restaurar un backup el servidor se reinicia solo (sale con código 1 para que Railway lo levante de nuevo). Deja la política en «On Failure» o «Always».
5. Espacio: los WAV y STEMS pesan. El panel muestra el espacio usado en *Ventas → Resumen*; agranda el Volume cuando haga falta.

## Subidas por partes

Railway corta cualquier petición cuyo cuerpo tarde más de 5 minutos en subir, y con datos móviles un WAV o unos STEMS no entran en ese tiempo. Por eso los archivos se suben en trozos de hasta 4 MB (se achican solos si la conexión es lenta):

- Si se corta la conexión, la subida reintenta sola y sigue donde quedó.
- Si se cierra la página, basta con volver a elegir **los mismos archivos** y pulsar el botón: sigue desde el último trozo.
- El servidor escribe directo al disco (no carga archivos en memoria) y descarta cualquier trozo que llegue incompleto.
- Todo se valida antes de mover archivos: si falta algo (por ejemplo el WAV), se corrige y se reenvía sin volver a subir lo demás.
- Límites: audio 250 MB · WAV 1 GB · STEMS 4 GB (ZIP, RAR o 7Z) · portada 8 MB. Las subidas que no se terminan se borran a los 2 días.

## Planes de productores

| | Free | Pro | Studio |
|---|---|---|---|
| Beats activos | 5 | 50 | ilimitados |
| Comisión de la plataforma | 30 % | 20 % | 10 % |
| Audio | MP3 320 kbps | MP3 320 kbps o WAV | MP3 320 kbps o WAV |
| Licencias | Básica | Básica, Premium | Todas + Exclusiva |
| Preview | con marca de agua | sin marca | sin marca |
| WAV / STEMS | — | WAV | WAV + STEMS |
| Playlist, redes, estadísticas | solo referidos | redes y estadísticas | todo + bono por me gusta |
| Pago de retiros | 7-14 días | 3 días | 24 horas |

- El precio de los planes se pone en USD y se muestra también en CUP con la tasa del USD que tenga el administrador.
- El productor compra o renueva desde su portal enviando el comprobante; al aprobarlo se activa (o se suma a lo que ya tenía).
- **Con su saldo:** si tiene dinero ganado en la plataforma, puede pagar el plan con cualquiera de sus billeteras (CUP o la moneda en que le pagaron, con la tasa de venta del admin) y se activa al instante, sin retirar ni mandar comprobante. El cargo queda en sus movimientos.
- Si el plan vence, cobra como Free y no puede subir; a los 15 días sin renovar la cuenta se desactiva (no se borra).
- Al pasar de Free a Pro/Studio, sus previews se rehacen solos sin la marca de agua.
- La Exclusiva se le puede habilitar a mano a un productor Pro desde el panel.

## Créditos de cada tema

- **Catálogo:** debajo del título van el género y quién lo produjo («Reguetón · prod. JLarry»). Si la subió el administrador, sale su nombre artístico (el de *Perfil público*); si es de un productor, el del productor.
- **Playlist:** además, los artistas de la colaboración (campo «Artista(s) colaborador(es)»), con 🎤: título, artistas, género y productor.
- **Beats VIP:** título, género y productor (sin colaboradores), más el dueño de la exclusiva.
- Lo mismo sale en el reproductor, en la descripción del tema y en las tarjetas de Hots. Se puede buscar por nombre del productor.

## Monedas

- Vienen listas CUP, MLC, USD, **BNB (BEP20)**, USDT (TRC20), USDT (Polygon) y Saldo Móvil; el administrador puede agregar otras. Una moneda aparece para pagar cuando tiene tasa en *Tasas de cambio* (CUP por 1 unidad; se puede escribir «280.000»).
- **Decimales:** CUP y Saldo Móvil van en enteros, las cripto como BNB con **6 decimales** (un beat cuesta una fracción pequeña, ej. 0,013500 BNB) y el resto con 2.
- **Cambio de USDT (BEP20) a BNB (BEP20):** al arrancar esta versión, USDT (BEP20) pasa a BNB (BEP20) una sola vez:
  - Las cuentas de cobro del administrador y de los productores conservan su dirección, porque en BEP20 es la misma para cualquier token.
  - La tasa queda vacía porque 1 BNB no vale lo mismo que 1 USDT: **hay que ponerla**. Hasta entonces BNB no aparece como forma de pago.
  - Las ventas que ya se hicieron en USDT quedan en USDT, y quien tenga saldo en USDT lo sigue cobrando en USDT.

## Hots (portada)

- Debajo de la presentación de la tienda hay un carrusel de beats destacados que avanza solo de izquierda a derecha. Se puede deslizar con el dedo y tiene botón de pausa. Se detiene mientras lo tocas o pasas el mouse, y no se mueve si el teléfono pide «reducir movimiento». Al tocar un beat, suena y se puede comprar. El orden cambia al azar en cada visita.
- **Productores:** en *Mis beats*, «🔥 Poner en Hots» en cualquier beat a la venta, por 1, 2 o 4 semanas.
  - Pagando con su saldo, el beat sale al instante y el cargo aparece en sus movimientos (filtro «Hots»).
  - Pagando por transferencia con comprobante, sale cuando el administrador aprueba.
  - Si el beat ya está en Hots, el tiempo nuevo se suma al final.
- **Cupos:** el administrador pone el precio por semana en USD (se cobra en CUP con la tasa del USD) y cuántos cupos hay.
  - Los pedidos en revisión apartan su cupo.
  - Si están llenos, el productor ve cuándo se libera el próximo.
- **Panel (Productores → Hots):**
  - aprobar o rechazar comprobantes;
  - ver lo que está en la portada y quitarlo antes de tiempo;
  - destacar gratis cualquier beat (tuyo o de un productor);
  - historial con descarga.
- Un Hot termina solo al vencer, o si el beat se vende en exclusiva o ilimitada, se oculta o se desactiva el productor.

## Licencias y lo que se entrega

| Licencia | Recibe | Venta |
|---|---|---|
| Básica | MP3 | varias veces |
| Premium | MP3 + WAV | varias veces |
| Ilimitada | MP3 + WAV + STEMS | una vez: el beat sale del catálogo |
| Exclusiva | MP3 + WAV + STEMS | una vez: pasa a Beats VIP |

- Cada licencia con precio **exige** su archivo al subir (Premium → WAV; Ilimitada/Exclusiva → WAV y STEMS). Si el audio principal ya es WAV, ese mismo se entrega como WAV.
- Si el audio principal no es MP3, se crea un MP3 de 320 kbps para entregar.
- Una Exclusiva no puede convivir con otras licencias en el mismo beat.

## Compras

1. El comprador elige licencia y moneda, transfiere, pone nombre y WhatsApp y sube la foto del comprobante (el navegador la achica antes de subirla).
2. En *Ventas* el administrador **aprueba** (se genera la licencia LIC-AAAA-NNNN-XXXX con su hash) o **rechaza con motivo**. Al aprobar aparece el botón para mandarle al comprador su link privado de descarga por WhatsApp.
3. El comprador ve el estado en «Mis compras» (se actualiza sola): al aprobarse descarga el MP3 automáticamente y tiene botones para WAV, STEMS y el PDF; si se rechazó, ve el motivo.
4. En la Exclusiva el comprador decide si su nombre sale en Beats VIP («Dueño anónimo» si no autoriza).
5. Las descargas soportan reanudación (Range) y el link es privado (token de 48 caracteres, no el número de licencia).

## Dinero de los productores

- **Billetera por moneda:** al aprobar un comprobante, lo que pagó el comprador **en su moneda** (con la tasa del momento de la compra y el descuento de promoción si había) se suma a la billetera del productor en esa misma moneda, menos la comisión de su plan al aprobar. Ejemplo: pagó 0,013500 BNB y el productor es Pro (20 %) → 0,010800 BNB a su billetera en BNB. Si la moneda no tenía tasa, va a la billetera en CUP. Las compras anteriores a este cambio quedan en CUP.
- Los bonos (referidos y me gusta en Playlist para Studio) van a la billetera en CUP.
- **El saldo es un libro de movimientos** por billetera: ventas aprobadas + bonos − planes pagados con saldo − retiros (en curso o pagados). Un retiro cancelado no descuenta nada, así que el dinero vuelve solo.
- **Saldo a retirar:** la tarjeta muestra una plaquita por cada moneda en que pagaron los compradores (ej. «1220 CUP» y «0,010800 BNB (BEP20)»).
- **Sin conversión:** cada saldo se cobra **en su misma moneda**. Si un comprador pagó con PayPal, el productor cobra ese saldo en PayPal; si no tiene esa forma de cobro, la agrega en su Perfil (el administrador no convierte monedas). En el retiro solo elige el **saldo a retirar** y el monto.
- **Fee de red:** en *Planes, bonos y retiros* el administrador pone el fee de cada moneda que cuesta enviar (BNB BEP20, USDT TRC20…); se descuenta de lo que retira el productor.
- **Retiro de la cantidad que quiera:** viene puesto todo su saldo (botón «Todo»). No puede pasar de su saldo ni pedir tan poco que no cubra el fee. Antes de confirmar ve cuánto recibe y cuánto le queda. Se avisa por WhatsApp y el panel muestra la cuenta regresiva según el plan. Hay un retiro en curso a la vez; cuando se paga o cancela puede pedir otro. Los retiros viejos que se hicieron con conversión se siguen mostrando con su cálculo.
- **Movimientos de tu cuenta** (pestaña Dinero): historial completo con ventas (también las que esperan aprobación), bonos, planes pagados con saldo o por transferencia (estos últimos no tocan el saldo) y retiros con su estado. Se puede filtrar por tipo, descargar y borrar (ver *Historiales*). Mientras no se borre nada, la suma de los movimientos cuadra con el saldo.
- En el panel, cada retiro pendiente muestra los movimientos de esa billetera y cuánto le queda al productor; en *Productores* el botón «Movimientos» muestra el historial completo de cada uno.

## Historiales

- Todos los historiales se muestran del más nuevo al más viejo, con **fecha y hora** (dd/mm/aaaa · hh:mm, en la hora del dispositivo).
- **Portal del productor:** «Movimientos de tu cuenta». **Panel:** Historial de compras, Compras de planes, Retiros ya resueltos y los Movimientos de cada productor (botón en *Productores*).
- **Descargar:** cada historial se baja como CSV (se abre en Excel, separado por «;», con fecha y hora). Se descarga lo que se está viendo: si hay un filtro o una búsqueda, solo eso.
- **Borrar:** la × de cada fila o «Borrar historial» (respeta el filtro o la búsqueda). Borrar solo **oculta** la entrada de esa lista y para quien la borró: el saldo, las ventas, las licencias y las descargas del comprador no cambian, y el productor sigue viendo lo suyo aunque el administrador lo borre de su vista (y al revés). Lo que está en curso (un retiro pendiente, una venta esperando aprobación, un plan en revisión) no se puede borrar. «Restaurar borrados» vuelve a mostrar todo.

## Diseño

- **Design tokens:** todos los colores, radios, tipografías, tiempos y sombras salen de `public/tokens.css` (tienda, portal y panel). Para cambiar un color de la marca se cambia en un solo lugar. El portal solo cambia su acento (violeta) y la tienda y el panel usan el rosa.
- **Skeletons:** mientras llegan los datos, las listas muestran bloques de carga con la forma del contenido (tarjetas de beats, filas, plaquitas de saldo) en vez de pantallas vacías o avisos de «no hay nada» que después desaparecen. Están en `public/ui.js` (`ZBUI.skeleton`).
- **Ley de Hick:** menos opciones a la vez. En el retiro solo se elige el saldo y el monto; en cada productor del panel se ven «Movimientos» y «Más opciones» (Exclusiva, activar/desactivar, contraseña y eliminar quedan dentro).
- **Accesibilidad (WCAG 2.2 AA):**
  - contraste suficiente en todos los textos;
  - foco visible con teclado;
  - las tarjetas de beats y productores se abren con Enter;
  - en los modales, Escape cierra, el foco no se escapa y vuelve al botón que los abrió;
  - pestañas y filtros avisan cuál está activo;
  - todos los campos tienen nombre para los lectores de pantalla;
  - los avisos se leen solos;
  - las animaciones se apagan si el teléfono lo pide («reducir movimiento»).
  - Revisado con axe-core: 0 fallas en las 16 pantallas.

## Verificar licencias y archivos

En `/verify` cualquiera puede comprobar:
- un número de licencia o su hash;
- un archivo de audio, WAV o STEMS (la huella SHA-256 se calcula en el propio dispositivo, por partes, aunque pese GB);
- el **PDF de la licencia**: se lee el número y el hash impresos y se avisa si el PDF fue modificado.

## Copias de seguridad

En *Ajustes → Copias de seguridad*:
- **Backup de datos**: base de datos (ventas, licencias, productores, saldos), portadas, fotos, comprobantes y marca de agua. Pesa poco: descárgalo seguido.
- **Backup completo**: además previews, audios originales, WAV y STEMS. Puede pesar varios GB; con conexión lenta la descarga puede cortarse, así que para los audios activa también los backups del Volume en Railway.
- **Restaurar**: el ZIP se sube por partes, se extrae entero a una carpeta aparte, se comprueba la base de datos y recién entonces se reemplazan los datos (con vuelta atrás si algo falla). Uno de *datos* deja los audios que ya están en el servidor. Después el servidor se reinicia solo.

## Protección del audio

Ninguna web puede impedir que alguien grabe lo que suena por los parlantes. Lo que sí hace la app: previews MP3 de 192 kbps (livianos, nunca el archivo original), acceso con tokens temporales, marca de agua de voz en los previews de productores Free, y el menú de «guardar» bloqueado sobre portadas y reproductor (no en campos de texto ni enlaces).

## Seguridad

- Contraseña del panel obligatoria en producción; la sesión se firma con un secreto guardado y se invalida si cambias la contraseña.
- Intentos de inicio de sesión limitados (solo cuentan los fallidos, por el NAT de las operadoras).
- Cookies `HttpOnly` + `SameSite=Lax` (+ `Secure` con HTTPS), cabeceras de seguridad, IP real tomada del último `X-Forwarded-For`.
- Los productores pueden cambiar su contraseña; si la olvidan, el administrador les pone una nueva (se cierran sus sesiones).

## Limitaciones conocidas

- El pago es manual (transferencia + comprobante): no hay pasarela automática.
- No hay envío de correos: los avisos van por WhatsApp con mensajes ya escritos.
- Un backup completo de muchos GB puede no terminar de descargarse con conexión lenta (Railway corta las peticiones largas).
