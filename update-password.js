// update-password.js
const mysql = require('mysql2');
const bcryptjs = require('bcryptjs');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'mysql',
  database: 'proyecto_golden',
  port: 3306,
});

async function updateAdminPassword() {
  const nuevaContrasena = 'admin123'; // La nueva contraseña que quieres
  
  try {
    // Encriptar la nueva contraseña
    const hashedPassword = await bcryptjs.hash(nuevaContrasena, 10);
    
    pool.query(
      'UPDATE usuario SET contrasena = ? WHERE usuario = ?',
      [hashedPassword, 'dgutierrez'],
      (err, results) => {
        if (err) {
          console.error('❌ Error actualizando contraseña:', err);
          return;
        }
        
        if (results.affectedRows === 0) {
          console.log('❌ Usuario dgutierrez no encontrado');
        } else {
          console.log('✅ Contraseña actualizada exitosamente');
          console.log('👤 Usuario: dgutierrez');
          console.log('🔑 Nueva contraseña: admin123');
          console.log('🔐 Contraseña encriptada correctamente');
        }
        
        pool.end();
      }
    );
    
  } catch (error) {
    console.error('❌ Error encriptando contraseña:', error);
    pool.end();
  }
}

updateAdminPassword();