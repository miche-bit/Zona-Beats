# Zona Beats

Tienda de beats con tres partes:

- **Tienda pública** (`/`): catálogo, Playlist gratuita, Beats VIP y Productores. Arriba, junto a la marca, el botón «¿Eres productor? Únete» abre el portal directo en «Crear cuenta» (`/productores?unirse`). Se escucha un preview, se compra una licencia pagando por transferencia y, cuando el administrador aprueba el pago, el comprador descarga sus archivos y su licencia en PDF desde «Mis compras».
- **Portal de productores** (`/productores`): registro, planes Free / Pro / Studio, subida de beats, edición, estadísticas, referidos, bonos y retiros de dinero.
- **Panel de administración** (`/admin`): pedidos, productores, planes, retiros, tu propia música, tasas de cambio, cuentas de cobro, marca de agua y copias de seguridad.

Sin dependencias npm: solo **Node.js 22+** (usa `node:sqlite`) y **ffmpeg** (previews, marca de agua, MP3 de 320 kbps y miniaturas).

## Estructura

```
server.js          Servidor HTTP: API, streaming, descargas y archivos estáticos
db.js              Base de datos SQLite y migraciones (se aplican solas al arrancar)
backup.js          Backups ZIP por partes (ZIP64) y restauración segura
watermark.js       ffmpeg: marca de agua, MP3, duración y miniaturas
license.js         PDF de la licencia, del registro de autoría y del comprobante de pedido
almacen.js         Almacenamiento externo compatible con S3 (Railway Bucket) para archivos grandes
producerAuth.js    Contraseñas y sesiones de productores
streamAuth.js      Tokens temporales para escuchar
public/            Tienda (index.html, app.js, style.css), tokens.css (design tokens), ui.js (skeletons y accesibilidad), historial.js, verify.html + verify.js, subidas.js, packs.js + packs.css (Sample Packs), terminos/privacidad/denunciar, favicon.svg
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
- Límites: audio 250 MB · WAV 1 GB · STEMS 4 GB · **Sample Pack 20 GB** (ZIP, RAR o 7Z) · portada 8 MB.
- Una subida a medias se guarda **7 días** desde el último trozo (apagones, wifi que se cae por horas). Con archivos de más de 1 GB, el navegador aguanta cortes largos (hasta unos 60 reintentos) antes de pedir que se vuelva a pulsar el botón.
- **Antes** de empezar, el servidor revisa que el archivo quepa en el disco (contando lo que falta de otras subidas). Si no cabe, avisa enseguida en vez de fallar al 90 %. Si el disco se llena a mitad, la subida se detiene con un aviso claro y sigue cuando haya espacio.

## Archivos grandes (packs de hasta 20 GB)

**El problema:** Railway corta cualquier petición a la app a los **15 minutos**. Subir no tiene problema (va por trozos), pero un comprador que descarga 20 GB con 1 MB/s tarda unas 6 horas: por el servidor, la descarga se cortaría. Además, el volumen del plan Hobby es de 5 GB y el del plan Pro empieza en 50 GB.

**La solución: Storage Bucket de Railway** (almacenamiento compatible con S3; 0,015 USD por GB al mes, descargas gratis).
1. En el proyecto de Railway: *New → Bucket*.
2. En el servicio de la app, *Variables*, agrega estas (referenciando las del bucket):
   `S3_ENDPOINT=${{Bucket.ENDPOINT}}` · `S3_BUCKET=${{Bucket.BUCKET}}` · `S3_REGION=${{Bucket.REGION}}` · `S3_ACCESS_KEY_ID=${{Bucket.ACCESS_KEY_ID}}` · `S3_SECRET_ACCESS_KEY=${{Bucket.SECRET_ACCESS_KEY}}` (cambia «Bucket» por el nombre que le diste). Si la pestaña *Credentials* del bucket dice que usa rutas tipo *path-style*, agrega `S3_PATH_STYLE=1`.
3. Redeploy. Desde ese momento:
   - cada pack (y cada STEMS) se sube al servidor como siempre y, en segundo plano, pasa al bucket por partes de 64 MB; después se borra del volumen;
   - los que ya existían pasan solos (la app revisa cada 10 minutos);
   - el comprador y el admin descargan con un **enlace firmado** directo del bucket (válido 6 días), sin el límite de 15 minutos y pudiendo retomar si se corta;
   - al borrar un pack o un beat, su archivo se borra también del bucket.

Sin bucket todo funciona igual, pero los archivos quedan en el volumen y el panel muestra un aviso en *Sample Packs*. El volumen igual tiene que tener espacio para la subida en curso: para packs de 20 GB conviene el plan Pro (50 GB, ampliable).

**Huella y registro:** la huella SHA-256 del pack se calcula en segundo plano (el pack sale como «Procesando» unos minutos, pero ya se puede aprobar y vender). El registro de autoría se crea al subir y la huella del pack se le agrega al terminar; si el pack se borra antes, la huella se calcula igual antes de borrar el archivo.

**Copias de seguridad:** el «Backup completo» del panel no incluye lo que está en el bucket (sería enorme); el bucket es un almacenamiento aparte y duradero.

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
| Pago de retiros (de fábrica, se cambia) | 14 días | 3 días | 24 horas |
| Sample Packs | — | Sí | Sí |

- Los **días para pagar los retiros** de cada plan se cambian en *Productores → Planes, bonos y retiros* (1 = 24 horas, hasta 60). Se ven en la tarjeta del plan y en la cuenta regresiva de los retiros; valen para los retiros que se pidan desde ese momento y el cambio queda anotado en el registro de cada productor del plan.
- El precio de los planes (y de los Hots) se pone en USD y se pasa a CUP con la **«Tasa del USD para los planes»** (Tienda → Tasas de cambio). Esa tasa **no es una forma de pago**: no aparece en la tienda. Si se deja vacía, se usa la tasa del USD o USDT de la lista de monedas.
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

- Vienen listas CUP, MLC, USD, USDT (BEP20), USDT (TRC20), USDT (Polygon) y Saldo Móvil. El administrador puede agregar otras.
- Una moneda aparece para pagar cuando tiene tasa en *Tasas de cambio* (CUP por 1 unidad). Se puede escribir «1.500».
- **Decimales:** CUP y Saldo Móvil van en enteros. Si el admin agrega una cripto como BNB, BTC o ETH, lleva 6 decimales. El resto lleva 2.
- **USDT (BEP20):** por un tiempo esa moneda se llamó «BNB (BEP20)» y el cliente pidió volver a USDT (BEP20). Al arrancar, esta versión deshace ese cambio una sola vez:
  - Las cuentas de cobro vuelven a USDT (BEP20) con la misma dirección, sin repetidas.
  - La tasa se conserva si parece de USDT (menos de 5000 CUP). Si alguien había puesto el precio del BNB, queda en 0 y hay que ponerla de nuevo.
  - Si la tienda nunca tuvo la versión con BNB, no cambia nada.

## Hots (portada)

- Debajo de la presentación de la tienda hay un carrusel de beats destacados que avanza solo de izquierda a derecha. Con dos o más Hots siempre gira: si caben todos en la pantalla, la fila se repite para que el movimiento no tenga fin. Con un solo Hot no hay carrusel ni botón.
- El botón ⏸/▶ pausa y reanuda. Se detiene un momento mientras lo tocas o pasas el mouse. Si el teléfono pide «reducir movimiento», empieza en pausa y se mueve al pulsar ▶. Se puede deslizar con el dedo. Al tocar un beat, suena y se puede comprar. El orden cambia al azar en cada visita.
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

## Sample Packs

Paquetes de sonidos (loops, drums, one-shots, vocales) que se venden en la sección **Sample Packs** de la tienda.

- **Qué lleva cada pack:** el archivo comprimido con los sonidos (ZIP, RAR o 7Z, hasta 4 GB), una demo en MP3 o WAV que es lo que suena en la tienda, una portada, un nombre, el tipo de sonidos, la descripción y **un solo precio**.
- **Quién sube:** el administrador desde *Sample Packs* en el panel (sale directo en la tienda) y los productores con plan **Pro o Studio** desde la pestaña *Sample Packs* del portal (entra en revisión). Los Free ven un aviso con el enlace a *Plan*. El servidor también lo exige.
- **Revisión:** en el panel, los packs pendientes salen primero, con «Escuchar demo», «Descargar pack», «Aprobar» y «Rechazar» (con motivo). Se pueden editar nombre, tipo, descripción y precio; para cambiar archivos se borra y se sube de nuevo.
- **Venta:** licencia «Sample Pack», no exclusiva: se vende cuantas veces se compre. Al aprobar el pago, el comprador descarga el pack en *Mis compras* y recibe la licencia en PDF con sus términos: puede usar los sonidos en sus canciones, incluso monetizadas, sin regalías; no puede revender ni compartir los sonidos. La comisión del productor es la de su plan, igual que con los beats.
- **No se mezclan con los beats:** no salen en el Catálogo, ni en *Mis beats*, ni en la página del productor, no cuentan para el límite de beats del plan ni para los 3 beats de los referidos, y no se pueden poner en Hots.
- Por dentro un pack es una fila de `tracks` con `is_pack = 1`; el archivo comprimido va en `stems_filename` y su precio en `track_licenses` con el tipo `pack`.

## Confianza (productores y compradores)

Para que nadie tenga que confiar a ciegas: pruebas que no se pueden cambiar, todo lo que hace el administrador a la vista y compromisos por escrito.

**Productores**
- **Registro de autoría:** cada beat o pack que sube un productor queda registrado a su nombre con la fecha y la huella SHA-256 de cada archivo (tabla `registros`, código `REG-…`). Descarga su **certificado en PDF** desde *Registro* o desde el botón «Certificado» en *Mis beats* y *Sample Packs*. Cualquiera lo comprueba en `/verify` con el código o con el archivo. El registro **no se borra** aunque se borre el beat. Los beats subidos antes de esta versión se registraron solos al arrancar (con su fecha de subida).
- **Lo que hizo el administrador** (pestaña *Registro* del portal, descargable en CSV): descargas de sus archivos (una vez cada 30 min aunque el navegador baje por partes), cambios de precios o datos con el antes y el después, aprobaciones y rechazos de beats, packs, planes y Hots, borrados, pagos rechazados, pedidos borrados, «borrar todas las ventas», cambios de plan, contraseña, activación, exclusiva, y cada retiro pagado o cancelado.
- `registros` y `actividad` tienen disparadores en la base de datos que impiden modificarlos o borrarlos, y no hay ruta para hacerlo.
- **Pagos con prueba:** al marcar un retiro como pagado, el admin adjunta la captura de la transferencia (si confirma sin captura, la app le avisa y queda anotado «sin captura»). El productor la ve en sus movimientos. Un retiro fuera de plazo sale en rojo con un botón para recordárselo por WhatsApp, y el pago tardío queda anotado.
- El administrador **sí** puede cambiar precios y borrar ventas: la diferencia es que ahora queda anotado y el productor lo ve.
- Los términos (*Productores → Lo que la plataforma se compromete a hacer con tu música*) lo dejan por escrito.

**Compradores**
- **Comprobante de pedido:** al enviar el pago recibe un código `PED-…` y un PDF con lo que compró, el precio, la fecha y el plazo. Se verifica en `/verify` (sin mostrar sus datos personales).
- **Plazo y reclamo:** el admin fija el plazo (Ajustes → *Datos de la tienda y confianza*, 24 h por defecto). En *Mis compras* el comprador ve hasta cuándo; si pasa sin aprobar, o si le rechazaron el pago, puede **reclamar**. El pedido sale en rojo en *Ventas*, aparece el chip «reclamo» en el resumen y el admin lo marca como atendido.
- **Compra con confianza** (bloque antes del pie de la tienda): quién vende y su figura legal (si el admin los pone), cifras calculadas de las ventas reales (compras entregadas, tiempo típico de aprobación de los últimos 90 días, mostrado con 3 aprobaciones o más, productores activos), las garantías y el WhatsApp.

**Límite honesto:** el administrador controla el servidor. La app no puede impedir que alguien con acceso directo a la base de datos haga trampa, pero deja pruebas (certificados en manos del productor, comprobantes en manos del comprador) que no dependen de la plataforma.

## Originalidad y Content ID

El problema: un artista compra una licencia que permite monetizar, sube el tema y le salta un reclamo de Content ID (en YouTube o en el sistema equivalente de cualquier otra plataforma: Rights Manager de Facebook e Instagram, TikTok, SoundCloud, distribuidoras…) porque el beat ya estaba publicado o registrado en otra parte. Para reducirlo, cada audio pasa por una **verificación obligatoria** antes de publicarse:

1. **Huella acústica propia** (Chromaprint, la tecnología de AcoustID; `originalidad.js`). Se compara con todos los beats y packs de la tienda. Detecta el mismo beat subido dos veces aunque esté recortado o reconvertido (similitud ≥ 85 % y ≥ 15 s en común). Gratis y sin conexión.
2. **Reconocimiento externo** con [AudD](https://audd.io) (opcional, recomendado): compara el audio con decenas de millones de canciones publicadas y detecta si el beat ya salió en otro sitio o usa samples conocidos sin aclarar. Se activa poniendo la variable `AUDD_API_TOKEN` (se saca en dashboard.audd.io). Usa unas 5 consultas por beat de 3 minutos; las primeras 300 consultas son gratis y luego cuesta unos 2 USD cada 1 000 (≈ 0,01 USD por beat). Al poner el token, la app revisa sola el catálogo que ya existía, de a poco.
3. **Declaración del productor**: al subir debe decir si el beat ya se publicó (y dónde) y si está registrado en Content ID. Si dice que sí está en Content ID, no se puede subir.

**Cómo se ve:** en *Productores → Beats de productores pendientes* cada beat muestra el resultado («Sin coincidencias», «Coincidencias encontradas» con el beat o la canción y un enlace para escucharla, o «Verificando…»). Si hay coincidencias, «Aprobar» no publica: hay que escribir el motivo y pulsar «Publicar igual», y eso queda anotado en el registro del productor. Los Sample Packs pasan por lo mismo con su demo. En la tienda, los beats verificados llevan la marca «Originalidad verificada».

**Comprobar que funciona:** en *Ajustes → Verificación de originalidad* se ve si AudD está configurado, cuántas obras se verificaron y el último error; el botón «Probar conexión con AudD» le pide reconocer su canción de ejemplo (gasta 1 o 2 consultas). En *Mi música* cada pista muestra su resultado, también las que sube el administrador (esas no se bloquean, pero quedan marcadas).

**Si igual salta un reclamo:** en *Mis compras* el comprador descarga una **carta para impugnar el reclamo** (PDF con su licencia, el código para verificarla y la cláusula que le permite monetizar) y puede **reportarlo**. El reporte aparece en *Productores → Reclamos de Content ID* (y como chip en el resumen), con WhatsApp directo al comprador y al productor; al cerrarlo se escribe cómo se resolvió y el comprador lo ve. Los términos obligan al productor a liberar el reclamo.

**Límite honesto:** ninguna herramienta pública puede consultar las bases privadas de identificación de contenido de las plataformas (Content ID de YouTube, Rights Manager de Meta, etc.). Un beat que el productor registró en Content ID sin publicarlo en ningún sitio no lo detecta nadie desde fuera; para eso están la declaración obligatoria, los términos y las sanciones.

## Reseñas, insignias y antifraude

- **Reseñas verificadas:** solo puede reseñar quien compró (desde *Mis compras*, una por compra). El productor responde desde su portal. El admin no puede editarlas ni borrarlas; puede ocultarlas con motivo (*Productores → Reseñas de compradores*) y queda anotado.
- **Insignias del productor:** «Identidad verificada» (el admin la marca en *Más opciones* después de comprobar quién es), ventas entregadas, nota promedio y antigüedad.
- **Ver el contrato antes de pagar:** cada licencia tiene el botón para descargar el modelo del contrato.
- **Comprobantes repetidos:** el comprador escribe el número de transacción. Si ese número o la misma imagen ya se usaron en otro pedido, el pedido sale marcado en *Ventas* y al aprobar la app avisa.

## Productores pendientes y activos

En *Productores* hay dos botones: **Productores pendientes** (se registraron y esperan aprobación) y **Productores activos** (ya aprobados; los desactivados salen con su etiqueta). Cada botón muestra cuántos hay.

## Cobro automático con QvaPay

El artista paga con su saldo QvaPay y la licencia se entrega sola, sin comprobante ni aprobación manual.

**Activarlo**
1. En QvaPay (cuenta de negocio con la verificación KYC completa) crea una app en *Mis aplicaciones* con:
   - URL Callback (Webhook): `https://TU-DOMINIO/api/pagos/qvapay/webhook`
   - URL de Éxito: `https://TU-DOMINIO/?pago=ok`
   - URL de Cancelación: `https://TU-DOMINIO/?pago=cancelado`
