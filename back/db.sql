-- ============================================================
-- FitStock — Esquema de base de datos (SQLite)
-- Práctica P2-6 · Flujo e-commerce + Backend GraphQL
-- Versión integrada del equipo: esquema y transacciones de
-- checkout (Checkout) + catálogo combinado (Categorías/Producto
-- detail) + carrito (Carrito).
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- Tabla: categoria
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categoria (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    icono       TEXT
);

-- ------------------------------------------------------------
-- Tabla: producto
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producto (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre            TEXT NOT NULL,
    descripcion       TEXT,
    precio            REAL NOT NULL CHECK (precio >= 0),
    stock             INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    imagen_url        TEXT,
    info_nutricional  TEXT,        -- JSON: tabla nutrimental o tallas, según categoría
    categoria_id      INTEGER NOT NULL,
    FOREIGN KEY (categoria_id) REFERENCES categoria(id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------
-- Tabla: usuario (Auth System). Contraseña con scrypt (salt:hash)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    rol            TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'admin')),
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Tabla: sesion (token aleatorio; en BD solo se guarda su SHA-256)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesion (
    token_hash  TEXT PRIMARY KEY,
    usuario_id  INTEGER NOT NULL,
    expira_en   INTEGER NOT NULL,          -- epoch ms
    FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Tabla: intento_login (límite de intentos fallidos por correo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intento_login (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    email     TEXT NOT NULL,
    creado_en INTEGER NOT NULL             -- epoch ms
);
CREATE INDEX IF NOT EXISTS idx_intento_login_email ON intento_login(email, creado_en);

-- ------------------------------------------------------------
-- Tabla: direccion (una dirección de envío por pedido)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS direccion (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    calle       TEXT NOT NULL,
    numero      TEXT,
    ciudad      TEXT NOT NULL,
    estado      TEXT NOT NULL,
    cp          TEXT NOT NULL,
    pais        TEXT NOT NULL DEFAULT 'México',
    telefono    TEXT NOT NULL
);

-- ------------------------------------------------------------
-- Tabla: pedido
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id      INTEGER,                       -- dueño del pedido
    direccion_id    INTEGER NOT NULL,
    nombre_contacto TEXT NOT NULL,
    email_contacto  TEXT NOT NULL,
    metodo_pago     TEXT NOT NULL CHECK (metodo_pago IN ('tarjeta', 'paypal', 'mercadopago', 'transferencia')),
    subtotal        REAL NOT NULL,
    envio           REAL NOT NULL DEFAULT 0,
    total           REAL NOT NULL,
    estado          TEXT NOT NULL DEFAULT 'procesando'
                    CHECK (estado IN ('procesando', 'enviado', 'entregado', 'cancelado')),
    fecha_creacion  TEXT NOT NULL DEFAULT (datetime('now')),
    -- Métodos de cobro: estado del pago, id de la transacción en la pasarela y fecha en que se cobró
    estado_pago     TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado_pago IN ('pendiente', 'pagado', 'cancelado')),
    referencia_pago TEXT,
    fecha_pago      TEXT,
    FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE SET NULL,
    FOREIGN KEY (direccion_id) REFERENCES direccion(id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------
-- Tabla: pedido_detalle (líneas del pedido)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_detalle (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id       INTEGER NOT NULL,
    producto_id     INTEGER NOT NULL,
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario REAL NOT NULL,
    subtotal        REAL NOT NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedido(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE RESTRICT
);

-- ============================================================
-- Datos semilla
-- ============================================================

INSERT INTO categoria (nombre, descripcion, icono) VALUES
('Suplementos', 'Proteínas, creatina, pre-entrenos y vitaminas', '💊'),
('Ropa deportiva', 'Playeras, shorts, leggings y tops para entrenar', '👕'),
('Accesorios', 'Guantes, cinturones, shakers y straps', '🏋️');

INSERT INTO producto (nombre, descripcion, precio, stock, imagen_url, info_nutricional, categoria_id) VALUES
-- Suplementos
('Proteína Whey 2kg', 'Proteína de suero de leche, 24g de proteína por porción.', 899, 25, 'proteina.jpg', '{"porcion":"30g","proteina":"24g","calorias":120}', 1),
('Creatina 300g', 'Creatina micronizada pura, sin sabor.', 399, 40, 'creatina.jpg', '{"porcion":"5g","creatina":"5g"}', 1),
('Pre-entreno 300gr', 'Pre-entreno con cafeína y beta-alanina.', 549, 15, 'preentreno.jpg', '{"porcion":"10g","cafeina":"200mg"}', 1),
('L-Citrulina 200g', NULL, 429, 30, 'l-citrulina.jpg', NULL, 1),
('Glicinato de magnesio 180 cápsulas (200mg c/u)', NULL, 299, 30, 'magnesio.jpg', NULL, 1),
('Omega 3 180 cápsulas (500 EPA/250 DHA c/u)', NULL, 349, 30, 'omega3.jpg', NULL, 1),
('L-Arginina 120 cápsulas (1000mg c/u)', NULL, 389, 30, 'l-arginina.jpg', NULL, 1),
('Ganador de masa 2.27kg', NULL, 999, 20, 'ganador-masa.jpg', NULL, 1),

-- Ropa deportiva
('Playera Dry-Fit', 'Playera transpirable para entrenamiento, corte atlético.', 299, 60, 'playera.jpg', '{"tallas":["S","M","L","XL"]}', 2),
('Short deportivo', 'Short ligero con bolsillo interior para llaves.', 349, 50, 'short.jpg', '{"tallas":["S","M","L","XL"]}', 2),
('Playera de compresión Gymshark Onyx', NULL, 379, 25, 'compresion.jpg', NULL, 2),
('Mallas deportivas para mujer', 'Leggings de compresión de alto rendimiento.', 459, 35, 'mallas.jpg', '{"tallas":["XS","S","M","L"]}', 2),
('Top deportivo', NULL, 329, 30, 'top.jpg', NULL, 2),

-- Accesorios
('Guantes de gym', 'Guantes con soporte de muñeca y grip antideslizante.', 199, 45, 'guantes.jpg', '{"tallas":["S","M","L"]}', 3),
('Cinturón de fuerza', 'Cinturón de cuero para levantamiento de potencia.', 549, 20, 'cinturon.jpg', NULL, 3),
('Straps de muñeca', NULL, 199, 40, 'straps.jpg', NULL, 3),
('Pasadores de liberación automática', NULL, 259, 35, 'pasadores.jpg', NULL, 3),
('Shaker 700ml', 'Shaker con malla mezcladora y compartimento extra.', 149, 80, NULL, NULL, 3);
