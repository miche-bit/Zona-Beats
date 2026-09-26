// Subidas por trozos de 4 MB que se pueden retomar si se corta la conexión.
// Railway corta cualquier petición cuyo cuerpo tarde más de 5 minutos en subir; con los datos
// móviles un WAV o unos STEMS no entran en ese tiempo, por eso cada archivo va en trozos.
// Lo usan el panel de administración y el portal de productores.
(function () {
  'use strict';

  var CLAVE = 'zb_subidas_v1';
  var TROZO_DEFECTO = 4 * 1024 * 1024;
  var LIMITES = {
    audio: 250 * 1024 * 1024,
    wav: 1024 * 1024 * 1024,
    stems: 4 * 1024 * 1024 * 1024,
    cover: 8 * 1024 * 1024,
  };

  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function leerMapa() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { return {}; }
  }
  function guardarMapa(m) {
    try { localStorage.setItem(CLAVE, JSON.stringify(m)); } catch (e) { /* sin almacenamiento: solo se retoma sin recargar */ }
  }
  function huella(kind, file) { return [kind, file.name, file.size, file.lastModified || 0].join('|'); }
  function recordar(kind, file, id) {
    var m = leerMapa();
    var ahora = Date.now();
    Object.keys(m).forEach(function (k) { if (!m[k] || ahora - (m[k].t || 0) > 40 * 3600 * 1000) delete m[k]; });
    m[huella(kind, file)] = { id: id, t: ahora };
    guardarMapa(m);
  }
  function olvidar(kind, file) {
    var m = leerMapa();
    delete m[huella(kind, file)];
    guardarMapa(m);
  }

  function errorSubida(mensaje, status) {
    var e = new Error(mensaje);
    e.status = status || 0;
    e.subida = true;
    return e;
  }

  function tamano(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1024 * 1024 * 1024) return (Math.round(n / 1024 / 1024 / 1024 * 10) / 10).toLocaleString('es') + ' GB';
    if (n >= 1024 * 1024) return (Math.round(n / 1024 / 1024 * 10) / 10).toLocaleString('es') + ' MB';
    return Math.max(1, Math.round(n / 1024)) + ' KB';
  }

  // Cada página dice para quién sube (window.ZB_PANEL = 'admin' | 'productor').
  function cabeceraPanel(extra) {
    var h = Object.assign({}, extra || {});
    if (window.ZB_PANEL) h['X-Panel'] = window.ZB_PANEL;
    return h;
  }

  function pedirJSON(url, opciones) {
    var op = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, opciones || {});
    op.headers = cabeceraPanel(op.headers);
    return fetch(url, op).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data || {} }; });
    });
  }

  // Un trozo va por XHR para poder mostrar el avance dentro del trozo.
  function enviarTrozo(url, blob, alAvanzar, senal) {
    return new Promise(function (resolve, reject) {
      if (senal && senal.aborted) { reject(errorSubida('Subida pausada.', -1)); return; }
      var xhr = new XMLHttpRequest();
      var alAbortar = function () { xhr.abort(); };
      var terminar = function (resultado) {
        if (senal) senal.removeEventListener('abort', alAbortar);
        resolve(resultado);
      };
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      if (window.ZB_PANEL) xhr.setRequestHeader('X-Panel', window.ZB_PANEL);
      xhr.timeout = 3 * 60 * 1000;
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && alAvanzar) alAvanzar(e.loaded); };
      xhr.onload = function () {
        var d = {};
        try { d = JSON.parse(xhr.responseText); } catch (e) { d = {}; }
        terminar({ status: xhr.status, data: d || {} });
      };
      xhr.onerror = function () { terminar({ status: 0, data: {} }); };
      xhr.ontimeout = function () { terminar({ status: 0, data: {} }); };
      xhr.onabort = function () {
        if (senal) senal.removeEventListener('abort', alAbortar);
        reject(errorSubida('Subida pausada.', -1));
      };
      if (senal) senal.addEventListener('abort', alAbortar);
      xhr.send(blob);
    });
  }

  function validarTamano(kind, file) {
    var max = LIMITES[kind];
    if (!file || !file.size) return 'El archivo ' + (file ? '«' + file.name + '» ' : '') + 'está vacío.';
    if (max && file.size > max) return '«' + file.name + '» pesa ' + tamano(file.size) + ' y el máximo es ' + tamano(max) + '.';
    return '';
  }

  // Sube un archivo y devuelve el id de la subida. Si el mismo archivo ya se había empezado a
  // subir (aunque se haya recargado la página), sigue desde donde quedó.
  async function subirArchivo(kind, file, opciones) {
    var op = opciones || {};
    var avisar = function (n) { if (op.alAvanzar) op.alAvanzar(Math.min(n, file.size), file.size); };
    var guardado = leerMapa()[huella(kind, file)];
    var id = null;
    var recibido = 0;
    var trozo = TROZO_DEFECTO;

    if (guardado && guardado.id) {
      try {
        var prev = await pedirJSON('/api/uploads/' + encodeURIComponent(guardado.id));
        if (prev.res.status === 401) throw errorSubida(prev.data.error || 'Tu sesión expiró. Vuelve a entrar.', 401);
        if (prev.res.ok && prev.data.size === file.size && prev.data.kind === kind) {
          id = prev.data.id; recibido = prev.data.received || 0; trozo = prev.data.chunkSize || trozo;
        }
      } catch (e) {
        if (e.subida) throw e;
      }
    }
    if (!id) {
      var nuevo;
      try {
        nuevo = await pedirJSON('/api/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: kind, name: file.name, size: file.size }),
        });
      } catch (e) {
        throw errorSubida('Sin conexión. Revisa tu internet e intenta de nuevo.', 0);
      }
      if (!nuevo.res.ok) throw errorSubida(nuevo.data.error || ('No se pudo empezar a subir (código ' + nuevo.res.status + ').'), nuevo.res.status);
      id = nuevo.data.id; recibido = nuevo.data.received || 0; trozo = nuevo.data.chunkSize || trozo;
      recordar(kind, file, id);
    }
    avisar(recibido);

    var fallos = 0;
    var ocupado = 0;
    var maxTrozo = trozo;
    var rapidos = 0;
    while (recibido < file.size) {
      if (op.senal && op.senal.aborted) throw errorSubida('Subida pausada.', -1);
      var desde = recibido;
      var hasta = Math.min(file.size, desde + trozo);
      var inicio = Date.now();
      var r = await enviarTrozo('/api/uploads/' + id + '/chunk?offset=' + desde, file.slice(desde, hasta), function (n) { avisar(desde + n); }, op.senal);
      if (r.status === 200 && typeof r.data.received === 'number') {
        recibido = r.data.received; fallos = 0; ocupado = 0;
        // con buena conexión se vuelve a trozos grandes
        if (Date.now() - inicio < 30000) { rapidos++; if (rapidos >= 3 && trozo < maxTrozo) { trozo = Math.min(maxTrozo, trozo * 2); rapidos = 0; } }
        else rapidos = 0;
        avisar(recibido);
        continue;
      }
      if (r.status === 409 && typeof r.data.received === 'number') {
        recibido = r.data.received;
        if (r.data.busy) {
          ocupado++;
          if (ocupado > 40) throw errorSubida('El servidor sigue ocupado con este archivo. Espera un minuto y vuelve a pulsar el botón.', 409);
          await esperar(1500);
        }
        continue;
      }
      if (r.status === 401) throw errorSubida('Tu sesión expiró. Vuelve a entrar y pulsa el botón otra vez: la subida sigue donde quedó.', 401);
      if (r.status === 404) {
        olvidar(kind, file);
        throw errorSubida(r.data.error || 'La subida se perdió en el servidor. Vuelve a intentarlo.', 404);
      }
      if (r.status === 413) throw errorSubida(r.data.error || 'El servidor no aceptó el tamaño del trozo.', 413);
      // sin conexión, tiempo agotado, error del servidor o trozo incompleto: se espera y se reintenta.
      // Con conexión lenta el trozo se achica (hasta 256 KB) para que cada parte llegue a tiempo.
      if (r.status === 0 || r.status === 400) { trozo = Math.max(256 * 1024, Math.floor(trozo / 2)); rapidos = 0; }
      fallos++;
      if (fallos > 8) throw errorSubida('Se cortó la conexión varias veces. Revisa tu internet y vuelve a pulsar el botón: la subida sigue donde quedó.', 0);
      if (op.alReintentar) op.alReintentar(fallos);
      await esperar(Math.min(30000, 1500 * Math.pow(2, fallos - 1)));
      if (op.senal && op.senal.aborted) throw errorSubida('Subida pausada.', -1);
      try {
        var estado = await pedirJSON('/api/uploads/' + id);
        if (estado.res.ok && typeof estado.data.received === 'number') recibido = estado.data.received;
        else if (estado.res.status === 404) { olvidar(kind, file); throw errorSubida('La subida se perdió en el servidor. Vuelve a intentarlo.', 404); }
        else if (estado.res.status === 401) throw errorSubida('Tu sesión expiró. Vuelve a entrar y pulsa el botón otra vez: la subida sigue donde quedó.', 401);
      } catch (e) {
        if (e.subida) throw e;
      }
    }
    return id;
  }

  // Sube varios archivos uno detrás de otro con un solo porcentaje total.
  // lista: [{ kind, file, etiqueta }]. Devuelve { audio: id, cover: id, ... }.
  async function subirVarios(lista, opciones) {
    var op = opciones || {};
    var total = lista.reduce(function (s, x) { return s + x.file.size; }, 0) || 1;
    var hechos = 0;
    var ids = {};
    var bloqueo = null;
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) bloqueo = await navigator.wakeLock.request('screen');
    } catch (e) { bloqueo = null; }
    try {
      for (var i = 0; i < lista.length; i++) {
        var item = lista[i];
        ids[item.kind] = await subirArchivo(item.kind, item.file, {
          senal: op.senal,
          alAvanzar: (function (it) {
            return function (n) {
              if (!op.alAvanzar) return;
              var enviado = hechos + n;
              op.alAvanzar({ etiqueta: it.etiqueta, pct: Math.min(100, Math.floor((enviado / total) * 100)), enviado: enviado, total: total });
            };
          })(item),
          alReintentar: (function (it) {
            return function (f) { if (op.alReintentar) op.alReintentar(it.etiqueta, f); };
          })(item),
        });
        hechos += item.file.size;
      }
    } finally {
      try { if (bloqueo) bloqueo.release(); } catch (e) { /* nada */ }
    }
    return ids;
  }

  function leerBlob(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsArrayBuffer(blob);
    });
  }

  // Calidad de un MP3 (kbps) leyendo solo el principio del archivo. 0 si no se pudo leer.
  function kbpsDeTramas(buf, totalBytes) {
    var BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    var BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    var SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
    for (var i = 0; i < buf.length - 4; i++) {
      if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
      var version = (buf[i + 1] >> 3) & 3;
      var layer = (buf[i + 1] >> 1) & 3;
      var brIdx = (buf[i + 2] >> 4) & 15;
      var srIdx = (buf[i + 2] >> 2) & 3;
      if (version === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) continue;
      var kbps = (version === 3 ? BR1 : BR2)[brIdx];
      var sampleRate = SR[version][srIdx];
      var mono = ((buf[i + 3] >> 6) & 3) === 3;
      var x = i + 4 + (version === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17));
      if (x + 12 <= buf.length && buf[x] === 0x58 && buf[x + 1] === 0x69 && buf[x + 2] === 0x6e && buf[x + 3] === 0x67) {
        var flags = ((buf[x + 4] << 24) | (buf[x + 5] << 16) | (buf[x + 6] << 8) | buf[x + 7]) >>> 0;
        if (flags & 1) {
          var frames = ((buf[x + 8] << 24) | (buf[x + 9] << 16) | (buf[x + 10] << 8) | buf[x + 11]) >>> 0;
          var segundos = frames * (version === 3 ? 1152 : 576) / sampleRate;
          if (segundos > 0) return Math.round((totalBytes * 8) / segundos / 1000);
        }
      }
      return kbps;
    }
    return 0;
  }

  async function kbpsMp3(file) {
    try {
      var cab = new Uint8Array(await leerBlob(file.slice(0, 10)));
      var inicio = 0;
      if (cab.length === 10 && cab[0] === 0x49 && cab[1] === 0x44 && cab[2] === 0x33) {
        inicio = 10 + (((cab[6] & 0x7f) << 21) | ((cab[7] & 0x7f) << 14) | ((cab[8] & 0x7f) << 7) | (cab[9] & 0x7f));
      }
      var buf = new Uint8Array(await leerBlob(file.slice(inicio, inicio + 128 * 1024)));
      return kbpsDeTramas(buf, Math.max(0, file.size - inicio));
    } catch (e) {
      return 0;
    }
  }

  // Mide una imagen (para avisar si la portada no es cuadrada).
  function medirImagen(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ w: img.naturalWidth, h: img.naturalHeight, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  // Reduce una foto (comprobantes) a ~1600 px en JPG: con datos móviles sube en segundos
  // y sigue siendo legible. Si algo falla, devuelve el archivo original.
  function comprimirImagen(file, maxLado, calidad) {
    maxLado = maxLado || 1600;
    calidad = calidad || 0.82;
    return new Promise(function (resolve) {
      if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '') || file.size < 300 * 1024) { resolve(file); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
          var w = Math.max(1, Math.round(img.naturalWidth * escala));
          var h = Math.max(1, Math.round(img.naturalHeight * escala));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) {
            URL.revokeObjectURL(url);
            if (!blob || blob.size >= file.size) { resolve(file); return; }
            var nombre = String(file.name || 'comprobante').replace(/\.[^.]+$/, '') + '.jpg';
            try { resolve(new File([blob], nombre, { type: 'image/jpeg' })); }
            catch (e) { blob.name = nombre; resolve(blob); }
          }, 'image/jpeg', calidad);
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(file);
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // Igual que en el servidor: entiende "10.000", "1.500,50", "2,000" y "12,5".
  function precio(valor) {
    var t = String(valor == null ? '' : valor).trim().replace(/\s/g, '').replace(/[^0-9.,-]/g, '');
    if (!t) return 0;
    var punto = t.indexOf('.') !== -1, coma = t.indexOf(',') !== -1;
    if (punto && coma) {
      if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
      else t = t.replace(/,/g, '');
    } else if (coma) {
      t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
    } else if (punto) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    }
    var n = parseFloat(t);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(Math.round(n * 100) / 100, 1e9);
  }

  window.ZBSubidas = {
    precio: precio,
    subirArchivo: subirArchivo,
    subirVarios: subirVarios,
    olvidar: olvidar,
    validarTamano: validarTamano,
    tamano: tamano,
    kbpsMp3: kbpsMp3,
    medirImagen: medirImagen,
    comprimirImagen: comprimirImagen,
    LIMITES: LIMITES,
  };
})();
