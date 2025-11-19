// server.js - SOLUCIÓN DEFINITIVA CORS
const express = require('express');
const mysql = require('mysql2/promise');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// ✅ MIDDLEWARE CORS MANUAL - IMPERATIVO
app.use((req, res, next) => {
  // Lista de orígenes permitidos
  const allowedOrigins = [
    'https://sistemagolden.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ];
  
  const origin = req.headers.origin;
  
  // Si el origen está en la lista, permitirlo
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  // Headers esenciales para CORS
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas
  
  // ✅ MANEJO IMPERATIVO DE PREFLIGHT (OPTIONS)
  if (req.method === 'OPTIONS') {
    console.log('🔄 Preflight request recibida para:', req.path);
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json());

// ✅ CONEXIÓN A BASE DE DATOS
const createPool = () => {
  return mysql.createPool({
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
};

let pool;

// ✅ HEALTH CHECK
app.get('/health', async (req, res) => {
  try {
    if (!pool) pool = createPool();
    const [rows] = await pool.execute('SELECT 1 as test');
    
    res.json({ 
      status: 'healthy',
      database: 'connected', 
      cors: 'enabled',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      cors: 'enabled'
    });
  }
});

// ✅ RUTA DE LOGIN CON CORS EXPLÍCITO
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Login attempt received:', req.body);
  
  try {
    const { usuario, contrasena } = req.body;

    if (!usuario || !contrasena) {
      return res.status(400).json({ 
        success: false,
        error: 'Usuario y contraseña son requeridos' 
      });
    }

    if (!pool) pool = createPool();

    const [users] = await pool.execute(
      'SELECT usuario_id, nombre, apellido, usuario, correo, contrasena, rol, estado FROM usuario WHERE usuario = ?', 
      [usuario]
    );

    if (users.length === 0) {
      return res.status(401).json({ 
        success: false,
        error: 'Usuario o contraseña incorrectos' 
      });
    }

    const user = users[0];

    if (user.estado !== 'activo') {
      return res.status(401).json({ 
        success: false,
        error: 'Usuario inactivo' 
      });
    }

    const isPasswordValid = await bcryptjs.compare(contrasena, user.contrasena);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        error: 'Usuario o contraseña incorrectos' 
      });
    }

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

  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

// ✅ ENDPOINT DE TEST CORS
app.get('/api/cors-test', (req, res) => {
  res.json({
    success: true,
    message: '✅ CORS test exitoso',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// ✅ RUTA DE PRUEBA
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'Backend funcionando correctamente',
    cors: 'enabled'
  });
});

// ✅ MANEJO DE RUTAS NO ENCONTRADAS
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Ruta no encontrada',
    path: req.originalUrl
  });
});

// ✅ INICIAR SERVIDOR
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📍 CORS habilitado para:`);
  console.log(`   - https://sistemagolden.up.railway.app`);
  console.log(`   - http://localhost:3000`);
  console.log(`   - http://localhost:5173`);
});

// Manejo de cierre graceful
process.on('SIGTERM', async () => {
  console.log('🔄 Cerrando servidor...');
  if (pool) await pool.end();
  process.exit(0);
});