2. Copia el **App ID** y el **App Secret** (el secret se muestra una sola vez) y ponlos en Railway como `QVAPAY_APP_ID` y `QVAPAY_APP_SECRET`.
3. En el panel, *Tienda → Tasas de cambio*, agrega el método **QvaPay** con su tasa (CUP por 1 USD) y guarda. Debajo de la lista aparece «QvaPay: cobro automático activo».

**Cómo funciona**
- En la tienda, con «Ver precios en: QvaPay», el modal de compra no pide comprobante ni número de transacción: el botón «Pagar con QvaPay» crea la factura y abre QvaPay.
- QvaPay avisa al webhook cuando se paga. La app solo acepta avisos con la firma correcta (HMAC-SHA256 del cuerpo con el App Secret, cabecera `x-qvapay-signature`) y de menos de 5 minutos (`x-qvapay-timestamp`). Avisos repetidos no hacen nada.
- Al confirmarse, el pedido se aprueba solo: licencia, descargas en *Mis compras* y saldo del productor en su billetera **QvaPay** (menos la comisión de su plan), que retira como cualquier otra moneda.
- Si el importe pagado es menor, o la licencia única ya se la llevó otro artista, el pedido queda en *Ventas* marcado «Pagado con QvaPay» con el motivo, para resolverlo a mano (entregar o devolver).
- Los pedidos sin pagar no aparecen en *Ventas*; la factura vence a las 24 horas y el pedido se borra a los 3 días. El artista puede completar el pago desde *Mis compras*.
- QvaPay permite 5 cobros cada 20 segundos por app: si responde que hay demasiadas peticiones, la app reintenta sola.
- Sin las dos variables, o sin el método QvaPay en Tasas de cambio, la tienda funciona igual que antes (pago con comprobante).

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

