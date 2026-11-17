# MAISON — Tienda de ropa (Node.js + Express + MySQL 8)

## Estructura
```
tienda-ropa/
├── database/schema.sql   # BD + 4 tablas + datos de prueba
├── db.js                 # Pool de conexión MySQL
├── server.js             # API REST (Express)
├── package.json
├── .env.example
└── public/
    ├── index.html        # Interfaz (Tailwind)
    ├── style.css
    └── script.js         # Fetch API
```

## Cómo ejecutar
1. `mysql -u root -p < database/schema.sql`
2. `cp .env.example .env` y pon tu contraseña de MySQL.
3. `npm install`
4. `npm start` → abre http://localhost:3000

## Endpoints
| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | /api/categorias | Listar / crear categorías |
| GET | /api/productos?categoria=ID | Listar (filtro opcional) |
| GET/PUT/DELETE | /api/productos/:id | Ver / editar / eliminar |
| POST | /api/productos | Crear producto |
| GET/POST | /api/clientes | Listar / registrar |
| DELETE | /api/clientes/:id | Eliminar cliente |
| GET | /api/pedidos | Listar pedidos |
| POST | /api/pedidos | `{cliente_id, items:[{producto_id,cantidad}]}` — descuenta stock en transacción |
| PATCH | /api/pedidos/:id | `{estado}` |
