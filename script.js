const API = '/api';
const state = { categorias: [], productos: [], clientes: [], carrito: [], filtro: null };

const $ = (s) => document.querySelector(s);
const money = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, options = {}) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de red');
  return data;
}

function toast(msg, ok = true) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.style.background = ok ? '#1c1a17' : '#b42318';
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 2800);
}

/* ---------- Categorías ---------- */
async function cargarCategorias() {
  state.categorias = await api('/categorias');
  const filtros = $('#filtros');
  if (filtros) {
    filtros.innerHTML = `<button class="chip ${state.filtro === null ? 'active' : ''}" data-cat="">Todo</button>` +
      state.categorias.map((c) => `<button class="chip ${state.filtro === c.id ? 'active' : ''}" data-cat="${c.id}">${esc(c.nombre)}</button>`).join('');
  }
  const selectCat = $('#selectCategoria');
  if (selectCat) {
    selectCat.innerHTML = '<option value="">Selecciona categoría</option>' +
      state.categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  }
}

const filtrosEl = $('#filtros');
if (filtrosEl) {
  filtrosEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.filtro = b.dataset.cat ? Number(b.dataset.cat) : null;
    document.querySelectorAll('#filtros .chip').forEach((x) => x.classList.toggle('active', x === b));
    cargarProductos();
  });
}

/* ---------- Productos ---------- */
async function cargarProductos() {
  const q = state.filtro ? `?categoria=${state.filtro}` : '';
  state.productos = await api('/productos' + q);
  const cont = $('#productos');
  if (!cont) return;
  if (!state.productos.length) { 
    cont.innerHTML = '<p class="text-black/50">No hay productos en esta categoría.</p>'; 
    return; 
  }
  cont.innerHTML = state.productos.map((p) => `
    <article class="card group">
      <div class="aspect-[3/4] overflow-hidden bg-black/5">
        <img src="${esc(p.imagen_url || 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=800')}" alt="${esc(p.nombre)}" class="h-full w-full object-cover" loading="lazy" />
      </div>
      <div class="mt-4 flex items-start justify-between gap-4">
        <div>
          <p class="text-xs uppercase tracking-widest text-black/50">${esc(p.categoria)}</p>
          <h3 class="font-serif text-2xl">${esc(p.nombre)}</h3>
          <p class="text-sm text-black/60 line-clamp-2">${esc(p.descripcion)}</p>
          <p class="text-xs mt-1 ${p.stock > 0 ? 'text-black/50' : 'text-red-700'}">${p.stock > 0 ? `${p.stock} disponibles` : 'Agotado'}</p>
        </div>
        <p class="whitespace-nowrap">${money(p.precio)}</p>
      </div>
      <div class="mt-4 flex gap-2">
        <button class="btn flex-1" data-add="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>Añadir</button>
        <button class="btn-outline" data-edit="${p.id}" title="Editar">✎</button>
        <button class="btn-outline" data-del="${p.id}" title="Eliminar">✕</button>
      </div>
    </article>`).join('');
}

const productosEl = $('#productos');
if (productosEl) {
  productosEl.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add]'), edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (add) agregarAlCarrito(Number(add.dataset.add));
    if (edit) editarProducto(Number(edit.dataset.edit));
    if (del && confirm('¿Eliminar este producto?')) {
      try { await api(`/productos/${del.dataset.del}`, { method: 'DELETE' }); toast('Producto eliminado'); cargarProductos(); cargarStock(); }
      catch (err) { toast(err.message, false); }
    }
  });
}

function editarProducto(id) {
  const p = state.productos.find((x) => x.id === id);
  if (!p) return;
  const f = $('#formProducto');
  if (!f) return;
  ['id', 'nombre', 'categoria_id', 'precio', 'stock', 'imagen_url', 'descripcion'].forEach((k) => { 
    if (f.elements[k]) f.elements[k].value = p[k] ?? ''; 
  });
  $('#btnGuardarProducto').textContent = 'Actualizar producto';
  $('#btnCancelarEdicion').classList.remove('hidden');
  switchMainTab('admin-section');
}

function resetFormProducto() {
  const f = $('#formProducto');
  if (!f) return;
  f.reset();
  f.elements.id.value = '';
  $('#btnGuardarProducto').textContent = 'Guardar producto';
  $('#btnCancelarEdicion').classList.add('hidden');
}

const btnCancelar = $('#btnCancelarEdicion');
if (btnCancelar) btnCancelar.addEventListener('click', resetFormProducto);

const formProducto = $('#formProducto');
if (formProducto) {
  formProducto.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const id = data.id; delete data.id;
    data.precio = Number(data.precio); data.stock = Number(data.stock); data.categoria_id = Number(data.categoria_id);
    try {
      if (id) await api(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      else await api('/productos', { method: 'POST', body: JSON.stringify(data) });
      toast(id ? 'Producto actualizado' : 'Producto agregado');
      resetFormProducto();
      cargarProductos();
      cargarStock();
    } catch (err) { toast(err.message, false); }
  });
}

