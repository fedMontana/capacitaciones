'use strict';

const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzbdS13cYPzm1rJ0vLFeY9jkKedAimW3Oq7dHJXW4lGwyLnzYC2Xts1SEFVKJvF7caH1A/exec';

const etiquetas = {
  senderismo: 'Senderismo',
  alta_montana: 'Alta montaña',
  escalada_roca: 'Escalada en roca',
  escalada_en_roca: 'Escalada en roca',
  escalada_hielo: 'Escalada en hielo',
  escalada_en_hielo: 'Escalada en hielo',
  barranquismo: 'Barranquismo',
  primeros_auxilios: 'Primeros auxilios',
  orientacion: 'Orientación',
  autorescate: 'Autorescate',
  curso_basico_unam: 'Curso básico UNAM',
  basico: 'Básico',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  monitor: 'Monitor',
  instructor_asociacion: 'Instructor de Asociación',
  instructor_de_asociacion: 'Instructor de Asociación',
  nivel_i: 'Nivel I',
  nivel_ii: 'Nivel II',
  nivel_iii: 'Nivel III',
  wfa: 'WFA',
  wfr: 'WFR'
};

const porId = id => document.getElementById(id);

function clave(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
}

function etiqueta(texto) {
  const k = clave(texto);

  if (Object.prototype.hasOwnProperty.call(etiquetas, k)) {
    return etiquetas[k];
  }

  const limpio = texto.trim().replace(/_/g, ' ');
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

function elemento(tag, clase, texto) {
  const nodo = document.createElement(tag);

  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;

  return nodo;
}

function estado(titulo, mensaje, reintentar = false) {
  porId('perfil-identidad').hidden = true;
  porId('perfil-formacion').hidden = true;

  porId('cursos').replaceChildren();
  porId('nombre').textContent = '';
  porId('identificador').textContent = '';
  porId('asociacion').textContent = '';

  porId('estado-consulta').hidden = false;
  porId('estado-titulo').textContent = titulo;
  porId('estado-mensaje').textContent = mensaje;
  porId('reintentar').hidden = !reintentar;
}

function validarPerfil(perfil) {
  const campos = ['id', 'nombre', 'estado', 'asociacion'];

  if (!perfil || campos.some(campo => typeof perfil[campo] !== 'string') || !Array.isArray(perfil.capacitaciones)
  ) {
    throw new Error('RESPUESTA_INVALIDA');
  }

  for (const curso of perfil.capacitaciones) {
    if (!curso || typeof curso.disciplina !== 'string' ||
      !curso.disciplina.trim() ||
      typeof curso.nivel !== 'string' ||
      !['string', 'number'].includes(typeof curso.anio)
    ) {
      throw new Error('RESPUESTA_INVALIDA');
    }
  }
  return perfil;
}

function mostrarPerfil(perfil) {
  porId('nombre').textContent = perfil.nombre || 'Perfil del asociado';

  porId('identificador').textContent = perfil.id;

  porId('asociacion').textContent = [
    perfil.asociacion,
    perfil.estado
  ].filter(Boolean).join(' · ');

  // Agrupar todas las capacitaciones por disciplina.
  const grupos = new Map();

  for (const curso of perfil.capacitaciones) {
    const k = clave(curso.disciplina);

    if (!grupos.has(k)) {
      grupos.set(k, {
        nombre: etiqueta(curso.disciplina),
        niveles: []
      });
    }

    grupos.get(k).niveles.push(curso);
  }

  const destino = porId('cursos');
  destino.replaceChildren();
  destino.classList.toggle('single', grupos.size === 1);

  if (!grupos.size) {
    destino.append(elemento('p', 'empty-training', 'Aún no hay capacitaciones registradas para este asociado.'));
  }

  for (const [k, grupo] of grupos) {
    const tarjeta = elemento('article', 'course');
    const cabecera = elemento('div', 'course-head');

    const marca = elemento('span', 'course-mark', k === 'primeros_auxilios' ? '+' : '△');

    marca.setAttribute('aria-hidden', 'true');

    const titulo = elemento('div');

    titulo.append(elemento('h3', '', grupo.nombre), elemento('p', '', 'Capacitación registrada'));

    cabecera.append(marca, titulo);

    const lista = elemento('ul');

    for (const curso of grupo.niveles) {
      const fila = elemento('li');
      const fecha = elemento('span', 'year');

      fecha.append(elemento('small', '', 'Año'), document.createTextNode(String(curso.anio).trim() || 'Sin registro'));

      fila.append(elemento('strong', '', etiqueta(curso.nivel) || 'Formación registrada'), fecha);

      lista.append(fila);
    }

    tarjeta.append(cabecera, lista);
    destino.append(tarjeta);
  }

  porId('estado-consulta').hidden = true;
  porId('perfil-identidad').hidden = false;
  porId('perfil-formacion').hidden = false;
}

let consultando = false;

async function consultarPerfil() {
  if (consultando) return;

  const parametros = new URLSearchParams(window.location.search);
  const tokens = parametros.getAll('id');
  const token = (tokens[0] || '').trim();

  if (tokens.length !== 1 || !token || token.length > 200) {
    estado('Enlace incompleto o inválido', 'Abre el enlace completo o escanea el QR de la credencial.');
    return;
  }

  consultando = true;

  estado('Consultando perfil…', 'Espera un momento mientras obtenemos la información.');

  const controlador = new AbortController();

  const tiempo = setTimeout(() => {
    controlador.abort();
  }, 30000);

  try {
    // El cuerpo contiene JSON aunque se envíe como text/plain.
    // GAS lo interpreta con JSON.parse(e.postData.contents).
    const respuesta = await fetch(GAS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8'
      },
      body: JSON.stringify({
        destino: 'ConsultarPerfilPublico',
        token: token
      }),
      credentials: 'omit',
      redirect: 'follow',
      signal: controlador.signal
    });

    if (!respuesta.ok) {
      throw new Error('HTTP_ERROR');
    }

    const datos = await respuesta.json();

    if (datos && datos.success === true) {
      mostrarPerfil(validarPerfil(datos.perfil));
    } else if (datos && datos.success === false) {
      switch (datos.codigo) {
        case 'TOKEN_INVALIDO':
          estado('Enlace inválido', 'No encontramos un perfil asociado a este enlace.');
          break;

        case 'PERFIL_NO_HABILITADO':
          estado('Perfil no habilitado', 'Este perfil no está habilitado para consulta. ' + 'El asociado puede consultar su vigencia con su asociación.');
          break;

        case 'PERFIL_NO_DISPONIBLE':
          estado('Perfil no disponible', 'Este perfil no está disponible para consulta.');
          break;

        default:
          estado('No fue posible consultar el perfil', 'Intenta nuevamente dentro de unos momentos.', true);
      }
    } else {
      throw new Error('RESPUESTA_INVALIDA');
    }
  } catch (error) {
    const titulo = error.name === 'AbortError'
      ? 'La consulta está tardando demasiado'
      : 'No fue posible consultar el perfil';

    estado(titulo, 'Revisa tu conexión e intenta nuevamente. ' + 'Si el problema continúa, comunícalo a tu asociación.', true);
  } finally {
    clearTimeout(tiempo);
    consultando = false;
  }
}

porId('reintentar').addEventListener('click', consultarPerfil);

consultarPerfil();
