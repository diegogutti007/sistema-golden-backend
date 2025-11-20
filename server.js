// server.js - VERSIÓN CORREGIDA
const express = require('express');
const mysql = require('mysql2/promise');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// ✅ MIDDLEWARE CORS COMPLETO - IMPERATIVO
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  
  // Orígenes permitidos - CORREGIDO
  const allowedOrigins = [
    'https://sistemagolden.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ];
  
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    console.log(`✅ CORS permitido para: ${origin}`);
  } else if (origin) {
    console.log('🚫 Origen no permitido:', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // ✅ MANEJO IMPERATIVO DE PREFLIGHT REQUESTS
  if (req.method === 'OPTIONS') {
    console.log('🔄 Preflight OPTIONS handled successfully');
    return res.status(200).send();
  }
  
  next();
});

app.use(express.json({ limit: '10mb' }));

// ✅ CONEXIÓN A BASE DE DATOS CON MANEJO DE ERRORES
const createPool = () => {
  console.log('🔗 Creating MySQL connection pool...');
  try {
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
    console.log('✅ Pool de MySQL creado exitosamente');
    return pool;
  } catch (error) {
    console.error('❌ Error creando pool de MySQL:', error);
    return null;
  }
};

let pool;

// ✅ INICIALIZAR BASE DE DATOS AL INICIO
const initializeDatabase = async () => {
  try {
    pool = createPool();
    if (pool) {
      await pool.execute('SELECT 1');
      console.log('✅ Conexión a MySQL verificada');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error.message);
    return false;
  }
};

// ✅ HEALTH CHECK MEJORADO
app.get('/health', async (req, res) => {
  try {
    let dbStatus = 'disconnected';
    if (pool) {
      try {
        await pool.execute('SELECT 1');
        dbStatus = 'connected';
      } catch (dbError) {
        dbStatus = 'error';
      }
    }
    
    res.json({ 
      status: 'healthy',
      database: dbStatus,
      cors: 'enabled',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      database: 'unknown',
      error: error.message,
      cors: 'enabled',
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ RUTA RAIZ - IMPORTANTE
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Backend Sistema Golden funcionando',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// ✅ ENDPOINT DE TEST CORS ESPECÍFICO
app.get('/api/cors-test', (req, res) => {
  console.log('✅ CORS test endpoint called');
  res.json({
    success: true,
    message: '✅ CORS está funcionando correctamente',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    cors: 'enabled'
  });
});

// ✅ OPTIONS HANDLER PARA CORS TEST
app.options('/api/cors-test', (req, res) => {
  console.log('🔄 CORS test preflight handled');
  res.status(200).send();
});

// ✅ RUTA DE LOGIN MEJORADA
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Login attempt received for user:', req.body.usuario);
  
  try {
    const { usuario, contrasena } = req.body;

    // Validación básica
    if (!usuario || !contrasena) {
      return res.status(400).json({ 
        success: false,
        error: 'Usuario y contraseña son requeridos' 
      });
    }

    // Inicializar pool si no existe
    if (!pool) {
      const dbConnected = await initializeDatabase();
      if (!dbConnected) {
        return res.status(503).json({ 
          success: false,
          error: 'Servicio de base de datos no disponible' 
        });
      }
    }

    // Buscar usuario
    const [users] = await pool.execute(
      'SELECT usuario_id, nombre, apellido, usuario, correo, contrasena, rol, estado FROM usuario WHERE usuario = ?', 
      [usuario]
    );

    if (users.length === 0) {
      console.log('❌ Usuario no encontrado:', usuario);
      return res.status(401).json({ 
        success: false,
        error: 'Usuario o contraseña incorrectos' 
      });
    }

    const user = users[0];

    // Verificar estado
    if (user.estado !== 'activo') {
      return res.status(401).json({ 
        success: false,
        error: 'Usuario inactivo' 
      });
    }

    // Verificar contraseña
    const isPasswordValid = await bcryptjs.compare(contrasena, user.contrasena);
    
    if (!isPasswordValid) {
      console.log('❌ Contraseña incorrecta para:', usuario);
      return res.status(401).json({ 
        success: false,
        error: 'Usuario o contraseña incorrectos' 
      });
    }

    // Generar token
    const token = jwt.sign(
      { 
        usuario_id: user.usuario_id, 
        usuario: user.usuario,
        rol: user.rol 
      },
      process.env.JWT_SECRET || 'secreto_golden_nails_2024',
      { expiresIn: '24h' }
    );

    // Datos de usuario sin contraseña
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
    
    // Respuesta exitosa
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

// ✅ OPTIONS HANDLER ESPECÍFICO PARA LOGIN
app.options('/api/auth/login', (req, res) => {
  console.log('🔄 Login preflight handled');
  res.status(200).send();
});

// ✅ RUTA DE PRUEBA GENERAL
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: '✅ Backend funcionando correctamente',
    cors: 'enabled',
    timestamp: new Date().toISOString()
  });
});

// ✅ MANEJO DE ERRORES
app.use((err, req, res, next) => {
  console.error('❌ Error global:', err);
  res.status(500).json({ 
    success: false,
    error: 'Error interno del servidor',
    timestamp: new Date().toISOString()
  });
});

// ✅ RUTA NO ENCONTRADA
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Ruta no encontrada',
    path: req.originalUrl
  });
});

// ✅ INICIAR SERVIDOR CON INICIALIZACIÓN
const startServer = async () => {
  try {
    // Inicializar base de datos
    await initializeDatabase();
    
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      console.log(`📍 Health Check: /health`);
      console.log(`📍 Ruta raíz: /`);
      console.log('✅ CORS configurado para:');
      console.log('   - https://sistemagolden.up.railway.app');
      console.log('   - http://localhost:3000');
      console.log('   - http://localhost:5173');
    });
    
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
};

// Manejo graceful de shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Cerrando servidor gracefulmente...');
  if (pool) {
    await pool.end();
    console.log('✅ Conexión a BD cerrada');
  }
  process.exit(0);
});

// ✅ INICIAR LA APLICACIÓN
startServer();