- **Billetera por moneda:** al aprobar un comprobante, lo que pagó el comprador **en su moneda** (con la tasa del momento de la compra y el descuento de promoción si había) se suma a la billetera del productor en esa misma moneda, menos la comisión de su plan al aprobar. Ejemplo: pagó 10 USDT y el productor es Pro (20 %) → 8 USDT a su billetera en USDT. Si la moneda no tenía tasa, va a la billetera en CUP. Las compras anteriores a este cambio quedan en CUP.
- Los bonos (referidos y me gusta en Playlist para Studio) van a la billetera en CUP y se retiran en CUP.
- **Referidos:** los mínimos son los mismos para todos los productores: haber ganado al menos **500 CUP** vendiendo sus beats (ya sin la comisión) y tener al menos **3 beats** aprobados en el catálogo (la Playlist no cuenta).
  - Un invitado **cuenta** como referido cuando el administrador lo aprueba y él cumple los mínimos. Cada cierta cantidad de referidos que cuentan, quien lo invitó gana un bono en CUP.
  - Quien invita solo **cobra** sus bonos cuando él también cumple los mínimos. Mientras tanto se le guardan y se le suman juntos al cumplir.
  - En su portal ve qué le falta a él y a cada invitado. No ve cuánto vendió cada uno, solo si le falta vender o subir beats.
  - Los dos mínimos se cambian en *Planes, bonos y retiros*.
