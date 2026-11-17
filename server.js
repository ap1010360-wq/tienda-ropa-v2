const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const ESTADOS = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'];
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Registro duplicado' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Referencia inválida' });
  if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'El registro está en uso' });
  res.status(500).json({ error: 'Error interno del servidor' });
});

/* ---------- CATEGORÍAS ---------- */
app.get('/api/categorias', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM categorias ORDER BY nombre');
  res.json(rows);
}));

app.post('/api/categorias', wrap(async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Nombre requerido' });
  const [r] = await pool.execute('INSERT INTO categorias (nombre, descripcion) VALUES (?, ?)', [String(nombre).trim(), descripcion || null]);
  res.status(201).json({ id: r.insertId, nombre, descripcion });
}));

/* ---------- PRODUCTOS ---------- */
app.get('/api/productos', wrap(async (req, res) => {
  const { categoria } = req.query;
  let sql = `SELECT p.*, c.nombre AS categoria FROM productos p
             JOIN categorias c ON c.id = p.categoria_id`;
  const params = [];
  if (categoria) { sql += ' WHERE p.categoria_id = ?'; params.push(Number(categoria)); }
  sql += ' ORDER BY p.id DESC';
  const [rows] = await pool.execute(sql, params);
  res.json(rows);
}));

app.get('/api/productos/:id', wrap(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM productos WHERE id = ?', [Number(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(rows[0]);
}));

function validarProducto(b) {
  const precio = Number(b.precio), stock = Number(b.stock), categoria_id = Number(b.categoria_id);
  if (!b.nombre || !String(b.nombre).trim()) return 'Nombre requerido';
  if (!Number.isFinite(precio) || precio < 0) return 'Precio inválido';
  if (!Number.isInteger(stock) || stock < 0) return 'Stock inválido';
  if (!Number.isInteger(categoria_id) || categoria_id <= 0) return 'Categoría inválida';
  return null;
}

app.post('/api/productos', wrap(async (req, res) => {
  const err = validarProducto(req.body);
  if (err) return res.status(400).json({ error: err });
  const { nombre, descripcion, precio, stock, imagen_url, categoria_id } = req.body;
  const [r] = await pool.execute(
    'INSERT INTO productos (nombre, descripcion, precio, stock, imagen_url, categoria_id) VALUES (?, ?, ?, ?, ?, ?)',
    [String(nombre).trim(), descripcion || null, Number(precio), Number(stock), imagen_url || null, Number(categoria_id)]
  );
  res.status(201).json({ id: r.insertId });
}));

app.put('/api/productos/:id', wrap(async (req, res) => {
  const err = validarProducto(req.body);
  if (err) return res.status(400).json({ error: err });
  const { nombre, descripcion, precio, stock, imagen_url, categoria_id } = req.body;
  const [r] = await pool.execute(
    'UPDATE productos SET nombre=?, descripcion=?, precio=?, stock=?, imagen_url=?, categoria_id=? WHERE id=?',
    [String(nombre).trim(), descripcion || null, Number(precio), Number(stock), imagen_url || null, Number(categoria_id), Number(req.params.id)]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ ok: true });
}));

app.delete('/api/productos/:id', wrap(async (req, res) => {
  const [r] = await pool.execute('DELETE FROM productos WHERE id = ?', [Number(req.params.id)]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ ok: true });
}));

/* ---------- CLIENTES ---------- */
app.get('/api/clientes', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM clientes ORDER BY fecha_registro DESC');
  res.json(rows);
}));

app.post('/api/clientes', wrap(async (req, res) => {
  const { nombre, correo, telefono } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Nombre requerido' });
  if (!correo || !isEmail(correo)) return res.status(400).json({ error: 'Correo inválido' });
  if (telefono && !/^[0-9+\-\s]{7,20}$/.test(telefono)) return res.status(400).json({ error: 'Teléfono inválido' });
  const [r] = await pool.execute('INSERT INTO clientes (nombre, correo, telefono) VALUES (?, ?, ?)',
    [String(nombre).trim(), String(correo).trim().toLowerCase(), telefono || null]);
  res.status(201).json({ id: r.insertId });
}));

app.delete('/api/clientes/:id', wrap(async (req, res) => {
  const [r] = await pool.execute('DELETE FROM clientes WHERE id = ?', [Number(req.params.id)]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ ok: true });
}));

/* ---------- PEDIDOS ---------- */
app.get('/api/pedidos', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT pe.*, c.nombre AS cliente FROM pedidos pe
     JOIN clientes c ON c.id = pe.cliente_id ORDER BY pe.fecha_pedido DESC, pe.id DESC`);
  res.json(rows);
}));

app.post('/api/pedidos', wrap(async (req, res) => {
  const cliente_id = Number(req.body.cliente_id);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!Number.isInteger(cliente_id) || cliente_id <= 0) return res.status(400).json({ error: 'Cliente inválido' });
  if (!items.length) return res.status(400).json({ error: 'El carrito está vacío' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let total = 0;
    for (const it of items) {
      const pid = Number(it.producto_id), qty = Number(it.cantidad);
      if (!Number.isInteger(pid) || !Number.isInteger(qty) || qty <= 0) throw Object.assign(new Error('Item inválido'), { status: 400 });
      const [rows] = await conn.execute('SELECT precio, stock, nombre FROM productos WHERE id = ? FOR UPDATE', [pid]);
      if (!rows.length) throw Object.assign(new Error('Producto inexistente'), { status: 400 });
      if (rows[0].stock < qty) throw Object.assign(new Error(`Stock insuficiente: ${rows[0].nombre}`), { status: 409 });
      await conn.execute('UPDATE productos SET stock = stock - ? WHERE id = ?', [qty, pid]);
      total += Number(rows[0].precio) * qty;
    }
    const [r] = await conn.execute('INSERT INTO pedidos (cliente_id, total, estado) VALUES (?, ?, ?)', [cliente_id, total.toFixed(2), 'pendiente']);
    await conn.commit();
    res.status(201).json({ id: r.insertId, total });
  } catch (e) {
    await conn.rollback();
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  } finally {
    conn.release();
  }
}));

app.patch('/api/pedidos/:id', wrap(async (req, res) => {
  const { estado } = req.body;
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  const [r] = await pool.execute('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, Number(req.params.id)]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Pedido no encontrado' });
  res.json({ ok: true });
}));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`Tienda corriendo en http://localhost:${PORT}`));