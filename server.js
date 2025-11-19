// server.js
const express = require('express');
const mysql = require('mysql2');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// ✅ MIDDLEWARE CORS MEJORADO - COLOCAR AL INICIO
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://sistemagolden.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ];
  
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    console.log('🔄 Preflight request handled for:', req.path);
    return res.status(200).end();
  }
  
  next();
});

// ✅ CORS adicional como backup
app.use(cors({
  origin: [
    "https://sistemagolden.up.railway.app",
    "http://localhost:3000", 
    "http://localhost:5173"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

// ✅ CONEXIÓN A BASE DE DATOS
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'yamanote.proxy.rlwy.net',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || 'mysql',
  database: process.env.MYSQLDATABASE || 'proyecto_golden',
  port: process.env.MYSQLPORT || 22744,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.MYSQLHOST ? { rejectUnauthorized: false } : false
});

// ✅ VERIFICAR CONEXIÓN A BD
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Error conectando a MySQL:', err.message);
  } else {
    console.log('✅ Conectado a MySQL en Railway');
    connection.release();
  }
});

// Middleware de log
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});

// ✅ HEALTH CHECK ENDPOINT
app.get('/health', async (req, res) => {
  try {
    const connection = await pool.promise().getConnection();
    const [rows] = await connection.execute('SELECT 1 as test');
    connection.release();
    
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      cors: 'enabled',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ 
      status: 'server running', 
      database: 'disconnected',
      error: error.message,
      cors: 'enabled'
    });
  }
});

// ✅ RUTA DE LOGIN - SIMPLIFICADA Y ROBUSTA
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Intento de login recibido:', req.body);
  
  // Headers CORS explícitos para esta ruta
  res.header('Access-Control-Allow-Origin', 'https://sistemagolden.up.railway.app');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) {
    return res.status(400).json({ 
      success: false,
      error: 'Usuario y contraseña son requeridos' 
    });
  }

  try {
    const sql = 'SELECT usuario_id, nombre, apellido, usuario, correo, contrasena, rol, estado FROM usuario WHERE usuario = ?';
    
    pool.query(sql, [usuario], async (err, results) => {
      if (err) {
        console.error('❌ Error en consulta SQL:', err);
        return res.status(500).json({ 
          success: false,
          error: 'Error en la base de datos' 
        });
      }

      if (results.length === 0) {
        console.log('❌ Usuario no encontrado:', usuario);
        return res.status(401).json({ 
          success: false,
          error: 'Usuario o contraseña incorrectos' 
        });
      }

      const user = results[0];

      if (user.estado !== 'activo') {
        return res.status(401).json({ 
          success: false,
          error: 'Usuario inactivo' 
        });
      }

      // ✅ VERIFICAR CONTRASEÑA
      const isPasswordValid = await bcryptjs.compare(contrasena, user.contrasena);
      
      if (!isPasswordValid) {
        console.log('❌ Contraseña incorrecta para:', usuario);
        return res.status(401).json({ 
          success: false,
          error: 'Usuario o contraseña incorrectos' 
        });
      }

      // ✅ GENERAR TOKEN
      const token = jwt.sign(
        { 
          usuario_id: user.usuario_id, 
          usuario: user.usuario,
          rol: user.rol 
        },
        process.env.JWT_SECRET || 'secreto_golden_nails_2024',
        { expiresIn: '24h' }
      );

      const userData = {
        usuario_id: user.usuario_id,
        nombre: user.nombre,
        apellido: user.apellido,
        usuario: user.usuario,
        correo: user.correo,
        rol: user.rol,
        estado: user.estado
      };
      
      console.log('✅ Login exitoso para:', user.usuario);
      
      res.json({
        success: true,
        message: 'Login exitoso',
        token,
        user: userData
      });
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

// ✅ MANEJO EXPLÍCITO DE OPTIONS PARA LOGIN
app.options('/api/auth/login', (req, res) => {
  res.header('Access-Control-Allow-Origin', 'https://sistemagolden.up.railway.app');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).end();
});

// ... (el resto de tus rutas aquí - mantener igual)

// RUTA PRINCIPAL
app.get("/", (req, res) => {
  res.json({ 
    message: "🚀 Backend Sistema Golden funcionando",
    status: "online", 
    cors: "enabled",
    timestamp: new Date().toISOString()
  });
});

// MANEJO DE RUTAS NO ENCONTRADAS
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Ruta no encontrada'
  });
});

// 🔹 Configuración del puerto
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📍 Health check: https://sistemagolden-backend-production.up.railway.app/health`);
  console.log(`📍 Frontend: https://sistemagolden.up.railway.app`);
});