- **El saldo es un libro de movimientos** por billetera: ventas aprobadas + bonos − planes pagados con saldo − retiros (en curso o pagados). Un retiro cancelado no descuenta nada, así que el dinero vuelve solo.
- **Saldo a retirar:** la tarjeta muestra una plaquita por cada moneda en que pagaron los compradores (ej. «1220 CUP» y «8,00 USDT (BEP20)»).
- **Sin conversión:** cada saldo se cobra **en su misma moneda**. Si un comprador pagó con PayPal, el productor cobra ese saldo en PayPal; si no tiene esa forma de cobro, la agrega en su Perfil (el administrador no convierte monedas). En el retiro solo elige el **saldo a retirar** y el monto.
- **Fee de red:** en *Planes, bonos y retiros* el administrador pone el fee de cada moneda que cuesta enviar (USDT BEP20, TRC20…); se descuenta de lo que retira el productor.
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

### Movimiento

Cuatro efectos, todos en `public/ui.js` + el final de `public/tokens.css` (se ajustan con `--t-cross`, `--t-viaje`, `--blur-fondo`, `--blur-foco`):

- **Crossfade** — al cambiar de sección (tienda), pestaña (portal) o categoría (admin) lo viejo se desvanece mientras entra lo nuevo: `ZBUI.transicion(fn)`.
- **Elemento compartido** — en Productores, el nombre y la foto viajan de la tarjeta a la página del productor y de vuelta: `ZBUI.viaje(origen, fn, destino)`.
- **Lupa** — los íconos de redes crecen según se acerca el cursor. Vale para cualquier contenedor con `data-lupa`. Solo con ratón.
- **Desenfoque** — con una ventana abierta el fondo se desenfoca; al señalar una tarjeta (catálogo, productores, Hots) las demás se apartan.

