// server.js - VERSIÓN FINAL CORREGIDA
const express = require('express');
const mysql = require('mysql2/promise');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

/* ============================================================
   🔐  CORS GLOBAL COMPLETO (Railway compatible)
============================================================ */
const allowedOrigins = [
  'https://sistemagolden.up.railway.app',
  'http://localhost:3000',
  'http://localhost:5173'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Manejo de preflight necesario para Railway
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json({ limit: "10mb" }));


/* ============================================================
   🔗  CONEXIÓN A BASE DE DATOS
============================================================ */
let pool;

const createPool = () => {
  return mysql.createPool({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false } // Railway lo necesita
  });
};

const initializeDatabase = async () => {
  try {
    pool = createPool();
    await pool.execute('SELECT 1');
    console.log('✅ MySQL conectado correctamente');
  } catch (err) {
    console.error('❌ Error MySQL:', err.message);
  }
};


/* ============================================================
   🟢 RUTAS BÁSICAS
============================================================ */
app.get('/', (req, res) => {
  res.json({ status: "online", message: "Backend Golden activo" });
});

app.get('/health', async (req, res) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ status: "healthy", database: "connected" });
  } catch {
    res.json({ status: "healthy", database: "disconnected" });
  }
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Backend OK', cors: 'enabled' });
});


/* ============================================================
   🔐  LOGIN
============================================================ */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;

    if (!usuario || !contrasena) {
      return res.status(400).json({
        success: false,
        error: "Usuario y contraseña requeridos"
      });
    }

    if (!pool) await initializeDatabase();

    const [users] = await pool.execute(
      'SELECT usuario_id, nombre, apellido, usuario, correo, contrasena, rol, estado FROM usuario WHERE usuario = ?',
      [usuario]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, error: "Usuario o contraseña incorrectos" });
    }

    const user = users[0];

    if (user.estado !== "activo") {
      return res.status(401).json({ success: false, error: "Usuario inactivo" });
    }

    const validPass = await bcryptjs.compare(contrasena, user.contrasena);
    if (!validPass) {
      return res.status(401).json({ success: false, error: "Usuario o contraseña incorrectos" });
    }

    const token = jwt.sign(
      {
        usuario_id: user.usuario_id,
        usuario: user.usuario,
        rol: user.rol
      },
      process.env.JWT_SECRET || "secreto_temporal",
      { expiresIn: "24h" }
    );

    delete user.contrasena;

    res.json({
      success: true,
      message: "Login exitoso",
      token,
      user
    });

  } catch (err) {
    console.error("❌ Error en login:", err);
    res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
});


/* ============================================================
   ❌ RUTA NO ENCONTRADA
============================================================ */
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: "Ruta no encontrada",
    path: req.originalUrl
  });
});


/* ============================================================
   🚀 INICIAR SERVIDOR
============================================================ */
const start = async () => {
  await initializeDatabase();

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log("✔ CORS habilitado para:");
    console.log("  https://sistemagolden.up.railway.app");
    console.log("  http://localhost:3000");
    console.log("  http://localhost:5173");
  });
};

start();
