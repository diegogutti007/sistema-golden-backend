const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createAdminUser() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'mysql',
      database: 'proyecto_golden',
      port: 3306,
    });

    const password = 'Golnail1'; // Cambia esta contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await connection.execute(
      `INSERT INTO usuario (nombre, apellido, correo, contrasena, rol, estado, usuario) 
       VALUES (?, ?, ?, ?, 'admin', 'activo', 'yberetta')`,
      ['Yessica', 'Beretta', 'yberetta@gmail.com', hashedPassword]
    );

    console.log('✅ Usuario admin creado exitosamente');
    console.log('📧 Correo: colaborador@goldennails.com');
    console.log('🔑 Contraseña: Golnail1');
    console.log('⚠️  Cambia esta contraseña inmediatamente después del primer login');

    await connection.end();
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('ℹ️  El usuario admin ya existe');
    } else {
      console.error('Error al crear usuario admin:', error);
    }
  }
}

createAdminUser();

//para crear nuevos
//curl -X POST http://localhost:5000/api/auth/create-admin
//curl -X POST http://localhost:5000/api/auth/login \
//  -H "Content-Type: application/json" \
//  -d '{"usuario":"admin","contrasena":"admin123"}'