Con «reducir movimiento» activado en el sistema, o en navegadores sin View Transitions (Firefox viejo), los cambios se hacen directos, sin animación: nada deja de funcionar.

## Legal

- **`/terminos`** y **`/privacidad`**: páginas fijas (`public/terminos.html`, `public/privacidad.html`), enlazadas desde el pie de la tienda. Son un texto base: el dueño debe leerlo y ajustarlo a cómo opera de verdad (devoluciones, comisiones, contacto).
- **Aceptación**: para registrarse, el productor marca que acepta los términos; el servidor lo exige y guarda la fecha (`producers.terms_accepted_at`).
- **Declaración de autoría**: en cada subida el productor marca que el beat es suyo; el servidor lo exige y guarda la fecha (`tracks.authorship_declared_at`). Los beats que sube el admin no la piden.
- **`/denunciar`**: formulario público de derechos de autor (máx. 5 por hora por conexión). Llegan al panel en Productores → «Denuncias de derechos de autor», donde se marcan resueltas o se borran. Retirar el beat se hace a mano desde la lista del productor.

## Verificar licencias y archivos

En `/verify` cualquiera puede comprobar:
- un número de licencia o su hash;
- un archivo de audio, WAV o STEMS (la huella SHA-256 se calcula en el propio dispositivo, por partes, aunque pese GB);
- el **PDF de la licencia**: se lee el número y el hash impresos y se avisa si el PDF fue modificado.