/* ---------- Registro de Categorías ---------- */
const formCategoria = $('#formCategoria');
if (formCategoria) {
  formCategoria.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api('/categorias', { method: 'POST', body: JSON.stringify(data) });
      toast('¡Categoría creada con éxito!');
      e.target.reset();
      await cargarCategorias();
    } catch (err) {
      toast(err.message, false);
    }
  });
}

/* ---------- Clientes ---------- */
async function cargarClientes() {
  state.clientes = await api('/clientes');
  const listaClientes = $('#listaClientes');
  if (listaClientes) {
    listaClientes.innerHTML = state.clientes.map((c) => `
      <li class="py-3 flex justify-between gap-4" data-id="${c.id}">
        <div><p>${esc(c.nombre)}</p><p class="text-xs text-black/50">${esc(c.correo)} · ${esc(c.telefono || '—')}</p></div>
        <span class="text-xs text-black/40">${new Date(c.fecha_registro).toLocaleDateString('es-MX')}</span>
      </li>`).join('') || '<li class="py-3 text-black/50">Sin clientes</li>';
  }
  const selectCliente = $('#selectCliente');
  if (selectCliente) {
    selectCliente.innerHTML = '<option value="">¿Quién compra?</option>' +
      state.clientes.map((c) => `<option value="${c.id}">${esc(c.nombre)} (${esc(c.correo)})</option>`).join('');
  }
}

const formCliente = $('#formCliente');
if (formCliente) {
  formCliente.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api('/clientes', { method: 'POST', body: JSON.stringify(data) });
      toast('¡Registro exitoso!');
      e.target.reset();
      cargarClientes();
    } catch (err) { toast(err.message, false); }
  });
}

/* ---------- Carrito y Pedidos ---------- */
function agregarAlCarrito(id) {
  const p = state.productos.find((x) => x.id === id);
  const item = state.carrito.find((x) => x.id === id);
  if (item) {
    if (item.cantidad >= p.stock) return toast('No hay más stock disponible', false);
    item.cantidad++;
  } else {
    state.carrito.push({ id: p.id, nombre: p.nombre, precio: p.precio, imagen_url: p.imagen_url, stock: p.stock, cantidad: 1 });
  }
  renderCarrito();
  toast(`${p.nombre} añadido`);
}

function renderCarrito() {
  const count = $('#carritoCount');
  if (count) count.textContent = state.carrito.reduce((s, i) => s + i.cantidad, 0);
  
  const total = $('#totalCarrito');
  if (total) total.textContent = money(state.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0));
  
  const items = $('#itemsCarrito');
  if (items) {
    items.innerHTML = state.carrito.map((i) => `
      <li class="flex gap-4">
        <img src="${esc(i.imagen_url)}" class="h-20 w-16 object-cover" alt="" />
        <div class="flex-1">
          <p class="font-serif text-lg">${esc(i.nombre)}</p>
          <p class="text-sm text-black/60">${money(i.precio)}</p>
          <div class="mt-1 flex items-center gap-2 text-sm">
            <button data-menos="${i.id}" class="chip">−</button><span>${i.cantidad}</span><button data-mas="${i.id}" class="chip">+</button>
          </div>
        </div>
        <button data-quitar="${i.id}" class="text-black/40 hover:text-black">✕</button>
      </li>`).join('') || '<li class="text-black/50">Tu carrito está vacío.</li>';
  }
}

const itemsCarritoEl = $('#itemsCarrito');
if (itemsCarritoEl) {
  itemsCarritoEl.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const id = Number(t.dataset.menos || t.dataset.mas || t.dataset.quitar);
    const item = state.carrito.find((x) => x.id === id); if (!item) return;
    if (t.dataset.mas) { if (item.cantidad < item.stock) item.cantidad++; else toast('Stock máximo', false); }
    if (t.dataset.menos) item.cantidad--;
    if (t.dataset.quitar || item.cantidad <= 0) state.carrito = state.carrito.filter((x) => x.id !== id);
    renderCarrito();
  });
}

const abrir = () => { $('#carrito')?.classList.add('translate-x-0'); $('#overlay')?.classList.remove('hidden'); };
const cerrar = () => { $('#carrito')?.classList.add('translate-x-full'); $('#overlay')?.classList.add('hidden'); };

$('#btnCarrito')?.addEventListener('click', abrir);
$('#cerrarCarrito')?.addEventListener('click', cerrar);
$('#overlay')?.addEventListener('click', cerrar);

