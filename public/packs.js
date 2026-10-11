// Sample Packs: formulario de subida y lista de packs.
// Lo usan el panel de administración (modo 'admin') y el portal de productores (modo 'productor').
// Cada pack lleva una demo para escuchar, una portada y el archivo comprimido que recibe el comprador.
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const extDe = (f) => (String((f && f.name) || '').toLowerCase().match(/\.[a-z0-9]+$/) || [''])[0];
  const ESTADOS = {
    pending: { texto: 'En revisión', clase: 'pending' },
    approved: { texto: 'En la tienda', clase: 'approved' },
    rejected: { texto: 'Rechazado', clase: 'rejected' },
  };
  const ETIQUETAS = {
    pack: 'ZIP, RAR o 7Z con los sonidos · máx 20 GB',
    audio: 'MP3 o WAV con una muestra de los sonidos · máx 250 MB',
    cover: 'Cuadrada · JPG, PNG o WEBP · máx 8 MB',
  };
  const FORMATOS = { pack: ['.zip', '.rar', '.7z'], audio: ['.mp3', '.wav'], cover: ['.jpg', '.jpeg', '.png', '.webp'] };

  function fechaCorta(f) {
    return window.ZBHistorial ? window.ZBHistorial.fechaHora(f) : String(f || '');
  }

  function montar(op) {
    const admin = op.modo === 'admin';
    const API = admin ? '/api/admin/packs' : '/api/producer/packs';
    const aviso = op.aviso || function () {};
    const Z = window.ZBSubidas;
    let subiendo = false;
    let control = null;

    // ---------- Formulario ----------
    op.form.innerHTML = `
      <form class="pk-form" novalidate>
        <div class="upload-grid">
          <div class="upload-col">
            <div class="field">
              <label for="pk-title">Nombre del pack</label>
              <input type="text" id="pk-title" maxlength="120" placeholder="Ej: Dembow Drums Vol. 1" autocomplete="off">
            </div>
            <div class="field">
              <label for="pk-genre">Tipo de sonidos</label>
              <input type="text" id="pk-genre" maxlength="60" placeholder="Drums, loops, vocales, one-shots…" autocomplete="off">
            </div>
            <div class="field">
              <label for="pk-desc">Qué trae el pack</label>
              <textarea id="pk-desc" rows="4" maxlength="1000" placeholder="Cantidad de sonidos, BPM, tonalidades, formato (WAV 24 bit)… El público lo lee al tocar «Descripción»."></textarea>
            </div>
            <div class="field">
              <label for="pk-price">Precio — CUP</label>
              <input type="text" id="pk-price" inputmode="decimal" placeholder="Ej: 1500" autocomplete="off">
              <span class="field-hint">Un solo precio. El pack se puede vender a muchas personas.</span>
            </div>
          </div>
          <div class="upload-col">
            ${['pack', 'audio', 'cover'].map((k) => `
            <div class="field">
              <label for="pk-${k}">${k === 'pack' ? 'Archivo del pack' : k === 'audio' ? 'Demo para escuchar' : 'Portada'} <span class="req-tag">obligatorio</span></label>
              <label class="file-drop" data-drop="${k}">
                <span class="pk-drop-label">${ETIQUETAS[k]}</span>
                <input type="file" id="pk-${k}" accept="${FORMATOS[k].join(',')}">
              </label>
              ${k === 'audio' ? '<span class="field-hint">Es lo que suena en la tienda. El comprador recibe el archivo del pack.</span>' : ''}
            </div>`).join('')}
          </div>
        </div>
        ${admin ? '' : `
        <label class="checkbox-label legal-accept" for="pk-autoria">
          <input type="checkbox" id="pk-autoria">
          <span>Declaro que los sonidos de este pack son míos o tengo derecho a venderlos, y que no contienen samples de terceros sin permiso. <a href="/terminos" target="_blank" rel="noopener">Ver términos</a></span>
        </label>`}
        <div class="upload-progress-wrap pk-progress" hidden>
          <div class="upload-progress-track"><div class="upload-progress-fill pk-fill"></div></div>
          <div class="upload-progress-row">
            <div class="upload-progress-label pk-progress-label" role="status" aria-live="polite">Subiendo… 0%</div>
            <button type="button" class="pk-pausar btn-link">Pausar</button>
          </div>
          <p class="panel-hint compact">Si se corta la conexión, la subida sigue sola. Si cierras la página, vuelve a elegir los mismos archivos y pulsa el botón: sigue donde quedó (hasta 7 días). Con packs grandes deja la pantalla encendida.</p>
        </div>
        <button type="submit" class="btn-primary pk-enviar">${admin ? 'Publicar pack' : 'Enviar a revisión'}</button>
      </form>`;

    const form = op.form.querySelector('.pk-form');
    const $f = (sel) => form.querySelector(sel);
    const inputs = { pack: $f('#pk-pack'), audio: $f('#pk-audio'), cover: $f('#pk-cover') };
    Object.keys(inputs).forEach((k) => {
      const inp = inputs[k];
      const drop = form.querySelector('[data-drop="' + k + '"]');
      inp.addEventListener('change', () => {
        const f = inp.files[0];
        drop.querySelector('.pk-drop-label').textContent = f ? f.name + ' · ' + (Z ? Z.tamano(f.size) : '') : ETIQUETAS[k];
        drop.classList.toggle('has-file', Boolean(f));
      });
    });
    function limpiarForm() {
      form.reset();
      Object.keys(inputs).forEach((k) => {
        const drop = form.querySelector('[data-drop="' + k + '"]');
        drop.classList.remove('has-file');
        drop.querySelector('.pk-drop-label').textContent = ETIQUETAS[k];
      });
    }
    function progreso(pct, texto) {
      if (pct != null) $f('.pk-fill').style.width = pct + '%';
      $f('.pk-progress-label').textContent = texto;
    }
    $f('.pk-pausar').addEventListener('click', () => { if (control) control.abort(); });
    window.addEventListener('beforeunload', (e) => { if (subiendo) { e.preventDefault(); e.returnValue = ''; } });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (subiendo) return;
      const titulo = $f('#pk-title').value.trim();
      const precio = $f('#pk-price').value.trim();
      const falta = (el, msg) => { aviso(msg, true); el.focus(); };
      if (!titulo) return falta($f('#pk-title'), 'Ponle nombre al pack.');
      if (!(Z && Z.precio(precio) > 0)) return falta($f('#pk-price'), 'Ponle precio al pack.');
      for (const k of ['pack', 'audio', 'cover']) {
        const f = inputs[k].files[0];
        const nombre = k === 'pack' ? 'el archivo del pack' : k === 'audio' ? 'la demo' : 'la portada';
        if (!f) return falta(inputs[k], 'Falta ' + nombre + '.');
        if (!FORMATOS[k].includes(extDe(f))) return falta(inputs[k], 'Formato no permitido para ' + nombre + '. Usa: ' + FORMATOS[k].join(', ').replace(/\./g, '').toUpperCase() + '.');
        const malo = Z.validarTamano(k, f);
        if (malo) return falta(inputs[k], malo);
      }
      if (!admin && !$f('#pk-autoria').checked) return falta($f('#pk-autoria'), 'Marca la casilla donde declaras que los sonidos son tuyos.');

      const lista = [
        { kind: 'cover', file: inputs.cover.files[0], etiqueta: 'la portada' },
        { kind: 'audio', file: inputs.audio.files[0], etiqueta: 'la demo' },
        { kind: 'pack', file: inputs.pack.files[0], etiqueta: 'el pack' },
      ];
      subiendo = true;
      control = new AbortController();
      $f('.pk-enviar').disabled = true;
      $f('.pk-progress').hidden = false;
      $f('.pk-pausar').hidden = false;
      progreso(0, 'Preparando…');
      try {
        const ids = await Z.subirVarios(lista, {
          senal: control.signal,
          alAvanzar: (p) => progreso(p.pct, 'Subiendo ' + p.etiqueta + '… ' + p.pct + '% (' + Z.tamano(p.enviado) + ' de ' + Z.tamano(p.total) + ')'),
          alReintentar: (etiqueta, n) => progreso(null, 'Se cortó la conexión. Reintentando ' + etiqueta + ' (intento ' + n + ')…'),
        });
        $f('.pk-pausar').hidden = true;
        progreso(100, 'Procesando la demo…');
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: titulo, genre: $f('#pk-genre').value, description: $f('#pk-desc').value, price: precio,
            audioUploadId: ids.audio, coverUploadId: ids.cover, packUploadId: ids.pack,
            declaraAutoria: admin ? undefined : $f('#pk-autoria').checked,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) {
          lista.forEach((x) => Z.olvidar(x.kind, x.file));
          aviso(admin ? 'Pack publicado en la tienda.' : 'Pack enviado a revisión. Aparecerá en la tienda cuando el administrador lo apruebe.');
          limpiarForm();
          cargar();
        } else if (res.status === 401) {
          aviso('Tu sesión expiró. Vuelve a entrar: los archivos ya subidos no se pierden.', true);
          if (op.sesionVencida) op.sesionVencida();
        } else {
          aviso(d.error || 'No se pudo guardar el pack (código ' + res.status + ').', true);
        }
      } catch (err) {
        if (err && err.status === -1) aviso('Subida pausada. Si eliges los mismos archivos y pulsas el botón, sigue donde quedó.');
        else if (err && err.status === 401) { aviso(err.message, true); if (op.sesionVencida) op.sesionVencida(); }
        else aviso((err && err.message) || 'No se pudo subir. Intenta de nuevo.', true);
      } finally {
        subiendo = false;
        control = null;
        $f('.pk-enviar').disabled = false;
        $f('.pk-progress').hidden = true;
      }
    });

    // ---------- Lista ----------
    async function cargar() {
      if (window.ZBUI && !op.lista.querySelector('.pk-item')) ZBUI.mostrarSkeleton(op.lista, 'lineas', 2);
      let d;
      try {
        const res = await fetch(API, { cache: 'no-store' });
        if (res.status === 401) { if (op.sesionVencida) op.sesionVencida(); return; }
        d = await res.json();
        if (!res.ok) throw new Error(d.error);
      } catch {
        op.lista.innerHTML = '<div class="empty-hint">No se pudieron cargar los packs.</div>';
        return;
      }
      const packs = d.packs || [];
      if (op.alCargar) op.alCargar(d);
      if (admin && op.avisoAlmacen) op.avisoAlmacen.hidden = d.almacenamiento === 'externo';
      if (op.cuenta) op.cuenta.textContent = packs.length ? packs.length + ' pack' + (packs.length === 1 ? '' : 's') + (d.pendientes ? ' · ' + d.pendientes + ' en revisión' : '') : '';
      if (!packs.length) {
        op.lista.innerHTML = '<div class="empty-hint">' + (admin ? 'Todavía no hay Sample Packs. Sube el primero arriba.' : 'Todavía no has subido ningún pack.') + '</div>';
        return;
      }
      op.lista.innerHTML = packs.map(pintar).join('');
    }

    function pintar(p) {
      const est = ESTADOS[p.approval_status] || ESTADOS.pending;
      const de = admin ? (p.producer_id ? 'de ' + esc(p.producer_name) : 'tuyo') : '';
      const datos = [p.genre || 'Sin tipo', p.price_label, p.peso && Z ? Z.tamano(p.peso) : '', p.ventas ? p.ventas + ' venta' + (p.ventas === 1 ? '' : 's') : '', de]
        .filter(Boolean).map(esc).join(' · ');
      return `
        <div class="pk-item" data-id="${p.id}">
          ${p.cover_filename ? `<img class="pk-cover" src="/api/cover/${p.id}?s=160" alt="" loading="lazy">` : '<div class="pk-cover"></div>'}
          <div class="pk-info">
            <div class="pk-title">${esc(p.title)}</div>
            <div class="pk-meta">${datos}</div>
            <div class="pk-meta">Subido el ${esc(fechaCorta(p.created_at))}${p.archivo ? '' : ' · <span class="pk-warn">falta el archivo del pack</span>'}</div>
            ${p.procesando ? '<div class="pk-meta pk-proc">Procesando el archivo: calculando su huella' + (p.externo ? ' y guardando una copia segura' : '') + '. Puede tardar varios minutos en packs grandes; ya se puede vender.</div>' : ''}
            ${p.approval_status === 'rejected' && p.rejection_reason ? `<div class="pk-meta pk-warn">Motivo: ${esc(p.rejection_reason)}${admin ? '' : '. Corrígelo con «Editar» y vuelve a revisión.'}</div>` : ''}
            <div class="pk-extra"></div>
          </div>
          <div class="pk-actions">
            <span class="status-badge ${est.clase}">${est.texto}</span>
            ${admin && p.approval_status === 'pending' ? '<button type="button" class="pk-btn pk-ok" data-acc="aprobar">Aprobar</button><button type="button" class="pk-btn pk-no" data-acc="rechazar">Rechazar</button>' : ''}
            ${admin ? `<button type="button" class="pk-btn" data-acc="escuchar">Escuchar demo</button><a class="pk-btn" href="/api/admin/tracks/${p.id}/file?f=stems" download>Descargar pack</a>` : ''}
            ${!admin && p.registro ? `<a class="pk-btn" href="/api/producer/registros/${encodeURIComponent(p.registro)}/pdf" download>Certificado de registro</a>` : ''}
            <button type="button" class="pk-btn" data-acc="editar">Editar</button>
            <button type="button" class="pk-btn pk-no" data-acc="borrar">Eliminar</button>
          </div>
        </div>`;
    }

    op.lista.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-acc]');
      if (!btn) return;
      const item = btn.closest('.pk-item');
      const id = Number(item.dataset.id);
      const extra = item.querySelector('.pk-extra');
      const acc = btn.dataset.acc;

      if (acc === 'escuchar') {
        if (extra.querySelector('audio')) { extra.innerHTML = ''; return; }
        extra.innerHTML = `<audio controls preload="none" src="/api/admin/preview-audio/${id}" aria-label="Demo del pack"></audio>`;
        const a = extra.querySelector('audio');
        a.play().catch(() => {});
        return;
      }
      if (acc === 'aprobar') {
        btn.disabled = true;
        const r = await fetch('/api/admin/tracks/' + id + '/approve', { method: 'POST' });
        aviso(r.ok ? 'Pack aprobado: ya está en la tienda.' : 'No se pudo aprobar.', !r.ok);
        return cargar();
      }
      if (acc === 'rechazar') {
        extra.innerHTML = `
          <div class="pk-inline">
            <label for="pk-motivo-${id}">Motivo del rechazo (lo ve el productor)</label>
            <input type="text" id="pk-motivo-${id}" maxlength="300" placeholder="Ej: la demo no se escucha bien">
            <div class="pk-inline-actions">
              <button type="button" class="pk-btn pk-no" data-acc="confirmar-rechazo">Rechazar pack</button>
              <button type="button" class="pk-btn" data-acc="cancelar">Cancelar</button>
            </div>
          </div>`;
        extra.querySelector('input').focus();
        return;
      }
      if (acc === 'confirmar-rechazo') {
        const motivo = extra.querySelector('input').value;
        const r = await fetch('/api/admin/tracks/' + id + '/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: motivo }) });
        aviso(r.ok ? 'Pack rechazado.' : 'No se pudo rechazar.', !r.ok);
        return cargar();
      }
      if (acc === 'cancelar') { extra.innerHTML = ''; return; }
      if (acc === 'editar') {
        const res = await fetch(API, { cache: 'no-store' });
        const p = ((await res.json()).packs || []).find((x) => x.id === id);
        if (!p) return cargar();
        extra.innerHTML = `
          <div class="pk-inline">
            <div class="field"><label for="pk-e-title-${id}">Nombre</label><input type="text" id="pk-e-title-${id}" data-k="title" maxlength="120" value="${esc(p.title)}"></div>
            <div class="field"><label for="pk-e-genre-${id}">Tipo de sonidos</label><input type="text" id="pk-e-genre-${id}" data-k="genre" maxlength="60" value="${esc(p.genre)}"></div>
            <div class="field"><label for="pk-e-desc-${id}">Qué trae</label><textarea id="pk-e-desc-${id}" data-k="description" rows="3" maxlength="1000">${esc(p.description)}</textarea></div>
            <div class="field"><label for="pk-e-price-${id}">Precio — CUP</label><input type="text" id="pk-e-price-${id}" data-k="price" inputmode="decimal" value="${esc(p.price_cup)}"></div>
            <p class="field-hint">${!admin && p.approval_status === 'rejected' ? 'Al guardar, el pack vuelve a revisión.' : 'Para cambiar los archivos, elimina el pack y súbelo de nuevo.'}</p>
            <div class="pk-inline-actions">
              <button type="button" class="pk-btn pk-ok" data-acc="guardar">Guardar</button>
              <button type="button" class="pk-btn" data-acc="cancelar">Cancelar</button>
            </div>
          </div>`;
        extra.querySelector('input').focus();
        return;
      }
      if (acc === 'guardar') {
        const body = {};
        extra.querySelectorAll('[data-k]').forEach((el) => { body[el.dataset.k] = el.value; });
        btn.disabled = true;
        const r = await fetch(API + '/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        btn.disabled = false;
        if (!r.ok) return aviso(d.error || 'No se pudieron guardar los cambios.', true);
        aviso(d.reenviado ? 'Cambios guardados. El pack volvió a revisión.' : 'Cambios guardados.');
        return cargar();
      }
      if (acc === 'borrar') {
        if (btn.dataset.seguro !== '1') { btn.dataset.seguro = '1'; btn.textContent = '¿Seguro? Pulsa otra vez'; return; }
        const url = admin ? '/api/admin/tracks/' + id + (btn.dataset.forzar === '1' ? '?force=1' : '') : API + '/' + id;
        const r = await fetch(url, { method: 'DELETE' });
        const d = await r.json().catch(() => ({}));
        if (r.ok) { aviso('Pack eliminado.'); return cargar(); }
        if (admin && r.status === 409) {
          btn.dataset.forzar = '1';
          btn.textContent = 'Eliminar igual';
          return aviso((d.error || 'Este pack tiene compras.') + ' Si lo eliminas igual, pulsa «Eliminar igual».', true);
        }
        aviso(d.error || 'No se pudo eliminar.', true);
      }
    });

    cargar();
    return { cargar };
  }

  window.ZBPacks = { montar };
})();