## Reiniciar ventas

En *Ventas → Resumen → Reiniciar ventas*:
- **Reiniciar contador:** «Este mes» y «Desde el inicio» empiezan de cero desde ese momento. No se borra nada, y «Volver a contar todo» lo deshace.
- **Borrar todas las ventas (de prueba):** hay que escribir BORRAR.
  - Se borran todas las ventas e ingresos: comprobantes, licencias, bonos, retiros y pagos a productores. Los saldos quedan en 0.
  - Los beats vendidos en exclusiva o ilimitada vuelven al catálogo.
  - Productores, beats, planes y Hots no se tocan.
  - Antes, el servidor guarda una copia completa de la base de datos en el Volume (`db/respaldo-antes-de-borrar-ventas-FECHA.db`). Igual conviene descargar un *Backup de datos* antes.

## Copias de seguridad

En *Ajustes → Copias de seguridad*:
- **Backup de datos**: base de datos (ventas, licencias, productores, saldos), portadas, fotos, comprobantes y marca de agua. Pesa poco: descárgalo seguido.
- **Backup completo**: además previews, audios originales, WAV y STEMS. Puede pesar varios GB; con conexión lenta la descarga puede cortarse, así que para los audios activa también los backups del Volume en Railway.
- **Restaurar**: el ZIP se sube por partes, se extrae entero a una carpeta aparte, se comprueba la base de datos y recién entonces se reemplazan los datos (con vuelta atrás si algo falla). Uno de *datos* deja los audios que ya están en el servidor. Después el servidor se reinicia solo.

## Protección del audio