const formPedido = $('#formPedido');
if (formPedido) {
  formPedido.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.carrito.length) return toast('El carrito está vacío', false);
    const cliente_id = Number(new FormData(e.target).get('cliente_id'));
    if (!cliente_id) return toast('Selecciona o registra un cliente', false);
    try {
      const r = await api('/pedidos', { method: 'POST', body: JSON.stringify({
        cliente_id, items: state.carrito.map((i) => ({ producto_id: i.id, cantidad: i.cantidad }))
      }) });
      toast(`Pedido #${r.id} creado por ${money(r.total)}`);
      state.carrito = []; renderCarrito(); cerrar();
      cargarProductos(); cargarPedidos(); cargarStock(); cargarVentas();
    } catch (err) { toast(err.message, false); }
  });
}

async function cargarPedidos() {
  try {
    const pedidos = await api('/pedidos');
    const estados = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'];
    const tablaPedidos = $('#tablaPedidos');
    if (tablaPedidos) {
      tablaPedidos.innerHTML = pedidos.map((p) => `
        <tr>
          <td class="py-4 px-6">${p.id}</td>
          <td class="py-4 px-6">${esc(p.cliente)}</td>
          <td class="py-4 px-6">${money(p.total)}</td>
          <td class="py-4 px-6"><select data-estado="${p.id}" class="bg-transparent border-b border-black/20 py-1">
            ${estados.map((s) => `<option ${s === p.estado ? 'selected' : ''}>${s}</option>`).join('')}
          </select></td>
          <td class="py-4 px-6">${new Date(p.fecha_pedido).toLocaleString('es-MX')}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="py-4 px-6 text-black/50">Sin pedidos</td></tr>';
    }
  } catch (e) { console.error(e); }
}

const tablaPedidosEl = $('#tablaPedidos');
if (tablaPedidosEl) {
  tablaPedidosEl.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-estado]'); if (!s) return;
    try { 
      await api(`/pedidos/${s.dataset.estado}`, { method: 'PATCH', body: JSON.stringify({ estado: s.value }) }); 
      toast('Estado actualizado'); 
      cargarVentas();
    }
    catch (err) { toast(err.message, false); }
  });
}

/* ---------- Consultas: Stock y Artículos Vendidos ---------- */
async function cargarStock() {
  try {
    const prods = await api('/productos');
    const tablaStock = $('#tabla-stock-content');
    if (tablaStock) {
      tablaStock.innerHTML = prods.map(p => `
        <tr>
          <td class="py-4 px-6">${p.id}</td>
          <td class="py-4 px-6 font-medium">${esc(p.nombre)}</td>
          <td class="py-4 px-6">${esc(p.categoria || 'General')}</td>
          <td class="py-4 px-6"><span class="${p.stock > 0 ? 'text-black' : 'text-red-600 font-bold'}">${p.stock} unidades</span></td>
          <td class="py-4 px-6">${money(p.precio)}</td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="py-4 px-6 text-black/50">No hay stock registrado</td></tr>';
    }
  } catch (e) { console.error(e); }
}

async function cargarVentas() {
  try {
    const pedidos = await api('/pedidos');
    // Filtramos los pedidos que estén pagados, enviados o entregados para considerarlos ventas concretadas
    const ventasValidas = pedidos.filter(p => ['pagado', 'enviado', 'entregado'].includes(p.estado));
    const tablaVentas = $('#tabla-ventas-content');
    if (tablaVentas) {
      tablaVentas.innerHTML = ventasValidas.map(v => `
        <tr>
          <td class="py-4 px-6">#${v.id}</td>
          <td class="py-4 px-6 font-medium">${esc(v.cliente || 'Cliente General')}</td>
          <td class="py-4 px-6">1 (Orden #${v.id})</td>
          <td class="py-4 px-6 font-semibold">${money(v.total)}</td>
          <td class="py-4 px-6">${new Date(v.fecha_pedido).toLocaleString('es-MX')}</td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="py-4 px-6 text-black/50">Aún no hay artículos vendidos o pagados</td></tr>';
    }
  } catch (e) { console.error(e); }
}

/* ---------- Inicialización general ---------- */
(async function init() {
  try {
    await cargarCategorias();
    await Promise.all([cargarProductos(), cargarClientes(), cargarPedidos(), cargarStock(), cargarVentas()]);
    renderCarrito();
  } catch (err) { toast('No se pudo conectar con el servidor: ' + err.message, false); }
})();

/* ---------- Control de Pestañas Principales ---------- */
function switchMainTab(sectionId, evt) {
  document.querySelectorAll('.main-tab-content').forEach(el => {
    el.classList.add('hidden');
    el.classList.remove('active');
  });
  
  const target = document.getElementById(sectionId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
    
    if (sectionId === 'admin-section') {
      cargarCategorias();
    }
    if (sectionId === 'consultas-section') {
      cargarStock();
      cargarVentas();
    }
  }

  document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active', 'font-semibold', 'text-ink', 'border-b', 'border-ink'));
  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active', 'font-semibold', 'text-ink', 'border-b', 'border-ink');
  }
}