// server.js - VERSIÓN MÍNIMA GARANTIZADA
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend funcionando',
    timestamp: new Date().toISOString()
  });
});

// Login simple
app.post('/api/auth/login', (req, res) => {
  const { usuario, contrasena } = req.body;
  
  if (!usuario || !contrasena) {
    return res.status(400).json({ 
      success: false,
      error: 'Usuario y contraseña requeridos' 
    });
  }

  res.json({
    success: true,
    message: 'Login exitoso',
    token: 'token-test-' + Date.now(),
    user: {
      usuario_id: 1,
      nombre: 'Admin',
      usuario: usuario,
      rol: 'admin'
    }
  });
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({ message: 'Golden Nails API' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});