Ninguna web puede impedir que alguien grabe lo que suena por los parlantes. Lo que sí hace la app: previews MP3 de 192 kbps (livianos, nunca el archivo original), acceso con tokens temporales, marca de agua de voz en los previews de productores Free, y el menú de «guardar» bloqueado sobre portadas y reproductor (no en campos de texto ni enlaces).

## Seguridad

**Variables de entorno** (Railway > Variables; detalle en `.env.example`):

| Variable | Para qué | Por defecto |
|---|---|---|
| `ADMIN_PASSWORD` | Contraseña del panel. **Obligatoria**: sin ella, o con la de ejemplo, el panel queda bloqueado | — |
| `ADMIN_SESSION_SECRET` | Firma de la sesión del panel | se genera sola |
| `ALLOWED_ORIGINS` | Otros dominios que pueden usar la API desde el navegador (CORS) | solo el propio |
| `RATE_LIMIT_API_PER_MIN` | Pedidos por minuto y por conexión antes de frenar | 1200 |
| `MAX_CONNECTIONS` | Conexiones simultáneas máximas | sin límite |

**Contra que tumben la app:**
- Freno general de pedidos por conexión, además de los límites propios de inicio de sesión, registro, compras, comprobantes, me gusta y reproducciones.
- Las cabeceras de un pedido tienen que llegar en 30 segundos, para que nadie cuelgue el servidor con conexiones lentísimas.
- Límite de tamaño en cada pedido. Un error inesperado se registra y no apaga el servidor.

**CORS y pedidos falsos:** la API no da permisos a otros sitios, salvo los de `ALLOWED_ORIGINS`. Un pedido que cambia datos (comprar, retirar, aprobar, borrar…) desde otra página se rechaza aunque la persona tenga la sesión abierta.

**Cabeceras:**
- **CSP:** el navegador solo ejecuta scripts del propio dominio, así un script colado en un texto no corre.
- **HSTS:** con HTTPS el navegador siempre usa la versión segura.
- Tampoco se puede meter la app en un iframe ajeno ni usar sus audios y portadas desde otro sitio.

**Seguridad por fila (lo que en Supabase se llama RLS):** esta app usa SQLite, que no tiene RLS. Hace lo equivalente en el servidor:
- Cada consulta del portal filtra por el productor que tiene la sesión: nadie ve ni toca los beats, el dinero, los Hots, los historiales o las subidas de otro.
- Todas las rutas del panel piden la sesión del admin.
- Las rutas públicas no devuelven correos, teléfonos, contraseñas ni archivos originales.
- Hay pruebas automáticas que lo comprueban.

- Todo texto que escriben compradores y productores (nombres, títulos, redes, motivos) se muestra escapado, también dentro de atributos, así que no se puede meter código en la tienda, el portal ni el panel.
- El precio que sale en la licencia y en la verificación lo calcula el servidor; el comprador no lo puede cambiar. El PDF de la licencia pasa a Latin-1 los caracteres que no entran (emojis y otros alfabetos quedan como «?»), así el texto no se puede alterar.
- Me gusta: hasta 20 por canción por conexión al día (dan dinero con el bono Studio). No es 1 por IP porque en Cuba mucha gente comparte la IP de la operadora.
- Hots por transferencia: un pedido en revisión por productor, para que nadie aparte todos los cupos con comprobantes falsos.
- El límite de beats del plan se vuelve a comprobar justo antes de guardar, así no se pasa con subidas en paralelo.

- Contraseña del panel obligatoria en producción; la sesión se firma con un secreto guardado y se invalida si cambias la contraseña.
- Intentos de inicio de sesión limitados (solo cuentan los fallidos, por el NAT de las operadoras).
- Cookies `HttpOnly` + `SameSite=Lax` (+ `Secure` con HTTPS), cabeceras de seguridad, IP real tomada del último `X-Forwarded-For`.
- Los productores pueden cambiar su contraseña; si la olvidan, el administrador les pone una nueva (se cierran sus sesiones).

## Limitaciones conocidas

- El pago es manual (transferencia + comprobante): no hay pasarela automática.
- No hay envío de correos: los avisos van por WhatsApp con mensajes ya escritos.
- Un backup completo de muchos GB puede no terminar de descargarse con conexión lenta (Railway corta las peticiones largas).
