const express = require('express');
const mysql = require('mysql2');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// ✅ MIDDLEWARES BÁSICOS
app.use(cors());
app.use(express.json());

// ✅ CONEXIÓN A BASE DE DATOS SIMPLIFICADA
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || 'mysql',
  database: process.env.MYSQLDATABASE || 'proyecto_golden',
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ✅ VERIFICAR CONEXIÓN A BD
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Error conectando a MySQL:', err.message);
  } else {
    console.log('✅ Conectado a MySQL en Railway');
    console.log('📊 Base de datos:', process.env.MYSQLDATABASE);
    connection.release();
  }
});

// ✅ HEALTH CHECK (RUTA PÚBLICA)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend funcionando',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ✅ RUTA DE LOGIN SIMPLIFICADA (RUTA PÚBLICA)
app.post('/api/auth/login', (req, res) => {
  console.log('🔐 Intento de login recibido');
  
  const { usuario, contrasena } = req.body;

  // Validación básica
  if (!usuario || !contrasena) {
    return res.status(400).json({ 
      success: false,
      error: 'Usuario y contraseña son requeridos' 
    });
  }

  // Para testing - acepta cualquier credencial
  console.log('👤 Login attempt:', usuario);
  
  // Simular login exitoso para testing
  const token = jwt.sign(
    { 
      usuario_id: 1, 
      usuario: usuario,
      rol: 'admin' 
    },
    'secreto_golden_nails_2024',
    { expiresIn: '24h' }
  );

  const userData = {
    usuario_id: 1,
    nombre: 'Administrador',
    apellido: 'Sistema',
    usuario: usuario,
    correo: 'admin@goldennails.com',
    rol: 'admin',
    estado: 'activo'
  };
  
  console.log('✅ Login exitoso (modo testing)');
  
  res.json({
    success: true,
    message: 'Login exitoso',
    token,
    user: userData
  });
});

// ✅ CREAR USUARIO ADMIN
app.post('/api/auth/create-admin', async (req, res) => {
  try {
    const hashedPassword = await bcryptjs.hash('admin123', 10);
    
    res.json({
      success: true,
      message: 'Endpoint funcionando',
      passwordHash: hashedPassword
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Error en el servidor' 
    });
  }
});

// ✅ RUTA DE PRUEBA
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'API funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// ✅ RUTA RAIZ
app.get('/', (req, res) => {
  res.json({ 
    message: 'Golden Nails Backend API',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// ✅ MANEJO DE ERRORES GLOBAL
app.use((err, req, res, next) => {
  console.error('❌ Error global:', err);
  res.status(500).json({ 
    success: false,
    error: 'Error interno del servidor' 
  });
});

// ✅ INICIAR SERVIDOR
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://0.0.0.0:${PORT}/health`);
});

console.log('✅ Aplicación iniciada correctamente');