const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const router = express.Router();
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors());

app.use(express.json());

// 🔹 CONEXIÓN PARA PRODUCCIÓN (Railway) - REEMPLAZA TU CÓDIGO ACTUAL
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || 'mysql',
  database: process.env.MYSQLDATABASE || 'proyecto_golden',
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000
});

// Verificar conexión al iniciar
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Error de conexión a la base de datos: ', err);
    console.log('Variables de entorno:', {
      host: process.env.MYSQLHOST,
      user: process.env.MYSQLUSER,
      database: process.env.MYSQLDATABASE,
      port: process.env.MYSQLPORT
    });
    process.exit(1);
  } else {
    console.log('✅ Conectado a la base de datos en Railway');
    connection.release();
  }
});


// Agrega esta ruta para diagnosticar
app.get('/debug', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV,
    mysqlVars: {
      host: process.env.MYSQLHOST,
      user: process.env.MYSQLUSER,
      database: process.env.MYSQLDATABASE,
      port: process.env.MYSQLPORT,
      hasPassword: !!process.env.MYSQLPASSWORD
    },
    allEnvVars: process.env
  });
});


// Verificar conexión
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Error de conexión a la base de datos:', err.message);
  } else {
    console.log('✅ Conectado a la base de datos proyecto_golden');
    connection.release();
  }
});



// Middleware de log
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// 🔐 RUTA DE LOGIN
app.post('/api/auth/login', (req, res) => {
  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) {
    return res.status(400).json({
      success: false,
      error: 'Usuario y contraseña son requeridos'
    });
  }

  const sql = 'SELECT usuario_id, nombre, apellido, usuario, correo, contrasena, rol, estado FROM usuario WHERE usuario = ?';

  pool.query(sql, [usuario], async (err, results) => {
    if (err) {
      console.error('Error en consulta SQL:', err);
      return res.status(500).json({
        success: false,
        error: 'Error en la base de datos'
      });
    }

    if (results.length === 0) {
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

    try {
      // ✅ CORREGIDO: usar bcryptjs en lugar de bcrypt
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
        'secreto_golden_nails_2024',
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
      console.error('Error en bcryptjs:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  });
});

// 👑 CREAR USUARIO ADMIN
app.post('/api/auth/create-admin', async (req, res) => {
  const password = 'admin123';

  try {
    // ✅ CORREGIDO: usar bcryptjs
    const hashedPassword = await bcryptjs.hash(password, 10);

    const sql = `INSERT INTO usuario (nombre, apellido, usuario, correo, contrasena, rol, estado) 
                 VALUES (?, ?, ?, ?, ?, 'admin', 'activo')`;

    pool.query(sql, ['Administrador', 'Sistema', 'admin', 'admin@goldennails.com', hashedPassword], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.json({
            success: true,
            message: 'El usuario admin ya existe'
          });
        }
        console.error('Error creando admin:', err);
        return res.status(500).json({
          success: false,
          error: 'Error creando usuario admin'
        });
      }

      res.json({
        success: true,
        message: 'Usuario admin creado exitosamente',
        credentials: {
          usuario: 'admin',
          contraseña: 'admin123'
        }
      });
    });

  } catch (error) {
    console.error('Error hasheando contraseña:', error);
    res.status(500).json({
      success: false,
      error: 'Error creando usuario admin'
    });
  }
});

// 🔍 VERIFICAR TABLA
app.get('/api/auth/check-table', (req, res) => {
  const sql = "SHOW TABLES LIKE 'usuario'";

  pool.query(sql, (err, results) => {
    if (err) {
      console.error('Error verificando tabla:', err);
      return res.status(500).json({ error: 'Error en base de datos' });
    }

    res.json({
      tableExists: results.length > 0
    });
  });
});

// 👥 VER USUARIOS
app.get('/api/auth/users', (req, res) => {
  const sql = 'SELECT usuario_id, nombre, usuario, correo, rol, estado FROM usuario';

  pool.query(sql, (err, results) => {
    if (err) {
      console.error('Error obteniendo usuarios:', err);
      return res.status(500).json({ error: 'Error en base de datos' });
    }

    res.json({ users: results });
  });
});

// 🧪 RUTA DE PRUEBA
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Servidor funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});


const promisePool = pool.promise();

// ============================================
// FUNCIONES AUXILIARES (DEFINIDAS PRIMERO)
// ============================================

// Función para generar siguiente código de producto
const generarSiguienteCodigoProducto = async () => {
  try {
    console.log("🔍 Buscando último código de producto...");
    const [resultados] = await promisePool.query(
      `SELECT Codigo FROM articulo 
       WHERE Codigo LIKE 'PROD%' 
       ORDER BY CAST(SUBSTRING(Codigo, 5) AS UNSIGNED) DESC 
       LIMIT 1`
    );

    console.log("Último código de producto encontrado:", resultados);

    if (resultados.length === 0 || !resultados[0]?.Codigo) {
      console.log("📦 No hay productos, generando PROD001");
      return 'PROD001';
    }

    const ultimoCodigo = resultados[0].Codigo;
    const numeroStr = ultimoCodigo.substring(4);
    const numero = parseInt(numeroStr, 10);

    if (isNaN(numero)) {
      console.log("⚠️ Código inválido, generando PROD001");
      return 'PROD001';
    }

    const siguienteNumero = numero + 1;
    const nuevoCodigo = `PROD${siguienteNumero.toString().padStart(3, '0')}`;
    console.log(`✅ Nuevo código generado: ${nuevoCodigo}`);
    return nuevoCodigo;
  } catch (error) {
    console.error("❌ Error generando código de producto:", error);
    return 'PROD001';
  }
};

// Función para generar siguiente código de servicio
const generarSiguienteCodigoServicio = async () => {
  try {
    console.log("🔍 Buscando último código de servicio...");
    const [resultados] = await promisePool.query(
      `SELECT Codigo FROM articulo 
       WHERE Codigo LIKE 'SERV%' 
       ORDER BY CAST(SUBSTRING(Codigo, 5) AS UNSIGNED) DESC 
       LIMIT 1`
    );

    console.log("Último código de servicio encontrado:", resultados);

    if (resultados.length === 0 || !resultados[0]?.Codigo) {
      console.log("📦 No hay servicios, generando SERV001");
      return 'SERV001';
    }

    const ultimoCodigo = resultados[0].Codigo;
    const numeroStr = ultimoCodigo.substring(4);
    const numero = parseInt(numeroStr, 10);

    if (isNaN(numero)) {
      console.log("⚠️ Código inválido, generando SERV001");
      return 'SERV001';
    }

    const siguienteNumero = numero + 1;
    const nuevoCodigo = `SERV${siguienteNumero.toString().padStart(3, '0')}`;
    console.log(`✅ Nuevo código generado: ${nuevoCodigo}`);
    return nuevoCodigo;
  } catch (error) {
    console.error("❌ Error generando código de servicio:", error);
    return 'SERV001';
  }
};


//////////////////////////////////////////////////////
// ============================================
// ENDPOINTS DE GESTIÓN DE HORARIOS
// ============================================

// ============================================
// 1. OBTENER TODOS LOS HORARIOS
// ============================================
app.get('/api/horarios', async (req, res) => {
    try {
        const { activo, search, tipo_empleado } = req.query;
        
        let query = `
            SELECT h.*, 
                   COUNT(DISTINCT e.EmpId) as totalEmpleados,
                   COUNT(DISTINCT te.Tipo_EmpId) as totalTipos
            FROM horarios h
            LEFT JOIN empleado e ON h.HorarioId = e.HorarioId AND e.fecha_renuncia IS NULL
            LEFT JOIN tipo_empleado te ON h.HorarioId = te.HorarioId AND te.Activo = TRUE
            WHERE 1=1
        `;
        const params = [];
        
        // Filtro por estado
        if (activo !== undefined && activo !== '') {
            query += ' AND h.Activo = ?';
            params.push(activo === 'true' || activo === '1');
        }
        
        // Filtro por búsqueda
        if (search) {
            query += ' AND (h.Nombre LIKE ? OR h.Codigo LIKE ? OR h.Descripcion LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        // Filtro por tipo de empleado
        if (tipo_empleado) {
            query += ' AND EXISTS (SELECT 1 FROM tipo_empleado te2 WHERE te2.HorarioId = h.HorarioId AND te2.Tipo_EmpId = ?)';
            params.push(tipo_empleado);
        }
        
        query += ' GROUP BY h.HorarioId ORDER BY h.HoraEntrada ASC, h.Nombre ASC';
        
        const [horarios] = await promisePool.query(query, params);
        
        // Formatear horas
        const horariosFormateados = horarios.map(h => ({
            ...h,
            HoraEntrada: h.HoraEntrada ? h.HoraEntrada.substring(0, 5) : null,
            HoraSalida: h.HoraSalida ? h.HoraSalida.substring(0, 5) : null,
            HoraAlmuerzoInicio: h.HoraAlmuerzoInicio ? h.HoraAlmuerzoInicio.substring(0, 5) : null,
            HoraAlmuerzoFin: h.HoraAlmuerzoFin ? h.HoraAlmuerzoFin.substring(0, 5) : null
        }));
        
        res.json(horariosFormateados);
        
    } catch (error) {
        console.error('❌ Error obteniendo horarios:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 2. OBTENER UN HORARIO POR ID
// ============================================
app.get('/api/horarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [horario] = await promisePool.query(
            `SELECT h.*, 
                    COUNT(DISTINCT e.EmpId) as totalEmpleados,
                    COUNT(DISTINCT te.Tipo_EmpId) as totalTipos
             FROM horarios h
             LEFT JOIN empleado e ON h.HorarioId = e.HorarioId AND e.fecha_renuncia IS NULL
             LEFT JOIN tipo_empleado te ON h.HorarioId = te.HorarioId AND te.Activo = TRUE
             WHERE h.HorarioId = ?
             GROUP BY h.HorarioId`,
            [id]
        );
        
        if (horario.length === 0) {
            return res.status(404).json({ error: 'Horario no encontrado' });
        }
        
        // Formatear horas
        const horarioFormateado = {
            ...horario[0],
            HoraEntrada: horario[0].HoraEntrada ? horario[0].HoraEntrada.substring(0, 5) : null,
            HoraSalida: horario[0].HoraSalida ? horario[0].HoraSalida.substring(0, 5) : null,
            HoraAlmuerzoInicio: horario[0].HoraAlmuerzoInicio ? horario[0].HoraAlmuerzoInicio.substring(0, 5) : null,
            HoraAlmuerzoFin: horario[0].HoraAlmuerzoFin ? horario[0].HoraAlmuerzoFin.substring(0, 5) : null
        };
        
        res.json(horarioFormateado);
        
    } catch (error) {
        console.error('❌ Error obteniendo horario:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 3. CREAR NUEVO HORARIO
// ============================================
app.post('/api/horarios', async (req, res) => {
    try {
        const {
            Codigo,
            Nombre,
            Descripcion,
            HoraEntrada,
            HoraSalida,
            HoraAlmuerzoInicio,
            HoraAlmuerzoFin,
            ToleranciaEntrada,
            ToleranciaSalida,
            HorasLaborales,
            DiasLaborales,
            Activo,
            EsTurnoNoche,
            TieneAlmuerzo
        } = req.body;
        
        // Validaciones
        if (!Codigo || !Nombre || !HoraEntrada || !HoraSalida) {
            return res.status(400).json({ 
                error: 'Faltan campos requeridos',
                required: ['Codigo', 'Nombre', 'HoraEntrada', 'HoraSalida']
            });
        }
        
        // Validar código único
        const [existente] = await promisePool.query(
            'SELECT HorarioId FROM horarios WHERE Codigo = ?',
            [Codigo]
        );
        
        if (existente.length > 0) {
            return res.status(400).json({ error: 'El código de horario ya existe' });
        }
        
        // Validar que hora entrada sea menor a hora salida
        if (HoraEntrada >= HoraSalida && !EsTurnoNoche) {
            return res.status(400).json({ 
                error: 'La hora de entrada debe ser menor que la hora de salida' 
            });
        }
        
        // Validar almuerzo
        if (TieneAlmuerzo && (!HoraAlmuerzoInicio || !HoraAlmuerzoFin)) {
            return res.status(400).json({ 
                error: 'Debe especificar inicio y fin de almuerzo' 
            });
        }
        
        if (TieneAlmuerzo && HoraAlmuerzoInicio >= HoraAlmuerzoFin) {
            return res.status(400).json({ 
                error: 'La hora de inicio de almuerzo debe ser menor que la hora de fin' 
            });
        }
        
        // Insertar horario
        const [result] = await promisePool.query(
            `INSERT INTO horarios 
             (Codigo, Nombre, Descripcion, HoraEntrada, HoraSalida, 
              HoraAlmuerzoInicio, HoraAlmuerzoFin, ToleranciaEntrada, 
              ToleranciaSalida, HorasLaborales, DiasLaborales, Activo, 
              EsTurnoNoche, TieneAlmuerzo, UsuarioCreacion) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                Codigo.toUpperCase(), 
                Nombre, 
                Descripcion || null, 
                HoraEntrada, 
                HoraSalida,
                TieneAlmuerzo ? HoraAlmuerzoInicio : null,
                TieneAlmuerzo ? HoraAlmuerzoFin : null,
                ToleranciaEntrada || 15,
                ToleranciaSalida || 15,
                HorasLaborales || 8,
                DiasLaborales || '1,2,3,4,5',
                Activo !== false,
                EsTurnoNoche || false,
                TieneAlmuerzo !== false,
                req.usuario?.nombre || 'Sistema'
            ]
        );
        
        // Registrar en bitácora
        console.log(`✅ Horario creado: ${Codigo} - ${Nombre}`);
        
        res.json({
            success: true,
            message: 'Horario creado exitosamente',
            horarioId: result.insertId
        });
        
    } catch (error) {
        console.error('❌ Error creando horario:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 4. ACTUALIZAR HORARIO
// ============================================
app.put('/api/horarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Verificar que el horario existe
        const [horario] = await promisePool.query(
            'SELECT * FROM horarios WHERE HorarioId = ?',
            [id]
        );
        
        if (horario.length === 0) {
            return res.status(404).json({ error: 'Horario no encontrado' });
        }
        
        // Validar código único (si se está cambiando)
        if (updates.Codigo && updates.Codigo !== horario[0].Codigo) {
            const [existente] = await promisePool.query(
                'SELECT HorarioId FROM horarios WHERE Codigo = ? AND HorarioId != ?',
                [updates.Codigo, id]
            );
            if (existente.length > 0) {
                return res.status(400).json({ error: 'El código de horario ya existe' });
            }
        }
        
        // Construir query dinámica
        const camposPermitidos = [
            'Codigo', 'Nombre', 'Descripcion', 'HoraEntrada', 'HoraSalida',
            'HoraAlmuerzoInicio', 'HoraAlmuerzoFin', 'ToleranciaEntrada',
            'ToleranciaSalida', 'HorasLaborales', 'DiasLaborales',
            'Activo', 'EsTurnoNoche', 'TieneAlmuerzo'
        ];
        
        const campos = [];
        const valores = [];
        
        for (const campo of camposPermitidos) {
            if (updates[campo] !== undefined) {
                // Manejar campos especiales
                if (campo === 'HoraAlmuerzoInicio' || campo === 'HoraAlmuerzoFin') {
                    if (updates.TieneAlmuerzo !== false && updates[campo]) {
                        campos.push(`${campo} = ?`);
                        valores.push(updates[campo]);
                    } else if (campo === 'HoraAlmuerzoInicio' && updates.TieneAlmuerzo === false) {
                        campos.push(`${campo} = NULL`);
                    } else {
                        campos.push(`${campo} = ?`);
                        valores.push(updates[campo] || null);
                    }
                } else if (campo === 'TieneAlmuerzo') {
                    campos.push(`${campo} = ?`);
                    valores.push(updates[campo] ? 1 : 0);
                } else {
                    campos.push(`${campo} = ?`);
                    valores.push(updates[campo]);
                }
            }
        }
        
        if (campos.length === 0) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }
        
        valores.push(id);
        
        await promisePool.query(
            `UPDATE horarios SET ${campos.join(', ')} WHERE HorarioId = ?`,
            valores
        );
        
        console.log(`✅ Horario actualizado: ID ${id}`);
        
        res.json({
            success: true,
            message: 'Horario actualizado exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error actualizando horario:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 5. ELIMINAR HORARIO (Soft delete)
// ============================================
app.delete('/api/horarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que el horario existe
        const [horario] = await promisePool.query(
            'SELECT * FROM horarios WHERE HorarioId = ?',
            [id]
        );
        
        if (horario.length === 0) {
            return res.status(404).json({ error: 'Horario no encontrado' });
        }
        
        // Verificar si hay empleados usando este horario
        const [empleados] = await promisePool.query(
            'SELECT COUNT(*) as total FROM empleado WHERE HorarioId = ? AND fecha_renuncia IS NULL',
            [id]
        );
        
        if (empleados[0].total > 0) {
            return res.status(400).json({ 
                error: 'No se puede eliminar el horario',
                message: `Hay ${empleados[0].total} empleados activos con este horario. Desactívalo primero.`
            });
        }
        
        // Verificar si hay tipos de empleado usando este horario
        const [tipos] = await promisePool.query(
            'SELECT COUNT(*) as total FROM tipo_empleado WHERE HorarioId = ? AND Activo = TRUE',
            [id]
        );
        
        if (tipos[0].total > 0) {
            return res.status(400).json({ 
                error: 'No se puede eliminar el horario',
                message: `Hay ${tipos[0].total} tipos de empleado que usan este horario.`
            });
        }
        
        // Soft delete: desactivar en lugar de eliminar
        await promisePool.query(
            'UPDATE horarios SET Activo = FALSE WHERE HorarioId = ?',
            [id]
        );
        
        console.log(`✅ Horario desactivado: ID ${id}`);
        
        res.json({
            success: true,
            message: 'Horario desactivado exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error eliminando horario:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 6. ASIGNAR HORARIO A EMPLEADO
// ============================================
app.post('/api/empleados/:id/asignar-horario', async (req, res) => {
    try {
        const { id } = req.params;
        const { horarioId, fechaInicio, motivo } = req.body;
        
        if (!horarioId) {
            return res.status(400).json({ error: 'Debe especificar un horario' });
        }
        
        // Verificar empleado
        const [empleado] = await promisePool.query(
            'SELECT EmpId, Nombres, Apellidos, HorarioId as HorarioActual FROM empleado WHERE EmpId = ?',
            [id]
        );
        
        if (empleado.length === 0) {
            return res.status(404).json({ error: 'Empleado no encontrado' });
        }
        
        // Verificar horario
        const [horario] = await promisePool.query(
            'SELECT * FROM horarios WHERE HorarioId = ? AND Activo = TRUE',
            [horarioId]
        );
        
        if (horario.length === 0) {
            return res.status(404).json({ error: 'Horario no encontrado o inactivo' });
        }
        
        // Guardar horario anterior
        const horarioAnteriorId = empleado[0].HorarioActual;
        
        // Actualizar empleado
        await promisePool.query(
            `UPDATE empleado 
             SET HorarioId = ?, HorarioPersonalizado = TRUE, FechaModificacion = NOW()
             WHERE EmpId = ?`,
            [horarioId, id]
        );
        
        // Registrar en historial de cambios
        await promisePool.query(
            `INSERT INTO historial_cambio_horario 
             (EmpleadoId, HorarioAnteriorId, HorarioNuevoId, Motivo, Usuario) 
             VALUES (?, ?, ?, ?, ?)`,
            [id, horarioAnteriorId, horarioId, motivo || 'Asignación manual', req.usuario?.nombre || 'Sistema']
        );
        
        console.log(`✅ Horario asignado: ${empleado[0].Nombres} - ${horario[0].Nombre}`);
        
        res.json({
            success: true,
            message: `Horario "${horario[0].Nombre}" asignado a ${empleado[0].Nombres} ${empleado[0].Apellidos}`,
            empleado: empleado[0],
            horario: horario[0]
        });
        
    } catch (error) {
        console.error('❌ Error asignando horario:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 7. OBTENER HORARIO DE EMPLEADO
// ============================================
app.get('/api/empleados/:id/horario', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [empleado] = await promisePool.query(
            `SELECT e.*, h.*, t.Nombre as TipoEmpleado
             FROM empleado e
             LEFT JOIN horarios h ON e.HorarioId = h.HorarioId
             LEFT JOIN tipo_empleado t ON e.Tipo_EmpId = t.Tipo_EmpId
             WHERE e.EmpId = ?`,
            [id]
        );
        
        if (empleado.length === 0) {
            return res.status(404).json({ error: 'Empleado no encontrado' });
        }
        
        res.json({
            empleado: {
                EmpId: empleado[0].EmpId,
                Nombres: empleado[0].Nombres,
                Apellidos: empleado[0].Apellidos,
                TipoEmpleado: empleado[0].TipoEmpleado
            },
            horario: empleado[0].HorarioId ? {
                HorarioId: empleado[0].HorarioId,
                Codigo: empleado[0].Codigo,
                Nombre: empleado[0].Nombre,
                HoraEntrada: empleado[0].HoraEntrada,
                HoraSalida: empleado[0].HoraSalida,
                HoraAlmuerzoInicio: empleado[0].HoraAlmuerzoInicio,
                HoraAlmuerzoFin: empleado[0].HoraAlmuerzoFin,
                ToleranciaEntrada: empleado[0].ToleranciaEntrada,
                DiasLaborales: empleado[0].DiasLaborales
            } : null,
            horarioPersonalizado: empleado[0].HorarioPersonalizado === 1
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo horario de empleado:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 8. CREAR EXCEPCIÓN DE HORARIO
// ============================================
app.post('/api/horarios/excepciones', async (req, res) => {
    try {
        const { empleadoId, horarioId, fechaInicio, fechaFin, motivo } = req.body;
        
        if (!empleadoId || !fechaInicio || !fechaFin) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }
        
        // Verificar empleado
        const [empleado] = await promisePool.query(
            'SELECT EmpId, Nombres FROM empleado WHERE EmpId = ?',
            [empleadoId]
        );
        
        if (empleado.length === 0) {
            return res.status(404).json({ error: 'Empleado no encontrado' });
        }
        
        // Verificar horario si se especificó
        if (horarioId) {
            const [horario] = await promisePool.query(
                'SELECT HorarioId FROM horarios WHERE HorarioId = ?',
                [horarioId]
            );
            if (horario.length === 0) {
                return res.status(404).json({ error: 'Horario no encontrado' });
            }
        }
        
        // Validar fechas
        if (new Date(fechaInicio) > new Date(fechaFin)) {
            return res.status(400).json({ error: 'La fecha de inicio debe ser menor que la fecha de fin' });
        }
        
        // Insertar excepción
        const [result] = await promisePool.query(
            `INSERT INTO horario_excepcion 
             (EmpleadoId, HorarioId, FechaInicio, FechaFin, Motivo) 
             VALUES (?, ?, ?, ?, ?)`,
            [empleadoId, horarioId || null, fechaInicio, fechaFin, motivo || null]
        );
        
        console.log(`✅ Excepción creada para empleado ${empleado[0].Nombres}`);
        
        res.json({
            success: true,
            message: 'Excepción de horario creada exitosamente',
            excepcionId: result.insertId
        });
        
    } catch (error) {
        console.error('❌ Error creando excepción:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 9. OBTENER EXCEPCIONES DE HORARIO
// ============================================
app.get('/api/horarios/excepciones', async (req, res) => {
    try {
        const { empleadoId, estado, fecha } = req.query;
        
        let query = `
            SELECT he.*, e.Nombres, e.Apellidos, e.DocID,
                   h.Nombre as HorarioNombre, h.Codigo as HorarioCodigo
            FROM horario_excepcion he
            INNER JOIN empleado e ON he.EmpleadoId = e.EmpId
            LEFT JOIN horarios h ON he.HorarioId = h.HorarioId
            WHERE 1=1
        `;
        const params = [];
        
        if (empleadoId) {
            query += ' AND he.EmpleadoId = ?';
            params.push(empleadoId);
        }
        
        if (estado) {
            query += ' AND he.Estado = ?';
            params.push(estado);
        }
        
        if (fecha) {
            query += ' AND ? BETWEEN he.FechaInicio AND he.FechaFin';
            params.push(fecha);
        }
        
        query += ' ORDER BY he.FechaInicio DESC, he.FechaSolicitud DESC';
        
        const [excepciones] = await promisePool.query(query, params);
        
        res.json(excepciones);
        
    } catch (error) {
        console.error('❌ Error obteniendo excepciones:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 10. APROBAR/RECHAZAR EXCEPCIÓN DE HORARIO
// ============================================
app.put('/api/horarios/excepciones/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, comentario } = req.body;
        
        if (!estado || !['Aprobado', 'Rechazado'].includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }
        
        const [excepcion] = await promisePool.query(
            'SELECT * FROM horario_excepcion WHERE ExcepcionId = ?',
            [id]
        );
        
        if (excepcion.length === 0) {
            return res.status(404).json({ error: 'Excepción no encontrada' });
        }
        
        await promisePool.query(
            `UPDATE horario_excepcion 
             SET Estado = ?, FechaAprobacion = NOW(), UsuarioAprobacion = ?
             WHERE ExcepcionId = ?`,
            [estado, req.usuario?.nombre || 'Sistema', id]
        );
        
        console.log(`✅ Excepción ${estado}: ID ${id}`);
        
        res.json({
            success: true,
            message: `Excepción ${estado.toLowerCase()} exitosamente`
        });
        
    } catch (error) {
        console.error('❌ Error aprobando excepción:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 11. OBTENER TIPOS DE EMPLEADO (para asignar horarios)
// ============================================
app.get('/api/tipos-empleado', async (req, res) => {
    try {
        const [tipos] = await promisePool.query(
            `SELECT t.*, h.Nombre as HorarioNombre, h.Codigo as HorarioCodigo,
                    h.HoraEntrada, h.HoraSalida
             FROM tipo_empleado t
             LEFT JOIN horarios h ON t.HorarioId = h.HorarioId
             WHERE t.Activo = TRUE
             ORDER BY t.Tipo_EmpId`
        );
        
        res.json(tipos);
        
    } catch (error) {
        console.error('❌ Error obteniendo tipos de empleado:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 12. ASIGNAR HORARIO A TIPO DE EMPLEADO
// ============================================
app.put('/api/tipos-empleado/:id/horario', async (req, res) => {
    try {
        const { id } = req.params;
        const { horarioId } = req.body;
        
        const [tipo] = await promisePool.query(
            'SELECT * FROM tipo_empleado WHERE Tipo_EmpId = ?',
            [id]
        );
        
        if (tipo.length === 0) {
            return res.status(404).json({ error: 'Tipo de empleado no encontrado' });
        }
        
        if (horarioId) {
            const [horario] = await promisePool.query(
                'SELECT HorarioId FROM horarios WHERE HorarioId = ?',
                [horarioId]
            );
            if (horario.length === 0) {
                return res.status(404).json({ error: 'Horario no encontrado' });
            }
        }
        
        await promisePool.query(
            'UPDATE tipo_empleado SET HorarioId = ? WHERE Tipo_EmpId = ?',
            [horarioId || null, id]
        );
        
        console.log(`✅ Horario asignado a tipo de empleado ${id}`);
        
        res.json({
            success: true,
            message: 'Horario asignado correctamente'
        });
        
    } catch (error) {
        console.error('❌ Error asignando horario a tipo:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 13. OBTENER HORARIO DEL DÍA PARA EMPLEADO
// ============================================
app.get('/api/empleados/:id/horario-hoy', async (req, res) => {
    try {
        const { id } = req.params;
        const hoy = new Date().toISOString().split('T')[0];
        const diaSemana = new Date().getDay();
        const diaNumero = diaSemana === 0 ? 7 : diaSemana;
        
        // Verificar excepción
        const [excepcion] = await promisePool.query(
            `SELECT h.* 
             FROM horario_excepcion he
             INNER JOIN horarios h ON he.HorarioId = h.HorarioId
             WHERE he.EmpleadoId = ? 
               AND he.Estado = 'Aprobado'
               AND ? BETWEEN he.FechaInicio AND he.FechaFin`,
            [id, hoy]
        );
        
        if (excepcion.length > 0) {
            return res.json({
                tipo: 'excepcion',
                horario: excepcion[0],
                mensaje: 'Horario especial por excepción'
            });
        }
        
        // Obtener horario del empleado
        const [empleado] = await promisePool.query(
            `SELECT e.HorarioId, e.HorarioPersonalizado, h.*
             FROM empleado e
             LEFT JOIN horarios h ON e.HorarioId = h.HorarioId
             WHERE e.EmpId = ?`,
            [id]
        );
        
        if (empleado.length > 0 && empleado[0].HorarioId) {
            // Verificar si es día laborable
            const diasLaborales = empleado[0].DiasLaborales || '1,2,3,4,5';
            const esLaborable = diasLaborales.split(',').includes(diaNumero.toString());
            
            return res.json({
                tipo: empleado[0].HorarioPersonalizado ? 'personalizado' : 'asignado',
                horario: empleado[0],
                esLaborable,
                mensaje: esLaborable ? 'Día laborable' : 'Día no laborable'
            });
        }
        
        // Obtener horario por tipo de empleado
        const [porTipo] = await promisePool.query(
            `SELECT t.HorarioId, h.*
             FROM empleado e
             INNER JOIN tipo_empleado t ON e.Tipo_EmpId = t.Tipo_EmpId
             INNER JOIN horarios h ON t.HorarioId = h.HorarioId
             WHERE e.EmpId = ?`,
            [id]
        );
        
        if (porTipo.length > 0) {
            const diasLaborales = porTipo[0].DiasLaborales || '1,2,3,4,5';
            const esLaborable = diasLaborales.split(',').includes(diaNumero.toString());
            
            return res.json({
                tipo: 'tipo_empleado',
                horario: porTipo[0],
                esLaborable,
                mensaje: esLaborable ? 'Día laborable' : 'Día no laborable'
            });
        }
        
        res.json({
            tipo: 'sin_horario',
            horario: null,
            mensaje: 'El empleado no tiene horario asignado'
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo horario del día:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 14. REPORTE DE HORARIOS POR EMPLEADO
// ============================================
app.get('/api/reportes/horarios-empleados', async (req, res) => {
    try {
        const { fecha_corte } = req.query;
        const fecha = fecha_corte || new Date().toISOString().split('T')[0];
        
        const [reporte] = await promisePool.query(
            `SELECT 
                e.EmpId,
                e.DocID as Codigo,
                e.Nombres,
                e.Apellidos,
                e.Tipo_EmpId,
                t.Nombre as TipoEmpleado,
                COALESCE(e.HorarioId, t.HorarioId) as HorarioIdAplicado,
                h.Nombre as HorarioNombre,
                h.Codigo as HorarioCodigo,
                h.HoraEntrada,
                h.HoraSalida,
                h.HoraAlmuerzoInicio,
                h.HoraAlmuerzoFin,
                h.ToleranciaEntrada,
                h.DiasLaborales,
                CASE 
                    WHEN e.HorarioId IS NOT NULL AND e.HorarioPersonalizado = TRUE THEN 'Personalizado'
                    WHEN e.HorarioId IS NOT NULL THEN 'Asignado'
                    WHEN t.HorarioId IS NOT NULL THEN 'Por Tipo'
                    ELSE 'Sin Horario'
                END as TipoAsignacion
             FROM empleado e
             LEFT JOIN tipo_empleado t ON e.Tipo_EmpId = t.Tipo_EmpId
             LEFT JOIN horarios h ON COALESCE(e.HorarioId, t.HorarioId) = h.HorarioId
             WHERE e.fecha_renuncia IS NULL
             ORDER BY e.Nombres`,
            []
        );
        
        // Estadísticas
        const totalEmpleados = reporte.length;
        const conHorario = reporte.filter(r => r.HorarioIdAplicado).length;
        const sinHorario = totalEmpleados - conHorario;
        const horariosUtilizados = [...new Set(reporte.filter(r => r.HorarioIdAplicado).map(r => r.HorarioNombre))];
        
        res.json({
            datos: reporte,
            estadisticas: {
                totalEmpleados,
                conHorario,
                sinHorario,
                porcentajeCobertura: totalEmpleados > 0 ? (conHorario / totalEmpleados * 100).toFixed(2) : 0,
                horariosUtilizados
            }
        });
        
    } catch (error) {
        console.error('❌ Error generando reporte:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 15. VALIDAR SI ES HORARIO LABORAL
// ============================================
app.get('/api/horarios/validar/:horarioId/:fecha', async (req, res) => {
    try {
        const { horarioId, fecha } = req.params;
        
        const [horario] = await promisePool.query(
            'SELECT * FROM horarios WHERE HorarioId = ?',
            [horarioId]
        );
        
        if (horario.length === 0) {
            return res.status(404).json({ error: 'Horario no encontrado' });
        }
        
        const diaSemana = new Date(fecha).getDay();
        const diaNumero = diaSemana === 0 ? 7 : diaSemana;
        const diasLaborales = horario[0].DiasLaborales || '1,2,3,4,5';
        const esLaborable = diasLaborales.split(',').includes(diaNumero.toString());
        
        // Verificar feriado
        const [feriado] = await promisePool.query(
            'SELECT * FROM feriados WHERE Fecha = ? AND EsLaborable = FALSE',
            [fecha]
        );
        
        const esFeriado = feriado.length > 0;
        
        res.json({
            fecha,
            horario: horario[0],
            esLaborable: esLaborable && !esFeriado,
            esFeriado,
            mensaje: esFeriado ? 'Feriado no laborable' : (esLaborable ? 'Día laborable' : 'Día no laborable según horario')
        });
        
    } catch (error) {
        console.error('❌ Error validando horario:', error);
        res.status(500).json({ error: error.message });
    }
});
/////////////////////////////////////////////////















// ============================================
// ENDPOINTS PARA CATEGORÍAS
// ============================================
app.get('/api/categorias_servicio', async (req, res) => {
  try {
    const [resultados] = await promisePool.query(
      'SELECT CategoriaID, Nombre, Descripcion FROM categoria ORDER BY Nombre'
    );
    res.json(resultados);
  } catch (err) {
    console.error("❌ Error obteniendo categorías:", err);
    return res.status(500).json({
      error: "Error obteniendo categorías",
      detalles: err.message
    });
  }
});
// ============================================
// ENDPOINTS PARA PRODUCTOS
// ============================================

// Obtener SOLO PRODUCTOS
app.get('/api/productos', async (req, res) => {
  try {
    console.log("📦 Solicitando productos...");
    const [resultados] = await promisePool.query(
      `SELECT a.ArticuloID, a.Codigo, a.Nombre, a.Descripcion, 
              a.PrecioCompra, a.PrecioVenta, a.Stock,
              a.UnidadMedida, a.CategoriaID, a.Estado, a.fecha_creacion,
              c.Nombre as CategoriaNombre 
       FROM articulo a
       LEFT JOIN categoria c ON a.CategoriaID = c.CategoriaID
       WHERE a.Codigo LIKE 'PROD%' 
       ORDER BY a.fecha_creacion DESC`
    );

    console.log(`✅ ${resultados.length} productos encontrados`);
    res.json(resultados);
  } catch (err) {
    console.error("❌ Error obteniendo productos:", err);
    return res.status(500).json({
      error: "Error obteniendo productos",
      detalles: err.message
    });
  }
});

// Crear nuevo PRODUCTO (sin StockMinimo)
app.post('/api/productos', async (req, res) => {
  try {
    const {
      Nombre,
      Descripcion,
      PrecioCompra,
      PrecioVenta,
      Stock,
      UnidadMedida,
      CategoriaID,
      Estado
    } = req.body;

    console.log("📦 Recibiendo solicitud para crear producto:", req.body);

    // Validar campos obligatorios
    if (!Nombre || !PrecioVenta) {
      return res.status(400).json({
        error: "Campos obligatorios",
        message: "El nombre y precio de venta son requeridos"
      });
    }

    // Generar código automático
    const codigoGenerado = await generarSiguienteCodigoProducto();
    console.log("📦 Código generado:", codigoGenerado);

    const [resultado] = await promisePool.query(
      `INSERT INTO articulo 
       (Codigo, Nombre, Descripcion, PrecioCompra, PrecioVenta, Stock, UnidadMedida, CategoriaID, Estado) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        codigoGenerado,
        Nombre,
        Descripcion || null,
        PrecioCompra || 0.00,
        PrecioVenta,
        Stock || 0,
        UnidadMedida || 'Unidad',
        CategoriaID || null,
        Estado || 'Activo'
      ]
    );

    const [nuevoProducto] = await promisePool.query(
      `SELECT a.*, c.Nombre as CategoriaNombre 
       FROM articulo a
       LEFT JOIN categoria c ON a.CategoriaID = c.CategoriaID
       WHERE a.ArticuloID = ?`,
      [resultado.insertId]
    );

    console.log(`✅ Producto creado: ID ${resultado.insertId} - Código: ${codigoGenerado}`);
    res.status(201).json(nuevoProducto[0]);
  } catch (err) {
    console.error("❌ Error creando producto:", err);

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        error: "Error de duplicado",
        message: "Ocurrió un error al generar el código. Intente nuevamente."
      });
    }

    return res.status(500).json({
      error: "Error creando producto",
      detalles: err.message
    });
  }
});

// Actualizar PRODUCTO (sin StockMinimo)
app.put('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      Nombre,
      Descripcion,
      PrecioCompra,
      PrecioVenta,
      Stock,
      UnidadMedida,
      CategoriaID,
      Estado
    } = req.body;

    console.log("📦 Actualizando producto ID:", id, req.body);

    if (!Nombre || !PrecioVenta) {
      return res.status(400).json({
        error: "Campos obligatorios",
        message: "El nombre y precio de venta son requeridos"
      });
    }

    const [resultado] = await promisePool.query(
      `UPDATE articulo 
       SET Nombre = ?, Descripcion = ?, PrecioCompra = ?, 
           PrecioVenta = ?, Stock = ?, UnidadMedida = ?, 
           CategoriaID = ?, Estado = ?
       WHERE ArticuloID = ? AND Codigo LIKE 'PROD%'`,
      [
        Nombre,
        Descripcion || null,
        PrecioCompra || 0.00,
        PrecioVenta,
        Stock || 0,
        UnidadMedida || 'Unidad',
        CategoriaID || null,
        Estado || 'Activo',
        id
      ]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    const [productoActualizado] = await promisePool.query(
      `SELECT a.*, c.Nombre as CategoriaNombre 
       FROM articulo a
       LEFT JOIN categoria c ON a.CategoriaID = c.CategoriaID
       WHERE a.ArticuloID = ?`,
      [id]
    );

    console.log(`✅ Producto actualizado: ID ${id}`);
    res.json(productoActualizado[0]);
  } catch (err) {
    console.error("❌ Error actualizando producto:", err);
    return res.status(500).json({
      error: "Error actualizando producto",
      detalles: err.message
    });
  }
});



// Eliminar PRODUCTO - VERSIÓN CORREGIDA
app.delete('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🗑️ Solicitando eliminar producto ID:", id);

    // Validar que el ID sea un número
    if (isNaN(id)) {
      return res.status(400).json({
        error: "ID inválido",
        message: "El ID del producto debe ser un número"
      });
    }

    // Primero verificar si el producto existe y es un producto (código PROD)
    const [resultados] = await promisePool.query(
      'SELECT * FROM articulo WHERE ArticuloID = ? AND Codigo LIKE "PROD%"',
      [id]
    );

    if (resultados.length === 0) {
      console.log("⚠️ Producto no encontrado con ID:", id);
      return res.status(404).json({
        error: "Producto no encontrado",
        message: "No existe un producto con ese ID"
      });
    }

    console.log("📦 Producto encontrado:", resultados[0]);

    // Eliminar el producto
    const [deleteResult] = await promisePool.query(
      'DELETE FROM articulo WHERE ArticuloID = ?',
      [id]
    );

    console.log("✅ Resultado de eliminación:", deleteResult);

    if (deleteResult.affectedRows === 0) {
      return res.status(500).json({
        error: "Error al eliminar",
        message: "No se pudo eliminar el producto"
      });
    }

    console.log(`✅ Producto eliminado exitosamente: ID ${id} - ${resultados[0].Nombre}`);
    res.json({
      message: "Producto eliminado correctamente",
      producto: resultados[0]
    });
  } catch (err) {
    console.error("❌ Error eliminando producto:", err);

    // Error de llave foránea (si el producto está siendo usado en otras tablas)
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        error: "Producto en uso",
        message: "No se puede eliminar el producto porque está siendo utilizado en otras partes del sistema"
      });
    }

    return res.status(500).json({
      error: "Error eliminando producto",
      message: err.message,
      detalles: err.sqlMessage || err.message
    });
  }
});


// ============================================
// ENDPOINTS PARA SERVICIOS
// ============================================

// Obtener SOLO SERVICIOS
app.get('/api/servicios', async (req, res) => {
  try {
    console.log("📦 Solicitando servicios...");
    const [resultados] = await promisePool.query(
      `SELECT a.ArticuloID, a.Codigo, a.Nombre, a.Descripcion, 
              a.PrecioCompra, a.PrecioVenta, a.Stock,
              a.UnidadMedida, a.CategoriaID, a.Estado, a.fecha_creacion,
              c.Nombre as CategoriaNombre 
       FROM articulo a
       LEFT JOIN categoria c ON a.CategoriaID = c.CategoriaID
       WHERE a.Codigo LIKE 'SERV%' 
       ORDER BY a.fecha_creacion DESC`
    );

    console.log(`✅ ${resultados.length} servicios encontrados`);
    res.json(resultados);
  } catch (err) {
    console.error("❌ Error obteniendo servicios:", err);
    return res.status(500).json({
      error: "Error obteniendo servicios",
      detalles: err.message
    });
  }
});

// Crear nuevo SERVICIO (sin StockMinimo)
app.post('/api/servicios', async (req, res) => {
  try {
    const {
      Nombre,
      Descripcion,
      PrecioCompra,
      PrecioVenta,
      Stock,
      UnidadMedida,
      CategoriaID,
      Estado
    } = req.body;

    console.log("📦 Recibiendo solicitud para crear servicio:", req.body);

    if (!Nombre || !PrecioVenta) {
      return res.status(400).json({
        error: "Campos obligatorios",
        message: "El nombre y precio de venta son requeridos"
      });
    }

    // Generar código automático
    const codigoGenerado = await generarSiguienteCodigoServicio();
    console.log("📦 Código generado:", codigoGenerado);

    const [resultado] = await promisePool.query(
      `INSERT INTO articulo 
       (Codigo, Nombre, Descripcion, PrecioCompra, PrecioVenta, Stock, UnidadMedida, CategoriaID, Estado) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        codigoGenerado,
        Nombre,
        Descripcion || null,
        PrecioCompra || 0.00,
        PrecioVenta,
        Stock || 0,
        UnidadMedida || 'Unidad',
        CategoriaID || null,
        Estado || 'Activo'
      ]
    );

    const [nuevoServicio] = await promisePool.query(
      `SELECT a.*, c.Nombre as CategoriaNombre 
       FROM articulo a
       LEFT JOIN categoria c ON a.CategoriaID = c.CategoriaID
       WHERE a.ArticuloID = ?`,
      [resultado.insertId]
    );

    console.log(`✅ Servicio creado: ID ${resultado.insertId} - Código: ${codigoGenerado}`);
    res.status(201).json(nuevoServicio[0]);
  } catch (err) {
    console.error("❌ Error creando servicio:", err);

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        error: "Error de duplicado",
        message: "Ocurrió un error al generar el código. Intente nuevamente."
      });
    }

    return res.status(500).json({
      error: "Error creando servicio",
      detalles: err.message
    });
  }
});

// Actualizar SERVICIO (sin StockMinimo)
app.put('/api/servicios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      Nombre,
      Descripcion,
      PrecioCompra,
      PrecioVenta,
      Stock,
      UnidadMedida,
      CategoriaID,
      Estado
    } = req.body;

    console.log("📦 Actualizando servicio ID:", id, req.body);

    if (!Nombre || !PrecioVenta) {
      return res.status(400).json({
        error: "Campos obligatorios",
        message: "El nombre y precio de venta son requeridos"
      });
    }

    const [resultado] = await promisePool.query(
      `UPDATE articulo 
       SET Nombre = ?, Descripcion = ?, PrecioCompra = ?, 
           PrecioVenta = ?, Stock = ?, UnidadMedida = ?, 
           CategoriaID = ?, Estado = ?
       WHERE ArticuloID = ? AND Codigo LIKE 'SERV%'`,
      [
        Nombre,
        Descripcion || null,
        PrecioCompra || 0.00,
        PrecioVenta,
        Stock || 0,
        UnidadMedida || 'Unidad',
        CategoriaID || null,
        Estado || 'Activo',
        id
      ]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    const [servicioActualizado] = await promisePool.query(
      `SELECT a.*, c.Nombre as CategoriaNombre 
       FROM articulo a
       LEFT JOIN categoria c ON a.CategoriaID = c.CategoriaID
       WHERE a.ArticuloID = ?`,
      [id]
    );

    console.log(`✅ Servicio actualizado: ID ${id}`);
    res.json(servicioActualizado[0]);
  } catch (err) {
    console.error("❌ Error actualizando servicio:", err);
    return res.status(500).json({
      error: "Error actualizando servicio",
      detalles: err.message
    });
  }
});

// Eliminar SERVICIO - VERSIÓN CORREGIDA
app.delete('/api/servicios/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🗑️ Solicitando eliminar servicio ID:", id);

    // Validar que el ID sea un número
    if (isNaN(id)) {
      return res.status(400).json({
        error: "ID inválido",
        message: "El ID del servicio debe ser un número"
      });
    }

    // Primero verificar si el servicio existe y es un servicio (código SERV)
    const [resultados] = await promisePool.query(
      'SELECT * FROM articulo WHERE ArticuloID = ? AND Codigo LIKE "SERV%"',
      [id]
    );

    if (resultados.length === 0) {
      console.log("⚠️ Servicio no encontrado con ID:", id);
      return res.status(404).json({
        error: "Servicio no encontrado",
        message: "No existe un servicio con ese ID"
      });
    }

    console.log("📦 Servicio encontrado:", resultados[0]);

    // Eliminar el servicio
    const [deleteResult] = await promisePool.query(
      'DELETE FROM articulo WHERE ArticuloID = ?',
      [id]
    );

    console.log("✅ Resultado de eliminación:", deleteResult);

    if (deleteResult.affectedRows === 0) {
      return res.status(500).json({
        error: "Error al eliminar",
        message: "No se pudo eliminar el servicio"
      });
    }

    console.log(`✅ Servicio eliminado exitosamente: ID ${id} - ${resultados[0].Nombre}`);
    res.json({
      message: "Servicio eliminado correctamente",
      servicio: resultados[0]
    });
  } catch (err) {
    console.error("❌ Error eliminando servicio:", err);

    // Error de llave foránea (si el servicio está siendo usado en otras tablas)
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        error: "Servicio en uso",
        message: "No se puede eliminar el servicio porque está siendo utilizado en otras partes del sistema"
      });
    }

    return res.status(500).json({
      error: "Error eliminando servicio",
      message: err.message,
      detalles: err.sqlMessage || err.message
    });
  }
});
















///////////////////Empleados/////////////////////////////////////////////////////////////
// 🔹 Combobox tipo_empleado

// Middleware de autenticación (solo para rutas administrativas)
const verificarToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    try {
        const decoded = jwt.verify(token, 'tu_secreto_jwt');
        req.usuario = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

// Rutas protegidas (requieren token)
app.get('/api/empleados', async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            'SELECT EmpId, Nombres, Apellidos, DocID, telefono FROM empleado'
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/cargos-empleado', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM cargo_empleado');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tipo-empleado', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM tipo_empleado');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});




/* app.get('/api/tipo-empleado', (req, res) => {
  pool.query('SELECT * FROM tipo_empleado', (err, results) => {
    if (err) {
      console.error('❌ Error en la consulta:', err);
      return res.status(500).json({ error: 'Error en la consulta' });
    }
    res.json(results);
  });
});

// 🔹 Combobox tipo_empleado
app.get('/api/cargo-empleado', (req, res) => {
  pool.query('SELECT * FROM cargo_empleado', (err, results) => {
    if (err) {
      console.error('❌ Error en la consulta:', err);
      return res.status(500).json({ error: 'Error en la consulta' });
    }
    res.json(results);
  });
}); */




//  Añadir empleados
app.post('/api/empleado', (req, res) => {
  const { nombres, apellidos, docId, tipo_EmpId, cargo_EmpId, fechaNacimiento, fechaIngreso, direccion, sueldo } = req.body;

  const query = `
    INSERT INTO empleado (Nombres, Apellidos, DocID, Tipo_EmpId, Cargo_EmpId, FechaNacimiento, fecha_ingreso, Direccion, Sueldo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  pool.query(
    query,
    [nombres, apellidos, docId, tipo_EmpId, cargo_EmpId, fechaNacimiento, fechaIngreso, direccion, sueldo],
    (err, result) => {
      if (err) {
        console.error('❌ Error al registrar empleado:', err);
        return res.status(500).json({ error: 'Error al registrar empleado' });
      }
      res.json({ mensaje: '✅ Empleado registrado correctamente', id: result.insertId });
    }
  );
});

//  Listar empleados
app.get('/api/listaempleado', (req, res) => {
  const query = `
         SELECT e.EmpId, e.Nombres, e.Apellidos, e.DocID, 
           e.Direccion, e.FechaNacimiento, e.Sueldo, e.fecha_ingreso, e.fecha_renuncia, t.Tipo_EmpId,
           t.Descripcion AS TipoEmpleado, t.Comision, c.Cargo_EmpId, c.Descripcion
    FROM empleado e
    JOIN tipo_empleado t ON e.Tipo_EmpId = t.Tipo_EmpId
    JOIN cargo_empleado c ON e.Cargo_EmpId = c.Cargo_EmpId
    ORDER BY e.fecha_ingreso;
  `;

  pool.query(query, (err, results) => {
    if (err) {
      console.error("❌ Error al obtener empleados:", err);
      return res.status(500).json({ error: "Error al obtener empleados" });
    }
    res.json(results);
  });
});


app.get('/api/listaempleadoactivo', (req, res) => {
  const query = `
        SELECT e.EmpId, e.Nombres, e.Apellidos, e.DocID, 
           e.Direccion, e.FechaNacimiento, e.Sueldo, e.fecha_ingreso, e.fecha_renuncia, t.Tipo_EmpId,
           t.Descripcion AS TipoEmpleado, t.Comision, c.Cargo_EmpId, c.Descripcion
        FROM empleado e
        JOIN tipo_empleado t ON e.Tipo_EmpId = t.Tipo_EmpId
        JOIN cargo_empleado c ON e.Cargo_EmpId = c.Cargo_EmpId
        WHERE FECHA_RENUNCIA IS NULL
        ORDER BY e.fecha_ingreso;
  `;

  pool.query(query, (err, results) => {
    if (err) {
      console.error("❌ Error al obtener empleados:", err);
      return res.status(500).json({ error: "Error al obtener empleados" });
    }
    res.json(results);
  });
});

// Modificar empleado
app.put('/api/empleado/:id', (req, res) => {
  const empleadoId = req.params.id;
  const {
    nombres,
    apellidos,
    docId,
    tipo_EmpId,
    cargo_EmpId,
    fechaNacimiento,
    fechaIngreso,
    fechaRenuncia,
    direccion,
    sueldo
  } = req.body;

  // Validar campos requeridos
  if (!nombres || !apellidos || !docId || !tipo_EmpId || !fechaNacimiento || !fechaIngreso || !sueldo || !cargo_EmpId) {
    return res.status(400).json({
      error: "Todos los campos excepto fecha_renuncia son requeridos"
    });
  }

  const query = `
    UPDATE empleado 
    SET 
      Nombres = ?, 
      Apellidos = ?, 
      DocID = ?, 
      Tipo_EmpId = ?, 
      cargo_EmpId = ?,
      FechaNacimiento = ?, 
      fecha_ingreso = ?, 
      fecha_renuncia = ?, 
      Direccion = ?, 
      Sueldo = ?
    WHERE EmpId = ?
  `;

  const values = [
    nombres,
    apellidos,
    docId,
    tipo_EmpId,
    cargo_EmpId,
    fechaNacimiento,
    fechaIngreso,
    fechaRenuncia || null, // Puede ser NULL si no hay fecha de renuncia
    direccion,
    parseFloat(sueldo),
    empleadoId
  ];

  pool.query(query, values, (err, results) => {
    if (err) {
      console.error("❌ Error al actualizar empleado:", err);
      return res.status(500).json({
        error: "Error al actualizar empleado",
        detalle: err.message
      });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({
        error: "Empleado no encontrado"
      });
    }

    console.log("✅ Empleado actualizado correctamente, ID:", empleadoId);
    res.json({
      mensaje: "Empleado actualizado correctamente",
      empleadoId: empleadoId,
      affectedRows: results.affectedRows
    });
  });
});



// 🗑️ Eliminar empleado
app.delete('/api/empleado/:id', (req, res) => {
  const { id } = req.params;

  pool.query('DELETE FROM empleado WHERE EmpId = ?', [id], (err, result) => {
    if (err) {
      console.error('❌ Error al eliminar empleado:', err);
      return res.status(500).json({ error: 'Error al eliminar empleado' });
    }
    res.json({ mensaje: '✅ Empleado eliminado correctamente' });
  });
});

///////////////////Citas/////////////////////////////////////////////////////////////
// ✅ Obtener todas las citas/form Citas
app.get('/api/citas', (req, res) => {
  const query = `
	SELECT c.*, CONCAT(p.nombre, ' ', p.apellido) AS ClienteNombre, 
  CONCAT(e.nombres, ' ', e.apellidos) AS EmpleadoNombre, v.Total Monto
    FROM citas c
    LEFT JOIN cliente p ON c.ClienteID = p.ClienteID
    LEFT JOIN empleado e ON c.EmpId = e.EmpId
    LEFT JOIN venta v ON v.CitaID = c.CitaID
    ORDER BY c.FechaInicio;
  `;
  pool.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al obtener citas' });

    // Adaptar al formato que usa FullCalendar
    const eventos = results.map(r => ({
      id: r.CitaID,
      title: r.Titulo || r.ClienteNombre || 'Cita sin título',
      descripcion: r.Descripcion,
      start: r.FechaInicio,
      end: r.FechaFinj,
      backgroundColor:
        r.Estado === 'Cancelada' ? '#f87171' : // rojo
          r.Estado === 'Completada' ? '#34d399' : // verde
            '#60a5fa', // azul
      extendedProps: {
        //descripcion: r.Descripcion,
        clienteNombre: r.ClienteNombre,
        empleadoNombre: r.EmpleadoNombre,
        estado: r.Estado,
        clienteID: r.ClienteID,
        EmpId: r.EmpId,
        Monto: r.Monto
      }
    }));

    res.json(eventos);
  });
});

// ✅ Crear cita
app.post('/api/citas', (req, res) => {
  const { ClienteID, EmpId, Titulo, Descripcion, FechaInicio, FechaFin, Estado } = req.body;
  const query = `
    INSERT INTO citas (ClienteID, EmpId, Titulo, Descripcion, FechaInicio, FechaFin, Estado)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  pool.query(
    query,
    [ClienteID || null, EmpId || null, Titulo, Descripcion, FechaInicio, FechaFin, Estado], (err, result) => {
      if (err) {
        console.error('❌ Error al registrar Cita:', err);
        return res.status(500).json({ error: 'Error al crear cita' });
      }
      res.json({ message: 'Cita creada correctamente' });
    });
});

// ✅ Actualizar cita
app.put('/api/citas/:id', (req, res) => {
  const { id } = req.params;
  const { ClienteID, EmpId, Titulo, Descripcion, FechaInicio, FechaFin, Estado } = req.body;
  const query = `
    UPDATE citas
    SET ClienteID=?, EmpId=?, Titulo=?, Descripcion=?, FechaInicio=?, FechaFin=?, Estado=?
    WHERE CitaID=?
  `;
  pool.query(query, [ClienteID || null, EmpId || null, Titulo, Descripcion, FechaInicio, FechaFin, Estado, id], err => {
    if (err) return res.status(500).json({ error: 'Error al actualizar cita' });
    res.json({ message: 'Cita actualizada correctamente' });
  });
});

// ✅ Eliminar cita
app.delete('/api/citas/:id', (req, res) => {
  const { id } = req.params;
  pool.query('DELETE FROM citas WHERE CitaID=?', [id], err => {
    if (err) return res.status(500).json({ error: 'Error al eliminar cita' });
    res.json({ message: 'Cita eliminada correctamente' });
  });
});

//Articulo//////////////////////////////////////

// Obtener todos los artículos
router.get('/', (req, res) => {
  const sql = 'SELECT * FROM articulo ORDER BY fecha_creacion DESC';

  db.query(sql, (err, resultados) => {
    if (err) {
      console.error("❌ Error obteniendo artículos:", err);
      return res.status(500).json({
        error: "Error obteniendo artículos",
        detalles: err.message
      });
    }

    console.log(`✅ ${resultados.length} artículos encontrados`);
    res.json(resultados);
  });
});

// Obtener un artículo por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;

  const sql = 'SELECT * FROM articulo WHERE ArticuloID = ?';

  db.query(sql, [id], (err, resultados) => {
    if (err) {
      console.error("❌ Error obteniendo artículo:", err);
      return res.status(500).json({
        error: "Error obteniendo artículo",
        detalles: err.message
      });
    }

    if (resultados.length === 0) {
      return res.status(404).json({ error: "Artículo no encontrado" });
    }

    console.log(`✅ Artículo encontrado: ID ${id}`);
    res.json(resultados[0]);
  });
});

// Crear nuevo artículo
router.post('/', (req, res) => {
  const {
    Codigo,
    Nombre,
    Descripcion,
    PrecioCompra,
    PrecioVenta,
    Stock,
    UnidadMedida,
    CategoriaID,
    Estado
  } = req.body;

  // Validar campos obligatorios
  if (!Nombre || !PrecioVenta) {
    return res.status(400).json({
      error: "Campos obligatorios",
      message: "El nombre y precio de venta son requeridos"
    });
  }

  const sql = `
    INSERT INTO articulo 
    (Codigo, Nombre, Descripcion, PrecioCompra, PrecioVenta, Stock, UnidadMedida, CategoriaID, Estado) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const valores = [
    Codigo || null,
    Nombre,
    Descripcion || null,
    PrecioCompra || 0.00,
    PrecioVenta,
    Stock || 0,
    UnidadMedida || 'UND',
    CategoriaID || null,
    Estado || 'Activo'
  ];

  db.query(sql, valores, (err, resultado) => {
    if (err) {
      console.error("❌ Error creando artículo:", err);

      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          error: "Código duplicado",
          message: "El código ingresado ya existe en el sistema"
        });
      }

      return res.status(500).json({
        error: "Error creando artículo",
        detalles: err.message
      });
    }

    // Obtener el artículo recién creado
    const selectSql = 'SELECT * FROM articulo WHERE ArticuloID = ?';
    db.query(selectSql, [resultado.insertId], (err2, nuevoArticulo) => {
      if (err2) {
        console.error("❌ Error obteniendo artículo creado:", err2);
        return res.status(201).json({
          message: "Artículo creado, pero error al obtener datos",
          id: resultado.insertId
        });
      }

      console.log(`✅ Artículo creado: ID ${resultado.insertId}`);
      res.status(201).json(nuevoArticulo[0]);
    });
  });
});

// Actualizar artículo
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const {
    Codigo,
    Nombre,
    Descripcion,
    PrecioCompra,
    PrecioVenta,
    Stock,
    UnidadMedida,
    CategoriaID,
    Estado
  } = req.body;

  // Validar campos obligatorios
  if (!Nombre || !PrecioVenta) {
    return res.status(400).json({
      error: "Campos obligatorios",
      message: "El nombre y precio de venta son requeridos"
    });
  }

  const sql = `
    UPDATE articulo 
    SET Codigo = ?, Nombre = ?, Descripcion = ?, PrecioCompra = ?, 
        PrecioVenta = ?, Stock = ?, UnidadMedida = ?, CategoriaID = ?, Estado = ?
    WHERE ArticuloID = ?
  `;

  const valores = [
    Codigo || null,
    Nombre,
    Descripcion || null,
    PrecioCompra || 0.00,
    PrecioVenta,
    Stock || 0,
    UnidadMedida || 'UND',
    CategoriaID || null,
    Estado || 'Activo',
    id
  ];

  db.query(sql, valores, (err, resultado) => {
    if (err) {
      console.error("❌ Error actualizando artículo:", err);

      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          error: "Código duplicado",
          message: "El código ingresado ya existe en el sistema"
        });
      }

      return res.status(500).json({
        error: "Error actualizando artículo",
        detalles: err.message
      });
    }

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: "Artículo no encontrado" });
    }

    // Obtener el artículo actualizado
    const selectSql = 'SELECT * FROM articulo WHERE ArticuloID = ?';
    db.query(selectSql, [id], (err2, articuloActualizado) => {
      if (err2) {
        console.error("❌ Error obteniendo artículo actualizado:", err2);
        return res.json({
          message: "Artículo actualizado, pero error al obtener datos",
          id: id
        });
      }

      console.log(`✅ Artículo actualizado: ID ${id}`);
      res.json(articuloActualizado[0]);
    });
  });
});

// Eliminar artículo
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // Primero verificar si el artículo existe
  const checkSql = 'SELECT * FROM articulo WHERE ArticuloID = ?';
  db.query(checkSql, [id], (err, resultados) => {
    if (err) {
      console.error("❌ Error verificando artículo:", err);
      return res.status(500).json({
        error: "Error al eliminar artículo",
        detalles: err.message
      });
    }

    if (resultados.length === 0) {
      return res.status(404).json({ error: "Artículo no encontrado" });
    }

    // Eliminar el artículo
    const deleteSql = 'DELETE FROM articulo WHERE ArticuloID = ?';
    db.query(deleteSql, [id], (err2, resultado) => {
      if (err2) {
        console.error("❌ Error eliminando artículo:", err2);
        return res.status(500).json({
          error: "Error eliminando artículo",
          detalles: err2.message
        });
      }

      console.log(`✅ Artículo eliminado: ID ${id} - ${resultados[0].Nombre}`);
      res.json({
        message: "Artículo eliminado correctamente",
        articulo: resultados[0]
      });
    });
  });
});
///////////////////////////////////////////////


// 🔹 Registrar una nueva venta (con pool y EmpID por detalle)
app.post("/api/ventas", (req, res) => {
  const { ClienteID, FechaVenta, Total, Detalles, Pagos, CitaID, Observaciones } = req.body;

  if (!ClienteID || !Detalles?.length || !Pagos?.length)
    return res.status(400).json({ error: "Faltan datos en la venta." });

  pool.getConnection((err, connection) => {
    if (err) return res.status(500).json({ error: "Error al obtener conexión del pool." });

    connection.beginTransaction((err) => {
      if (err) {
        connection.release();
        return res.status(500).json({ error: "Error al iniciar transacción." });
      }

      // 1️⃣ Insertar venta (sin EmpID)
      const sqlVenta = `
        INSERT INTO venta (ClienteID, FechaVenta, Total, CitaID, Observaciones, usuario_id, Estado)
        VALUES (?, CONVERT_TZ(STR_TO_DATE(?, '%Y-%m-%dT%H:%i:%s.%fZ'), '+00:00', '-05:00'), ?, ?, ?, ?, ?)
      `;
      connection.query(
        sqlVenta,
        [ClienteID, FechaVenta, Total, CitaID || null, Observaciones || null, 1, 'Pagada'],
        (err, resultVenta) => {
          if (err) {
            return connection.rollback(() => {
              connection.release();
              res.status(500).json({ ClienteID, FechaVenta, Total, Detalles, Pagos, CitaID, Observaciones });
            });
          }
          const ventaID = resultVenta.insertId;

          // 2️⃣ Insertar detalles (ahora con EmpID)
          const sqlDetalle = `
            INSERT INTO venta_detalle (VentaID, ArticuloID, Cantidad, PrecioUnitario, EmpID)
            VALUES ?
          `;
          const valoresDetalles = Detalles.map((d) => [
            ventaID,
            d.ArticuloID,
            d.Cantidad,
            d.PrecioUnitario,
            d.EmpID,
          ]);

          connection.query(sqlDetalle, [valoresDetalles], (err) => {
            if (err) {
              return connection.rollback(() => {
                connection.release();
                res.status(500).json({ error: "Error al registrar detalles de venta." });
              });
            }

            // 3️⃣ Insertar tipos de pago
            const sqlPagos = `
              INSERT INTO venta_tipo_pago (VentaID, tipo_pago_id, monto)
              VALUES ?
            `;
            const valoresPagos = Pagos.map((p) => [
              ventaID,
              p.TipoPagoID,
              p.Monto,
            ]);

            connection.query(sqlPagos, [valoresPagos], (err) => {
              if (err) {
                return connection.rollback(() => {
                  connection.release();
                  res.status(500).json({ error: "Error al registrar pagos." });
                });
              }

              // 🔹 NUEVO: Actualizar estado de la cita si existe CitaID
              if (CitaID) {
                const sqlActualizarCita = `
                  UPDATE citas 
                  SET Estado = 'Completada' 
                  WHERE CitaID = ?
                `;

                connection.query(sqlActualizarCita, [CitaID], (err) => {
                  if (err) {
                    return connection.rollback(() => {
                      connection.release();
                      res.status(500).json({ error: "Error al actualizar estado de la cita." });
                    });
                  }

                  // 4️⃣ Confirmar la transacción
                  connection.commit((err) => {
                    if (err) {
                      return connection.rollback(() => {
                        connection.release();
                        res.status(500).json({ error: "Error al confirmar la transacción." });
                      });
                    }

                    connection.release();
                    res.json({
                      message: "✅ Venta registrada correctamente y cita completada",
                      ventaID,
                    });
                  });
                });
              } else {
                // 🔹 Si no hay cita, confirmar transacción normalmente
                connection.commit((err) => {
                  if (err) {
                    return connection.rollback(() => {
                      connection.release();
                      res.status(500).json({ error: "Error al confirmar la transacción." });
                    });
                  }

                  connection.release();
                  res.json({
                    message: "✅ Venta registrada correctamente",
                    ventaID,
                  });
                });
              }
            });
          });
        }
      );
    });
  });
});



// GET /api/ventas/resumen-dia?fecha=YYYY-MM-DD
app.get("/api/ventas/resumen-dia", (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ error: "La fecha es requerida" });
  }

  const sql = `
    SELECT 
      tp.nombre as tipo_pago,
      COALESCE(SUM(vtp.monto), 0) as total
    FROM venta v
    LEFT JOIN venta_tipo_pago vtp ON v.VentaID = vtp.VentaID
    LEFT JOIN tipo_pago tp ON vtp.tipo_pago_id = tp.tipo_pago_id
    WHERE DATE(v.FechaVenta) = ?
    GROUP BY tp.tipo_pago_id, tp.nombre
  `;

  pool.query(sql, [fecha], (err, resultados) => {
    if (err) {
      console.error("❌ Error obteniendo resumen de ventas:", err);
      return res.status(500).json({ error: "Error obteniendo resumen de ventas" });
    }

    // Formatear respuesta
    const resumen = {
      efectivo: 0,
      yape: 0,
      plin: 0,
      tarjeta: 0,
      total: 0
    };

    resultados.forEach(row => {
      const tipo = (row.tipo_pago || '').toLowerCase();
      const total = parseFloat(row.total) || 0;

      if (tipo.includes('efectivo')) resumen.efectivo = total;
      else if (tipo.includes('yape')) resumen.yape = total;
      else if (tipo.includes('plin')) resumen.plin = total;
      else if (tipo.includes('tarjeta')) resumen.tarjeta = total;

      resumen.total += total;
    });

    res.json(resumen);
  });
});


// 2. GET /api/gastos - Obtener gastos por fecha
app.get("/api/gastos/resumen-dia", (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ error: "Fecha requerida" });
  }

  console.log("💰 Buscando gastos para:", fecha);

  const sql = `
    SELECT 
      t.descripcion, 
      t.monto, 
      t2.nombre as categoria, 
      t.fecha_gasto as fecha 
    FROM gastos t
    INNER JOIN categoria_gasto t2 ON t.categoria_id = t2.categoria_id
    WHERE DATE(t.fecha_gasto) = ?
    ORDER BY t.fecha_creacion DESC
  `;

  pool.query(sql, [fecha], (err, gastos) => {
    if (err) {
      console.error("❌ Error obteniendo gastos:", err);
      return res.status(500).json({
        error: "Error obteniendo gastos",
        detalles: err.message
      });
    }

    console.log(`✅ ${gastos.length} gastos encontrados para ${fecha}`);
    res.json(gastos);
  });
});


// En tu server.js - Endpoint corregido
app.post("/api/cierre-caja", (req, res) => {
  const datos = req.body;
  console.log("💾 Guardando cierre de caja:", datos);

  // Validaciones
  if (!datos.fecha || !datos.responsable) {
    return res.status(400).json({ error: "Fecha y responsable son requeridos" });
  }

  // Parsear valores según los nombres de tu tabla
  const dinero_inicial = parseFloat(datos.dinero_inicial) || 0;
  const dinero_final_caja = parseFloat(datos.dinero_final_caja) || 0;
  const ventas_efectivo = parseFloat(datos.ventas_efectivo) || 0;
  const ventas_yape = parseFloat(datos.ventas_yape) || 0;
  const ventas_plin = parseFloat(datos.ventas_plin) || 0;
  const ventas_tarjeta = parseFloat(datos.ventas_tarjeta) || 0;
  const ventas_total = parseFloat(datos.ventas_total) || 0;
  const total_gastos = parseFloat(datos.total_gastos) || 0;
  const efectivo_esperado = parseFloat(datos.efectivo_esperado) || 0;
  const diferencia = parseFloat(datos.diferencia) || 0;
  const dinero_retirar = parseFloat(datos.dinero_retirar) || 0;
  const estado = datos.estado || "CORRECTO";

  const sql = `
    INSERT INTO cierre_caja (
      fecha, hora, responsable,
      dinero_inicial, dinero_final_caja,
      ventas_efectivo, ventas_yape, ventas_plin, ventas_tarjeta, ventas_total,
      total_gastos,
      efectivo_esperado, diferencia, dinero_retirar,
      estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const valores = [
    datos.fecha,
    datos.hora || new Date().toLocaleTimeString('es-PE', { hour12: false }),
    datos.responsable,
    dinero_inicial,
    dinero_final_caja,
    ventas_efectivo,
    ventas_yape,
    ventas_plin,
    ventas_tarjeta,
    ventas_total,
    total_gastos,
    efectivo_esperado,
    diferencia,
    dinero_retirar,
    estado
  ];

  pool.query(sql, valores, (err, result) => {
    if (err) {
      console.error("❌ Error guardando cierre:", err);

      // Si es error de duplicado (por la UNIQUE KEY)
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          error: "Ya existe un cierre para esta fecha con este responsable. ¿Desea actualizarlo?"
        });
      }

      return res.status(500).json({
        error: "Error al guardar cierre de caja",
        detalles: err.message
      });
    }

    console.log("✅ Cierre guardado con ID:", result.insertId);
    res.json({
      success: true,
      message: "Cierre de caja registrado exitosamente",
      cierreId: result.insertId,
      estado: estado
    });
  });
});





app.get("/api/caja/dinero-inicial", (req, res) => {
  const { fecha } = req.query;

  console.log("💵 Buscando dinero inicial para:", fecha || "sin fecha");

  // Valor por defecto
  let montoInicial = 0;

  if (!fecha) {
    console.log("⚠️ Sin fecha, usando valor por defecto:", montoInicial);
    return res.json({ monto: montoInicial });
  }

  const sql = `
    SELECT dinero_final_caja as monto 
    FROM cierre_caja 
    WHERE fecha = DATE_SUB(?, INTERVAL 1 DAY)
      AND estado = 'CORRECTO'
    ORDER BY fecha_creacion DESC 
    LIMIT 1  
  `;

  pool.query(sql, [fecha], (err, resultados) => {
    if (err) {
      console.log("⚠️ Error al buscar cierre anterior, usando valor por defecto");
      return res.json({ monto: montoInicial });
    }

    if (resultados.length > 0 && resultados[0].monto !== null) {
      montoInicial = parseFloat(resultados[0].monto) || 500.00;
      console.log("✅ Dinero inicial encontrado:", montoInicial);
    } else {
      console.log("⚠️ No hay cierre anterior, usando valor por defecto:", montoInicial);
    }

    res.json({ monto: montoInicial });
  });
});


// En tu backend (ejemplo)
/* app.get('/api/cierre-caja/verificar', async (req, res) => {
  try {
    const { fecha } = req.query;

    // Buscar cierre para la fecha
    const cierre = await CierreCaja.findOne({
      fecha: fecha
    }).sort({ fecha_creacion: -1 }); // El más reciente

    if (cierre) {
      return res.json({
        existe: true,
        cierre: cierre
      });
    }

    return res.json({
      existe: false,
      cierre: null
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error verificando cierre' });
  }
});
 */

////////////////Cierre de Caja///////////////////////////7

// ✅ Verificar si existe cierre de caja para una fecha específica
// ✅ Verificar si existe cierre de caja para una fecha específica (CORREGIDO)



// ✅ Crear nuevo cierre de caja
// ✅ Crear nuevo cierre de caja (usando pool)
// ✅ Verificar si existe cierre de caja para una fecha específica
app.get("/api/cierre-caja/verificar", (req, res) => {
  const { fecha } = req.query;

  // Validar que se proporcionó fecha
  if (!fecha) {
    return res.status(400).json({
      success: false,
      error: "Se requiere el parámetro fecha"
    });
  }

  // Validar formato de fecha (YYYY-MM-DD)
  const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!fechaRegex.test(fecha)) {
    return res.status(400).json({
      success: false,
      error: "Formato de fecha inválido. Use YYYY-MM-DD"
    });
  }

  console.log(`🔍 Verificando cierre para fecha: ${fecha}`);

  const sql = `
    SELECT 
      cierre_id as id,
      fecha,
      TIME_FORMAT(hora, '%H:%i') as hora,
      responsable,
      CAST(dinero_inicial AS DECIMAL(10,2)) as dinero_inicial,
      CAST(dinero_final_caja AS DECIMAL(10,2)) as dinero_final_caja,
      CAST(ventas_efectivo AS DECIMAL(10,2)) as ventas_efectivo,
      CAST(ventas_yape AS DECIMAL(10,2)) as ventas_yape,
      CAST(ventas_plin AS DECIMAL(10,2)) as ventas_plin,
      CAST(ventas_tarjeta AS DECIMAL(10,2)) as ventas_tarjeta,
      CAST(ventas_total AS DECIMAL(10,2)) as ventas_total,
      CAST(total_gastos AS DECIMAL(10,2)) as total_gastos,
      CAST(efectivo_esperado AS DECIMAL(10,2)) as efectivo_esperado,
      CAST(diferencia AS DECIMAL(10,2)) as diferencia,
      CAST(dinero_retirar AS DECIMAL(10,2)) as dinero_retirar,
      estado,
      fecha_creacion
    FROM cierre_caja 
    WHERE fecha = ? 
    ORDER BY fecha_creacion DESC 
    LIMIT 1
  `;

  pool.query(sql, [fecha], (err, results) => {
    if (err) {
      console.error("❌ Error verificando cierre de caja:", err);
      return res.status(500).json({
        success: false,
        error: "Error al verificar cierre de caja",
        detalles: err.message
      });
    }

    if (results.length > 0) {
      const cierre = results[0];

      console.log(`✅ Cierre encontrado para fecha ${fecha}:`, {
        id: cierre.id,
        responsable: cierre.responsable,
        estado: cierre.estado
      });

      return res.json({
        success: true,
        existe: true,
        cierre: {
          id: cierre.id,
          fecha: cierre.fecha,
          hora: cierre.hora,
          responsable: cierre.responsable,
          dinero_inicial: parseFloat(cierre.dinero_inicial),
          dinero_final_caja: parseFloat(cierre.dinero_final_caja),
          ventas_efectivo: parseFloat(cierre.ventas_efectivo),
          ventas_yape: parseFloat(cierre.ventas_yape),
          ventas_plin: parseFloat(cierre.ventas_plin),
          ventas_tarjeta: parseFloat(cierre.ventas_tarjeta),
          ventas_total: parseFloat(cierre.ventas_total),
          total_gastos: parseFloat(cierre.total_gastos),
          efectivo_esperado: parseFloat(cierre.efectivo_esperado),
          diferencia: parseFloat(cierre.diferencia),
          dinero_retirar: parseFloat(cierre.dinero_retirar),
          estado: cierre.estado,
          fecha_creacion: cierre.fecha_creacion
        }
      });
    }

    console.log(`📭 No se encontró cierre para fecha ${fecha}`);

    return res.json({
      success: true,
      existe: false,
      cierre: null
    });
  });
});

// ✅ Actualizar cierre de caja existente
app.put("/api/cierre-caja/:id", (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  // Construir la consulta dinámicamente
  const fields = [];
  const values = [];
  const allowedFields = [
    'fecha', 'hora', 'responsable', 'dinero_inicial', 'dinero_final_caja',
    'ventas_efectivo', 'ventas_yape', 'ventas_plin', 'ventas_tarjeta',
    'ventas_total', 'total_gastos', 'efectivo_esperado', 'diferencia',
    'dinero_retirar', 'estado'
  ];

  allowedFields.forEach(field => {
    if (updateData[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(updateData[field]);
    }
  });

  if (fields.length === 0) {
    return res.status(400).json({
      success: false,
      error: "No hay campos para actualizar"
    });
  }

  // Agregar ID al final para el WHERE
  values.push(id);

  const sql = `
    UPDATE cierre_caja 
    SET ${fields.join(', ')}, fecha_modificacion = CURRENT_TIMESTAMP
    WHERE cierre_id = ?
  `;

  console.log(`🔄 Actualizando cierre ID: ${id}`);

  pool.query(sql, values, (err, result) => {
    if (err) {
      console.error("❌ Error actualizando cierre:", err);

      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          success: false,
          error: "Ya existe un cierre para esta fecha con este responsable"
        });
      }

      return res.status(500).json({
        success: false,
        error: "Error al actualizar cierre de caja"
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "Cierre no encontrado"
      });
    }

    console.log(`✅ Cierre ${id} actualizado correctamente`);

    res.json({
      success: true,
      message: "Cierre de caja actualizado exitosamente"
    });
  });
});

// ✅ Obtener un cierre específico por ID
app.get("/api/cierre-caja/:id", (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT 
      cierre_id as id,
      fecha,
      TIME_FORMAT(hora, '%H:%i') as hora,
      responsable,
      CAST(dinero_inicial AS DECIMAL(10,2)) as dinero_inicial,
      CAST(dinero_final_caja AS DECIMAL(10,2)) as dinero_final_caja,
      CAST(ventas_efectivo AS DECIMAL(10,2)) as ventas_efectivo,
      CAST(ventas_yape AS DECIMAL(10,2)) as ventas_yape,
      CAST(ventas_plin AS DECIMAL(10,2)) as ventas_plin,
      CAST(ventas_tarjeta AS DECIMAL(10,2)) as ventas_tarjeta,
      CAST(ventas_total AS DECIMAL(10,2)) as ventas_total,
      CAST(total_gastos AS DECIMAL(10,2)) as total_gastos,
      CAST(efectivo_esperado AS DECIMAL(10,2)) as efectivo_esperado,
      CAST(diferencia AS DECIMAL(10,2)) as diferencia,
      CAST(dinero_retirar AS DECIMAL(10,2)) as dinero_retirar,
      estado,
      fecha_creacion
    FROM cierre_caja 
    WHERE cierre_id = ?
  `;

  pool.query(sql, [id], (err, results) => {
    if (err) {
      console.error("❌ Error obteniendo cierre:", err);
      return res.status(500).json({
        success: false,
        error: "Error al obtener cierre de caja"
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Cierre no encontrado"
      });
    }

    const cierre = results[0];
    res.json({
      success: true,
      data: {
        id: cierre.id,
        fecha: cierre.fecha,
        hora: cierre.hora,
        responsable: cierre.responsable,
        dinero_inicial: parseFloat(cierre.dinero_inicial),
        dinero_final_caja: parseFloat(cierre.dinero_final_caja),
        ventas_efectivo: parseFloat(cierre.ventas_efectivo),
        ventas_yape: parseFloat(cierre.ventas_yape),
        ventas_plin: parseFloat(cierre.ventas_plin),
        ventas_tarjeta: parseFloat(cierre.ventas_tarjeta),
        ventas_total: parseFloat(cierre.ventas_total),
        total_gastos: parseFloat(cierre.total_gastos),
        efectivo_esperado: parseFloat(cierre.efectivo_esperado),
        diferencia: parseFloat(cierre.diferencia),
        dinero_retirar: parseFloat(cierre.dinero_retirar),
        estado: cierre.estado,
        fecha_creacion: cierre.fecha_creacion
      }
    });
  });
});

// ✅ Listar cierres con filtros opcionales
app.get("/api/cierre-caja", (req, res) => {
  const {
    fecha,
    responsable,
    estado,
    fecha_inicio,
    fecha_fin,
    limit = 50,
    page = 1
  } = req.query;

  let sql = "SELECT * FROM cierre_caja WHERE 1=1";
  const params = [];
  const conditions = [];

  if (fecha) {
    conditions.push("fecha = ?");
    params.push(fecha);
  }

  if (responsable) {
    conditions.push("responsable LIKE ?");
    params.push(`%${responsable}%`);
  }

  if (estado) {
    conditions.push("estado = ?");
    params.push(estado);
  }

  if (fecha_inicio && fecha_fin) {
    conditions.push("fecha BETWEEN ? AND ?");
    params.push(fecha_inicio, fecha_fin);
  }

  if (conditions.length > 0) {
    sql += " AND " + conditions.join(" AND ");
  }

  // Paginación
  const offset = (page - 1) * limit;
  sql += " ORDER BY fecha DESC, fecha_creacion DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), parseInt(offset));

  pool.query(sql, params, (err, results) => {
    if (err) {
      console.error("❌ Error listando cierres:", err);
      return res.status(500).json({
        success: false,
        error: "Error al listar cierres de caja"
      });
    }

    res.json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  });
});

// ✅ Eliminar cierre (con verificación de permisos)
app.delete("/api/cierre-caja/:id", (req, res) => {
  const { id } = req.params;
  const { usuario_rol } = req.query; // O podrías obtenerlo de un token/sesión

  // Solo admin puede eliminar
  if (usuario_rol !== 'admin' && usuario_rol !== 'administrador') {
    return res.status(403).json({
      success: false,
      error: "No tienes permisos para eliminar cierres"
    });
  }

  const sql = "DELETE FROM cierre_caja WHERE cierre_id = ?";

  pool.query(sql, [id], (err, result) => {
    if (err) {
      console.error("❌ Error eliminando cierre:", err);
      return res.status(500).json({
        success: false,
        error: "Error al eliminar cierre de caja"
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "Cierre no encontrado"
      });
    }

    console.log(`🗑️ Cierre ${id} eliminado correctamente`);

    res.json({
      success: true,
      message: "Cierre de caja eliminado exitosamente"
    });
  });
});

////////////////Cierre de Caja/////////////////////////////////////////////////////



///////////////////Clientes/////////////////////////////////////////////////////////////
app.get('/api/clientes', (req, res) => {
  pool.query('SELECT * FROM cliente', (err, results) => {
    if (err) {
      console.error('❌ Error obteniendo clientes:', err);
      return res.status(500).json({ error: 'Error al obtener clientes' });
    }
    res.json(results);
  });
});

app.post('/api/clientes', (req, res) => {
  const { Nombre, Apellido, Telefono, Email } = req.body;
  if (!Nombre || !Apellido) {
    return res.status(400).json({ error: 'Nombre y Apellido son obligatorios' });
  }

  const query = 'INSERT INTO cliente (Nombre, Apellido, Telefono, Email) VALUES (?, ?, ?, ?)';
  pool.query(query, [Nombre, Apellido, Telefono, Email], (err, result) => {
    if (err) {
      console.error('❌ Error insertando cliente:', err);
      return res.status(500).json({ error: 'Error al registrar el cliente' });
    }

    res.json({
      message: '✅ Cliente registrado con éxito',
      ClienteID: result.insertId,
    });
  });
});

// ✅ Actualizar cliente
app.put('/api/clientes/:id', (req, res) => {
  const { id } = req.params;
  const { Nombre, Apellido, Telefono, Email } = req.body;

  // Validaciones básicas
  if (!Nombre || !Apellido) {
    return res.status(400).json({ error: 'Nombre y Apellido son requeridos' });
  }

  const query = `
    UPDATE cliente
    SET Nombre = ?, Apellido = ?, Telefono = ?, Email = ?
    WHERE ClienteID = ?
  `;

  pool.query(query, [Nombre.trim(), Apellido.trim(), Telefono || null, Email || null, id], (err, result) => {
    if (err) {
      console.error('Error al actualizar cliente:', err);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'El email ya está registrado' });
      }
      return res.status(500).json({ error: 'Error al actualizar cliente' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Obtener el cliente actualizado
    const selectQuery = 'SELECT ClienteID, Nombre, Apellido, Telefono, Email FROM cliente WHERE ClienteID = ?';
    pool.query(selectQuery, [id], (err2, results) => {
      if (err2) {
        return res.status(500).json({ error: 'Cliente actualizado pero error al obtener datos' });
      }
      res.json(results[0]);
    });
  });
});

// ✅ Eliminar cliente
app.delete('/api/clientes/:id', (req, res) => {
  const { id } = req.params;

  // Verificar si el cliente tiene citas asociadas (opcional, pero recomendado)
  const checkQuery = 'SELECT COUNT(*) as count FROM citas WHERE ClienteID = ?';
  pool.query(checkQuery, [id], (err, results) => {
    if (err) {
      console.error('Error al verificar citas del cliente:', err);
      return res.status(500).json({ error: 'Error al verificar dependencias' });
    }

    if (results[0].count > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar el cliente porque tiene citas asociadas',
        citasCount: results[0].count
      });
    }

    // Si no tiene citas, proceder con la eliminación
    const deleteQuery = 'DELETE FROM cliente WHERE ClienteID = ?';
    pool.query(deleteQuery, [id], (err2, result) => {
      if (err2) {
        console.error('Error al eliminar cliente:', err2);
        return res.status(500).json({ error: 'Error al eliminar cliente' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      res.json({ message: 'Cliente eliminado correctamente' });
    });
  });
});






///////////////////Gastos/////////////////////////////////////////////////////////////
app.post("/api/gastos", (req, res) => {
  const { descripcion, monto, categoria_id, periodo_id, fecha_gasto, observaciones, EmpId, pagos } = req.body;

  if (!descripcion || !monto || !categoria_id || !periodo_id) {
    return res.status(400).json({ success: false, message: "Faltan campos obligatorios" });
  }

  if (!Array.isArray(pagos) || pagos.length === 0) {
    return res.status(400).json({ success: false, message: "Debe incluir al menos un tipo de pago" });
  }

  const sumaPagos = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
  if (Math.abs(sumaPagos - Number(monto)) > 0.01) {
    return res.status(400).json({
      success: false,
      message: "La suma de los montos por tipo de pago no coincide con el monto total",
    });
  }

  // 🔹 Iniciar conexión y transacción -- gastos
  pool.getConnection((err, conn) => {
    if (err) {
      console.error("❌ Error obteniendo conexión:", err);
      return res.status(500).json({ success: false, message: "Error de conexión a la base de datos" });
    }

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        console.error("❌ Error iniciando transacción:", err);
        return res.status(500).json({ success: false, message: "Error al iniciar transacción" });
      }

      // 🧾 Insertar gasto principal
      const insertGasto = `
        INSERT INTO gastos (descripcion, monto, categoria_id, periodo_id, fecha_gasto, observaciones, EmpId, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      conn.query(
        insertGasto,
        [descripcion, monto, categoria_id, periodo_id, fecha_gasto, observaciones || null, EmpId || null, 1],
        (err, result) => {
          if (err) {
            return conn.rollback(() => {
              conn.release();
              console.error("❌ Error insertando gasto:", err);
              res.status(500).json({ success: false, message: "Error al registrar gasto" });
            });
          }

          const gastoId = result.insertId;

          // 💳 Insertar tipos de pago
          const insertPago = `
            INSERT INTO gasto_tipo_pago (gasto_id, tipo_pago_id, monto)
            VALUES (?, ?, ?)
          `;

          const promises = pagos.map((pago) => {
            return new Promise((resolve, reject) => {
              const tipoId = parseInt(pago.tipo_pago_id, 10);
              const montoPago = parseFloat(pago.monto);

              if (!tipoId || isNaN(tipoId) || isNaN(montoPago)) return resolve(); // ignora vacíos

              conn.query(insertPago, [gastoId, tipoId, montoPago], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          });

          // 🔁 Ejecutar todos los inserts de pagos
          Promise.all(promises)
            .then(() => {
              conn.commit((err) => {
                if (err) {
                  return conn.rollback(() => {
                    conn.release();
                    console.error("❌ Error confirmando transacción:", err);
                    res.status(500).json({ success: false, message: "Error al confirmar transacción" });
                  });
                }

                conn.release();
                res.json({
                  success: true,
                  message: "✅ Gasto registrado correctamente",
                  gasto_id: gastoId,
                });
              });
            })
            .catch((err) => {
              conn.rollback(() => {
                conn.release();
                console.error("❌ Error insertando tipos de pago:", err);
                res.status(500).json({ success: false, message: "Error al registrar tipos de pago" });
              });
            });
        }
      );
    });
  });
});



app.put("/api/gastos/:id", (req, res) => {
  const gastoId = req.params.id;
  const { descripcion, monto, categoria_id, periodo_id, fecha_gasto, observaciones, EmpId, pagos } = req.body;

  // Validaciones
  if (!gastoId) {
    return res.status(400).json({ success: false, message: "ID de gasto requerido" });
  }

  if (!descripcion || !monto || !categoria_id || !periodo_id) {
    return res.status(400).json({ success: false, message: "Faltan campos obligatorios" });
  }

  if (!Array.isArray(pagos) || pagos.length === 0) {
    return res.status(400).json({ success: false, message: "Debe incluir al menos un tipo de pago" });
  }

  const sumaPagos = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
  if (Math.abs(sumaPagos - Number(monto)) > 0.01) {
    return res.status(400).json({
      success: false,
      message: "La suma de los montos por tipo de pago no coincide con el monto total",
    });
  }

  // 🔹 Iniciar conexión y transacción
  pool.getConnection((err, conn) => {
    if (err) {
      console.error("❌ Error obteniendo conexión:", err);
      return res.status(500).json({ success: false, message: "Error de conexión a la base de datos" });
    }

    // Primero verificar si el gasto existe
    const checkQuery = "SELECT gasto_id FROM gastos WHERE gasto_id = ?";
    conn.query(checkQuery, [gastoId], (checkErr, checkResult) => {
      if (checkErr) {
        conn.release();
        console.error("❌ Error verificando gasto:", checkErr);
        return res.status(500).json({ success: false, message: "Error al verificar gasto" });
      }

      if (checkResult.length === 0) {
        conn.release();
        return res.status(404).json({ success: false, message: "Gasto no encontrado" });
      }

      // Iniciar transacción
      conn.beginTransaction((err) => {
        if (err) {
          conn.release();
          console.error("❌ Error iniciando transacción:", err);
          return res.status(500).json({ success: false, message: "Error al iniciar transacción" });
        }

        // 🧾 Actualizar gasto principal
        const updateGasto = `
          UPDATE gastos 
          SET descripcion = ?, 
              monto = ?, 
              categoria_id = ?, 
              periodo_id = ?, 
              fecha_gasto = ?, 
              observaciones = ?, 
              EmpId = ?, 
              usuario_id = ?,
              fecha_modificacion = CURRENT_TIMESTAMP
          WHERE gasto_id = ?
        `;

        conn.query(
          updateGasto,
          [
            descripcion,
            monto,
            categoria_id,
            periodo_id,
            fecha_gasto,
            observaciones || null,
            EmpId || null,
            1, // usuario_id (actualizar si tienes sistema de usuarios)
            gastoId
          ],
          (err, result) => {
            if (err) {
              return conn.rollback(() => {
                conn.release();
                console.error("❌ Error actualizando gasto:", err);
                res.status(500).json({ success: false, message: "Error al actualizar gasto" });
              });
            }

            // 💳 Eliminar tipos de pago existentes
            const deletePagos = "DELETE FROM gasto_tipo_pago WHERE gasto_id = ?";
            conn.query(deletePagos, [gastoId], (err) => {
              if (err) {
                return conn.rollback(() => {
                  conn.release();
                  console.error("❌ Error eliminando tipos de pago anteriores:", err);
                  res.status(500).json({ success: false, message: "Error al eliminar tipos de pago anteriores" });
                });
              }

              // 🔁 Insertar nuevos tipos de pago
              const insertPago = `
                INSERT INTO gasto_tipo_pago (gasto_id, tipo_pago_id, monto)
                VALUES (?, ?, ?)
              `;

              const promises = pagos.map((pago) => {
                return new Promise((resolve, reject) => {
                  const tipoId = parseInt(pago.tipo_pago_id, 10);
                  const montoPago = parseFloat(pago.monto);

                  if (!tipoId || isNaN(tipoId) || isNaN(montoPago)) {
                    console.warn("⚠️ Tipo de pago inválido omitido:", pago);
                    return resolve();
                  }

                  conn.query(insertPago, [gastoId, tipoId, montoPago], (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                });
              });

              // 🔁 Ejecutar todos los inserts de pagos
              Promise.all(promises)
                .then(() => {
                  conn.commit((err) => {
                    if (err) {
                      return conn.rollback(() => {
                        conn.release();
                        console.error("❌ Error confirmando transacción:", err);
                        res.status(500).json({ success: false, message: "Error al confirmar transacción" });
                      });
                    }

                    conn.release();
                    res.json({
                      success: true,
                      message: "✅ Gasto actualizado correctamente",
                      gasto_id: gastoId,
                    });
                  });
                })
                .catch((err) => {
                  conn.rollback(() => {
                    conn.release();
                    console.error("❌ Error insertando tipos de pago:", err);
                    res.status(500).json({ success: false, message: "Error al registrar tipos de pago" });
                  });
                });
            });
          }
        );
      });
    });
  });
});



// ✅ Obtener pagos del gasto
/* app.get('/api/gasto_pagos', (req, res) => {
  pool.query(`
    select t.gasto_id, t.tipo_pago_id, t.monto from gasto_tipo_pago t
    inner join gastos t2 on t.gasto_id = t2.gasto_id;
    `, (err, results) => {
    if (err) {
      console.error('❌ Error al obtener categorías:', err);
      return res.status(500).json({ error: 'Error al obtener categorías' });
    }
    res.json(results);
  });
}); */
app.get('/api/gastos/:id/pagos', (req, res) => {
  const gastoId = req.params.id;

  pool.query(`
    SELECT t.*, tp.nombre as tipo_pago_nombre 
    FROM gasto_tipo_pago t
    LEFT JOIN tipo_pago tp ON t.tipo_pago_id = tp.tipo_pago_id
    WHERE t.gasto_id = ?
  `, [gastoId], (err, results) => {
    if (err) {
      console.error('❌ Error al obtener pagos del gasto:', err);
      return res.status(500).json({ error: 'Error al obtener pagos' });
    }
    res.json(results);
  });
});


// ✅ Obtener categorias
app.get('/api/categorias', (req, res) => {
  pool.query('SELECT categoria_id, nombre FROM categoria_gasto ORDER BY nombre', (err, results) => {
    if (err) {
      console.error('❌ Error al obtener categorías:', err);
      return res.status(500).json({ error: 'Error al obtener categorías' });
    }
    res.json(results);
  });
});

// ✅ Obtener periodos
app.get('/api/periodos', (req, res) => {
  pool.query('SELECT periodo_id, nombre FROM periodo ORDER BY fecha_inicio DESC', (err, results) => {
    if (err) {
      console.error('❌ Error al obtener periodos:', err);
      return res.status(500).json({ error: 'Error al obtener periodos' });
    }
    res.json(results);
  });
});

// ✅ Obtener tipos de pago
app.get('/api/tipo_pago', (req, res) => {
  pool.query('SELECT tipo_pago_id, nombre FROM tipo_pago ORDER BY nombre', (err, results) => {
    if (err) {
      console.error('❌ Error al obtener tipos de pago:', err);
      return res.status(500).json({ error: 'Error al obtener tipos de pago' });
    }
    res.json(results);
  });
});






// ✅ Obtener tipos de venta
app.get('/api/tipos_venta', (req, res) => {
  pool.query('SELECT Tipo_VentaID, Descripcion FROM tipo_venta', (err, results) => {
    if (err) {
      console.error('❌ Error obteniendo tipos de venta:', err);
      return res.status(500).json({ error: 'Error al obtener tipos de venta' });
    }
    res.json(results);
  });
});


// 🔹 Obtener todos los clientes
app.get("/api/clientes", (req, res) => {
  pool.query("SELECT * FROM cliente", (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

// 🔹 Obtener todos los artículos
app.get("/api/articulos", (req, res) => {
  pool.query("SELECT * FROM articulo", (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

// 🔹 Obtener tipos de pago
app.get("/api/tipos_pago", (req, res) => {
  pool.query("SELECT * FROM tipo_pago", (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});







app.get("/", (req, res) => {
  res.send("Servidor activo ✅");
});

// ======================================
// 🔹 LISTAR VENTAS (con búsqueda y paginación)
// ======================================
/* app.get("/api/venta", (req, res) => {
  const { page = 1, limit = 8, search = "" } = req.query;
  const offset = (page - 1) * limit;

  const sqlVentas = `
    SELECT v.VentaID, v.FechaVenta, v.Total, v.Estado, v.Observaciones,
           CONCAT(c.Nombre, ' ', c.Apellido) AS ClienteNombre
    FROM Venta v
    JOIN cliente c ON v.ClienteID = c.ClienteID
    WHERE CONCAT(c.Nombre, ' ', c.Apellido) LIKE ? 
       OR v.FechaVenta LIKE ?
    ORDER BY v.VentaID DESC
    LIMIT ? OFFSET ?
  `;

  const sqlTotal = `
    SELECT COUNT(*) AS total
    FROM Venta v
    JOIN cliente c ON v.ClienteID = c.ClienteID
    WHERE CONCAT(c.Nombre, ' ', c.Apellido) LIKE ? 
       OR v.FechaVenta LIKE ?
  `;

  // 🔸 Primero, obtener las ventas
  pool.query(sqlVentas, [`%${search}%`, `%${search}%`, parseInt(limit), parseInt(offset)], (err, ventas) => {
    if (err) {
      console.error("❌ Error al obtener ventas:", err);
      return res.status(500).json({ error: "Error al obtener ventas" });
    }

    // 🔸 Luego, obtener el total de registros
    pool.query(sqlTotal, [`%${search}%`, `%${search}%`], (err2, totalResult) => {
      if (err2) {
        console.error("❌ Error al contar ventas:", err2);
        return res.status(500).json({ error: "Error al contar ventas" });
      }

      const total = totalResult[0].total;
      res.json({
        ventas,
        total,
        totalPaginas: Math.ceil(total / limit),
      });
    });
  });
}); */

// Endpoint para lista de ventas (debería usar los mismos filtros)
/* app.get('/api/venta', async (req, res) => {
  try {
    const { search, fechaInicio, fechaFin, page = 1, limit = 8 } = req.query;
    
    // MISMOS FILTROS que en estadísticas
    let whereConditions = ["1=1"];
    const params = [];

    if (search && search.trim() !== '') {
      whereConditions.push('(c.Nombre LIKE ? OR v.VentaID LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (fechaInicio && fechaInicio.trim() !== '') {
      whereConditions.push('DATE(v.FechaVenta) >= ?');
      params.push(fechaInicio);
    }

    if (fechaFin && fechaFin.trim() !== '') {
      whereConditions.push('DATE(v.FechaVenta) <= ?');
      params.push(fechaFin);
    }

    const whereClause = whereConditions.join(' AND ');
    
    // Query para el total (paginación)
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM Venta v 
      LEFT JOIN cliente c ON v.ClienteID = c.ClienteID 
      WHERE ${whereClause}
    `;
    
    // Query para los datos
    const dataQuery = `
      SELECT 
        v.VentaID,
        v.ClienteID,
        CONCAT(c.Nombre, ' ', c.Apellido) AS ClienteNombre,
        v.FechaVenta,
        v.Total,
        v.Estado,
        v.Observaciones
      FROM Venta v
      LEFT JOIN cliente c ON v.ClienteID = c.ClienteID
      WHERE ${whereClause}
      ORDER BY v.FechaVenta DESC
      LIMIT ? OFFSET ?
    `;

    const offset = (page - 1) * limit;
    const dataParams = [...params, parseInt(limit), offset];

    console.log('📋 Consulta ventas:', dataQuery);
    console.log('📋 Parámetros ventas:', dataParams);

    // Ejecutar ambas queries
    const [countResult] = await db.execute(countQuery, params);
    const [ventas] = await db.execute(dataQuery, dataParams);

    const totalVentas = countResult[0].total;
    const totalPaginas = Math.ceil(totalVentas / limit);

    res.json({
      ventas,
      totalPaginas,
      totalVentas
    });

  } catch (error) {
    console.error('❌ Error al cargar ventas:', error);
    res.status(500).json({ error: 'Error al cargar ventas: ' + error.message });
  }
}); */

/* app.get('/api/venta', async (req, res) => {
  try {
    const { search, fechaInicio, fechaFin, page = 1, limit = 8 } = req.query;

    console.log('🎯 FILTROS RECIBIDOS:', { search, fechaInicio, fechaFin, page, limit });

    let baseQuery = `
      FROM venta v 
      LEFT JOIN cliente c ON v.ClienteID = c.ClienteID 
    `;

    let whereConditions = [];
    const params = [];

    // Filtro de búsqueda
    if (search && search.trim() !== '') {
      whereConditions.push('(c.Nombre LIKE ? OR v.VentaID LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    // Filtro de fecha inicio
    if (fechaInicio && fechaInicio.trim() !== '') {
      whereConditions.push('DATE(v.FechaVenta) >= ?');
      params.push(fechaInicio);
    }

    // Filtro de fecha fin
    if (fechaFin && fechaFin.trim() !== '') {
      whereConditions.push('DATE(v.FechaVenta) <= ?');
      params.push(fechaFin);
    }

    // Construir WHERE clause
    let whereClause = '';
    if (whereConditions.length > 0) {
      whereClause = 'WHERE ' + whereConditions.join(' AND ');
    }

    // Query para contar total
    const countQuery = `SELECT COUNT(*) as total ${baseQuery} ${whereClause}`;
    console.log('🔢 COUNT QUERY:', countQuery);
    console.log('🔢 COUNT PARAMS:', params);

    // Query para datos
    const dataQuery = `
      SELECT 
        v.VentaID,
        v.ClienteID,
        CONCAT(c.Nombre, ' ', c.Apellido) AS ClienteNombre,
        v.FechaVenta,
        v.Total,
        v.Estado,
        v.Observaciones
      ${baseQuery}
      ${whereClause}
      ORDER BY v.FechaVenta DESC
      LIMIT ? OFFSET ?
    `;

    const offset = (page - 1) * limit;
    const dataParams = [...params, parseInt(limit), offset];

    console.log('📋 DATA QUERY:', dataQuery);
    console.log('📋 DATA PARAMS:', dataParams);

    // Ejecutar queries
    const [countResult] = await db.execute(countQuery, params);
    const [ventas] = await db.execute(dataQuery, dataParams);

    console.log('✅ RESULTADOS:', {
      totalRegistros: countResult[0].total,
      ventasEncontradas: ventas.length,
      filtrosAplicados: whereConditions.length
    });

    const totalVentas = countResult[0].total;
    const totalPaginas = Math.ceil(totalVentas / limit);

    res.json({
      ventas,
      totalPaginas,
      totalVentas
    });

  } catch (error) {
    console.error('❌ Error en /api/venta:', error);
    res.status(500).json({
      error: 'Error al cargar ventas',
      detalles: error.message
    });
  }
}); */

app.get("/api/venta", (req, res) => {

  const { search, fechaInicio, fechaFin } = req.query;

  let where = "WHERE 1=1";
  let params = [];

  if (search) {
    where += " AND CONCAT(c.Nombre,' ',c.Apellido) LIKE ?";
    params.push(`%${search}%`);
  }

  if (fechaInicio) {
    where += " AND DATE(v.FechaVenta) >= ?";
    params.push(fechaInicio);
  }

  if (fechaFin) {
    where += " AND DATE(v.FechaVenta) <= ?";
    params.push(fechaFin);
  }

  const sql = `
    SELECT 
      v.VentaID,
      v.FechaVenta,
      v.Total,
      v.Estado,
      CONCAT(c.Nombre,' ',c.Apellido) as ClienteNombre,
      v.Observaciones detalle
    FROM venta v
    LEFT JOIN cliente c ON c.ClienteID = v.ClienteID
    ${where}
    ORDER BY v.VentaID DESC
  `;

  pool.query(sql, params, (err, results) => {
    if (err) {
      console.error("Error ventas:", err);
      return res.status(500).json({ error: "Error al cargar ventas" });
    }

    res.json({
      ventas: results
    });

  });

});



app.get('/api/estadisticas-ventas', (req, res) => {
  try {
    const diaParam = req.query.dia || new Date().toISOString().split('T')[0];
    const inicioSemanaParam = req.query.inicioSemana || diaParam;
    const finSemanaParam = req.query.finSemana || diaParam;

    console.log('📅 Fechas para consulta:', {
      dia: diaParam,
      inicioSemana: inicioSemanaParam,
      finSemana: finSemanaParam
    });

    // Objeto para almacenar resultados
    const resultados = {
      ventasDia: [],
      ventasSemana: [],
      citasDia: 0,
      citasSemana: 0,
      totalGeneral: 0,
      errores: []
    };

    // Contador para llevar el control de consultas
    let consultasCompletadas = 0;
    const totalConsultas = 5;

    // Función para verificar si ya completamos todas las consultas
    const verificarCompletado = () => {
      consultasCompletadas++;
      console.log(`🔄 Consulta ${consultasCompletadas}/${totalConsultas} completada`);

      if (consultasCompletadas === totalConsultas) {
        // Todas las consultas completadas, enviar respuesta
        enviarRespuesta();
      }
    };

    // Función para enviar la respuesta final
    const enviarRespuesta = () => {
      // Función para calcular totales por método de pago
      const calcularTotales = (ventas) => {
        let total = 0;
        let efectivo = 0;
        let yape = 0;
        let plin = 0;
        let tarjeta = 0;

        ventas.forEach(venta => {
          // IMPORTANTE: Ajusta estos nombres según tus columnas reales
          const monto = parseFloat(venta.Total || venta.total || 0);
          total += monto;

          const metodoPago = (venta.tipo_pago || '').toString().toLowerCase();
          console.log('payaso', venta);
          if (metodoPago.includes('efectivo')) {
            efectivo += monto;
          } else if (metodoPago.includes('yape')) {
            yape += monto;
          } else if (metodoPago.includes('plin')) {
            plin += monto;
          } else if (metodoPago.includes('tarjeta') || metodoPago.includes('card')) {
            tarjeta += monto;
          } else {
            // Por defecto contar como efectivo
            efectivo += monto;
          }
        });

        return {
          total: parseFloat(total.toFixed(2)),
          efectivo: parseFloat(efectivo.toFixed(2)),
          yape: parseFloat(yape.toFixed(2)),
          plin: parseFloat(plin.toFixed(2)),
          tarjeta: parseFloat(tarjeta.toFixed(2))
        };
      };

      const totalesDia = calcularTotales(resultados.ventasDia);
      const totalesSemana = calcularTotales(resultados.ventasSemana);

      const respuesta = {
        hoy: {
          ...totalesDia,
          citasCompletadas: resultados.citasDia,
          transacciones: resultados.ventasDia.length
        },
        semana: {
          ...totalesSemana,
          citasCompletadas: resultados.citasSemana,
          transacciones: resultados.ventasSemana.length
        },
        totalGeneral: parseFloat(resultados.totalGeneral.toFixed(2)),
        errores: resultados.errores.length > 0 ? resultados.errores : undefined
      };

      console.log('📈 Estadísticas calculadas:', respuesta);

      // Si hay errores pero al menos tenemos algunos datos, enviar respuesta con datos
      if (resultados.errores.length > 0) {
        console.log('⚠️ Se produjeron errores:', resultados.errores);
      }

      res.json(respuesta);
    };

    // 1. CONSULTA: VENTAS DEL DÍA SELECCIONADO
    pool.query(
      ` SELECT distinct t.VentaID, t.ClienteID, t.FechaVenta, t2.monto total, t.CitaID, t2.tipo_pago_id , t3.nombre tipo_pago FROM venta t
        left join venta_tipo_pago t2 on t2.VentaID = t.VentaID 
        left join tipo_pago t3 on t2.tipo_pago_id = t3.tipo_pago_id
        WHERE DATE(FechaVenta) =  ?`,
      [diaParam],
      (error, results) => {
        if (error) {
          console.error('❌ Error al buscar ventas del día:', error);
          resultados.errores.push('Error ventas día');
        } else {
          resultados.ventasDia = results;
          console.log('✅ Ventas del día encontradas:', results.length);
        }
        verificarCompletado();
      }
    );


    // 2. CONSULTA: VENTAS DE LA SEMANA ACTUAL
    pool.query(
      `SELECT t.VentaID, t.ClienteID, t.FechaVenta, t2.monto total, t.CitaID, t2.tipo_pago_id , t3.nombre tipo_pago FROM venta t
        inner join venta_tipo_pago t2 on t2.VentaID = t.VentaID 
        inner join tipo_pago t3 on t2.tipo_pago_id = t3.tipo_pago_id
        WHERE DATE(FechaVenta) BETWEEN ? AND ?`,
      [inicioSemanaParam, finSemanaParam],
      (error, results) => {
        if (error) {
          console.error('❌ Error al buscar ventas de la semana:', error);
          resultados.errores.push('Error ventas semana');
        } else {
          resultados.ventasSemana = results;
          console.log('✅ Ventas de la semana encontradas:', results.length);
        }
        verificarCompletado();
      }
    );

    // 3. CONSULTA: CITAS COMPLETADAS DÍA
    // Primero intentamos con la columna 'fecha'
    pool.query(
      `SELECT COUNT(*) as total FROM citas WHERE estado = 'Completada' AND DATE(FechaInicio) = ?`,
      [diaParam],
      (error, results) => {
        if (error) {
          console.error('❌ Error al buscar citas del día (fecha):', error.message);
          // Si falla, intentamos con 'fecha_cita'
          pool.query(
            `SELECT COUNT(*) as total FROM citas WHERE estado = 'Completada' AND DATE(FechaInicio) = ?`,
            [diaParam],
            (error2, results2) => {
              if (error2) {
                console.error('❌ Error al buscar citas del día (FechaInicio):', error2.message);
                resultados.errores.push('Error citas día');
              } else {
                resultados.citasDia = results2[0]?.total || 0;
                console.log('✅ Citas completadas día:', resultados.citasDia);
              }
              verificarCompletado();
            }
          );
        } else {
          resultados.citasDia = results[0]?.total || 0;
          console.log('✅ Citas completadas día:', resultados.citasDia);
          verificarCompletado();
        }
      }
    );

    // 4. CONSULTA: CITAS COMPLETADAS SEMANA
    pool.query(
      `SELECT COUNT(*) as total FROM citas WHERE estado = 'Completada' AND DATE(FechaInicio) BETWEEN ? AND ?`,
      [inicioSemanaParam, finSemanaParam],
      (error, results) => {
        if (error) {
          console.error('❌ Error al buscar citas de la semana:', error);
          resultados.errores.push('Error citas semana');
        } else {
          resultados.citasSemana = results[0]?.total || 0;
          console.log('✅ Citas completadas semana:', resultados.citasSemana);
        }
        verificarCompletado();
      }
    );

    // 5. CONSULTA: TOTAL GENERAL DE VENTAS
    pool.query(
      `SELECT SUM(Total) as total 
        FROM venta
        WHERE MONTH(FechaVenta) = MONTH(?) 
        AND YEAR(FechaVenta) = YEAR(?)`,
      [diaParam, diaParam],
      (error, results) => {
        if (error) {
          console.error('❌ Error al calcular total mensual:', error);
          resultados.errores.push('Error total mes');
        } else {
          resultados.totalGeneral = parseFloat(results[0]?.total) || 0;
          console.log('✅ Total ventas del mes:', resultados.totalGeneral);
        }
        verificarCompletado();
      }
    );

  } catch (error) {
    console.error('💥 Error general al obtener estadísticas:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      hoy: { total: 0, efectivo: 0, yape: 0, plin: 0, tarjeta: 0, citasCompletadas: 0, transacciones: 0 },
      semana: { total: 0, efectivo: 0, yape: 0, plin: 0, tarjeta: 0, citasCompletadas: 0, transacciones: 0 },
      totalGeneral: 0
    });
  }
});



app.get("/api/venta/:id", (req, res) => {
  const { id } = req.params;

  // Obtener datos principales
  const sqlVenta = `
    SELECT 
      v.VentaID,
      v.ClienteID,
      CONCAT(c.Nombre, ' ', c.Apellido) AS ClienteNombre,
      v.FechaVenta,
      v.Total,
      v.Estado,
      v.Observaciones
    FROM venta v
    LEFT JOIN cliente c ON v.ClienteID = c.ClienteID
    WHERE v.VentaID = ?
  `;

  pool.query(sqlVenta, [id], (err, ventaResult) => {
    if (err) {
      console.error("❌ Error al obtener venta:", err);
      return res.status(500).json({ error: "Error al obtener venta" });
    }

    if (ventaResult.length === 0) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    const venta = ventaResult[0];

    // Obtener detalles
    const sqlDetalles = `
      SELECT 
        d.DetalleID,
        a.ArticuloID,
        a.Nombre AS ArticuloNombre,
        d.Cantidad,
        d.PrecioUnitario,
        (d.Cantidad * d.PrecioUnitario) AS Importe
      FROM venta_detalle d
      JOIN articulo a ON d.ArticuloID = a.ArticuloID
      WHERE d.VentaID = ?
    `;

    pool.query(sqlDetalles, [id], (err, detallesResult) => {
      if (err) {
        console.error("❌ Error al obtener detalles:", err);
        return res.status(500).json({ error: "Error al obtener detalles" });
      }
      // Obtener pagos
      const sqlPagos = `
        SELECT 
          vp.venta_pago_id,
          tp.nombre AS TipoPago,
          vp.monto
        FROM venta_tipo_pago vp
        JOIN tipo_pago tp ON vp.tipo_pago_id = tp.tipo_pago_id
        WHERE vp.VentaID = ?
      `;

      pool.query(sqlPagos, [id], (err, pagosResult) => {
        if (err) {
          console.error("❌ Error al obtener pagos:", err);
          return res.status(500).json({ error: "Error al obtener pagos" });
        }

        res.json({
          venta,
          detalles: detallesResult,
          pagos: pagosResult,
        });
      });
    });
  });
});


app.delete("/api/venta/:id", (req, res) => {
  const { id } = req.params;

  pool.getConnection((err, conn) => {
    if (err) {
      console.error("❌ Error al obtener conexión:", err);
      return res.status(500).json({ error: "Error de conexión a la base de datos" });
    }

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        console.error("❌ Error al iniciar transacción:", err);
        return res.status(500).json({ error: "Error al iniciar transacción" });
      }

      // Borrar pagos
      conn.query("DELETE FROM venta_tipo_pago WHERE VentaID = ?", [id], (err) => {
        if (err) {
          return conn.rollback(() => {
            conn.release();
            console.error("❌ Error al eliminar pagos:", err);
            res.status(500).json({ error: "Error al eliminar pagos" });
          });
        }

        // Borrar detalles
        conn.query("DELETE FROM venta_detalle WHERE VentaID = ?", [id], (err) => {
          if (err) {
            return conn.rollback(() => {
              conn.release();
              console.error("❌ Error al eliminar detalles:", err);
              res.status(500).json({ error: "Error al eliminar detalles" });
            });
          }

          // Borrar venta principal
          conn.query("DELETE FROM venta WHERE VentaID = ?", [id], (err) => {
            if (err) {
              return conn.rollback(() => {
                conn.release();
                console.error("❌ Error al eliminar venta:", err);
                res.status(500).json({ error: "Error al eliminar venta" });
              });
            }

            conn.commit((err) => {
              if (err) {
                return conn.rollback(() => {
                  conn.release();
                  console.error("❌ Error al confirmar eliminación:", err);
                  res.status(500).json({ error: "Error al confirmar eliminación" });
                });
              }

              conn.release();
              res.json({ message: "🗑️ Venta eliminada correctamente" });
            });
          });
        });
      });
    });
  });
});








// ✅ Obtener resumen de comisiones por empleado (con rango de fechas)
app.get("/api/comisiones", (req, res) => {
  const { fechaInicio, fechaFin } = req.query;

  if (!fechaInicio || !fechaFin) {
    return res.status(400).json({ error: "Debe enviar fechaInicio y fechaFin" });
  }

  const sql = `
    SELECT 
      e.EmpId,
      CONCAT(e.Nombres, ' ', e.Apellidos) AS Empleado,
      ce.Descripcion AS Cargo,
      te.Descripcion AS TipoEmpleado,
      te.Comision AS Porcentaje,
      IFNULL(SUM(vd.Importe), 0) AS TotalVentas,
      ROUND((IFNULL(SUM(vd.Importe), 0) * (te.Comision / 100)), 2) AS TotalComision,
      v.FechaVenta
    FROM empleado e
    LEFT JOIN tipo_empleado te ON e.Tipo_EmpId = te.Tipo_EmpId
    LEFT JOIN cargo_empleado ce ON e.Cargo_EmpId = ce.Cargo_EmpId
    LEFT JOIN venta_detalle vd ON e.EmpId = vd.EmpId
    LEFT JOIN venta v ON vd.VentaID = v.VentaID
    WHERE v.FechaVenta BETWEEN ? AND ?
    GROUP BY e.EmpId, e.Nombres, e.Apellidos, ce.Descripcion, te.Descripcion, 
    te.Comision, v.FechaVenta
    ORDER BY TotalComision DESC;
  `;

  pool.query(sql, [fechaInicio, fechaFin], (err, results) => {
    if (err) {
      console.error("❌ Error obteniendo comisiones:", err);
      return res.status(500).json({ error: "Error al obtener comisiones" });
    }
    res.json(results);
  });
});


// ✅ Obtener detalle de ventas de un empleado en rango de fechas
app.get("/api/comisiones/:empId", (req, res) => {
  const { empId } = req.params;
  const { fechaInicio, fechaFin } = req.query;

  if (!fechaInicio || !fechaFin) {
    return res.status(400).json({ error: "Debe enviar fechaInicio y fechaFin" });
  }

  const sql = `
    SELECT 
      v.VentaID,
      DATE_FORMAT(v.FechaVenta, '%d/%m/%Y') AS FechaVenta,
      a.Nombre AS Articulo,
      vd.Cantidad,
      vd.PrecioUnitario,
      vd.Importe
    FROM venta_detalle vd
    INNER JOIN venta v ON vd.VentaID = v.VentaID
    INNER JOIN articulo a ON vd.ArticuloID = a.ArticuloID
    WHERE vd.EmpId = ? AND v.FechaVenta BETWEEN ? AND ?
    ORDER BY v.FechaVenta DESC;
  `;

  pool.query(sql, [empId, fechaInicio, fechaFin], (err, results) => {
    if (err) {
      console.error("❌ Error obteniendo detalle de comisiones:", err);
      return res.status(500).json({ error: "Error al obtener detalle" });
    }
    res.json(results);
  });
});








// ============================================================
// 📘 CRUD DE GASTOS
// ============================================================

// ✅ 1. Listar todos los gastos
app.get("/api/gastos", (req, res) => {
  const sql = `
	  SELECT g.*, c.Nombre categoria_nombre, p.nombre periodo_nombre, CONCAT(u.nombre, ' ', u.apellido) usuario, 
    CONCAT(e.nombres, ' ', e.apellidos) empleado
    FROM gastos g
    LEFT JOIN categoria_gasto c ON g.categoria_id = c.categoria_id
    LEFT JOIN usuario u ON g.usuario_id = u.usuario_id
    LEFT JOIN periodo p ON p.periodo_id = g.periodo_id
    LEFT JOIN empleado e ON g.EmpId = e.EmpId
    ORDER BY g.gasto_id DESC;
  `;
  pool.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Error al obtener gastos:", err);
      return res.status(500).json({ error: "Error al obtener gastos" });
    }
    res.json(results);
  });
});

// ✅ 2. Obtener un gasto específico por ID
/* app.get("/api/gastos/:id", (req, res) => {
  const { id } = req.params;
  const sql = `
    SELECT g.*, c.descripcion
    FROM gastos g
    LEFT JOIN categoria_gasto c ON g.categoria_id = c.categoria_id
    WHERE g.gastoid = ?
  `;
  pool.query(sql, [id], (err, results) => {
    if (err) {
      console.error("❌ Error al obtener gasto:", err);
      return res.status(500).json({ error: "Error al obtener gasto" });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "Gasto no encontrado" });
    }
    res.json(results[0]);
  });
}); */



// ✅ 4. Modificar gasto existente
app.put("/api/gastos/:id", (req, res) => {
  const { id } = req.params;
  const { Fecha, Descripcion, Monto, CategoriaID, TipoPago, Observacion } = req.body;

  const sql = `
    UPDATE gastos
    SET Fecha = ?, Descripcion = ?, Monto = ?, CategoriaID = ?, TipoPago = ?, Observacion = ?
    WHERE GastoID = ?
  `;

  pool.query(sql, [Fecha, Descripcion, Monto, CategoriaID, TipoPago, Observacion, id], (err) => {
    if (err) {
      console.error("❌ Error al modificar gasto:", err);
      return res.status(500).json({ error: "Error al modificar gasto" });
    }
    res.json({ message: "✅ Gasto actualizado correctamente" });
  });
});

// ✅ 5. Eliminar gasto
app.delete("/api/gastos/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM gastos WHERE gasto_id = ?";
  pool.query(sql, [id], (err) => {
    if (err) {
      console.error("❌ Error al eliminar gasto:", err);
      return res.status(500).json({ error: "Error al eliminar gasto" });
    }
    res.json({ message: "✅ Gasto eliminado correctamente" });
  });
});




// GET /api/venta/estadisticas
// GET /api/venta/estadisticas
// GET /api/venta/estadisticas - VERSIÓN SIMPLIFICADA
app.get('/api/estadisticas/ventas', async (req, res) => {
  try {
    const { search, fechaInicio, fechaFin } = req.query;

    console.log('📊 Parámetros recibidos:', { search, fechaInicio, fechaFin });

    let query = `
      SELECT 
        COALESCE(SUM(Total), 0) as totalVentas,
        COALESCE(COUNT(CASE WHEN Estado = 'Pagada' THEN 1 END), 0) as ventasPagadas,
        COALESCE(COUNT(CASE WHEN Estado = 'Anulada' THEN 1 END), 0) as ventasAnuladas,
        COALESCE(COUNT(*), 0) as totalRegistros
      FROM venta 
      WHERE 1=1
    `;

    const params = [];

    if (search && search.trim() !== '') {
      query += ' AND (ClienteID IN (SELECT ClienteID FROM cliente WHERE Nombre LIKE ?) OR VentaID LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (fechaInicio && fechaInicio.trim() !== '') {
      query += ' AND DATE(FechaVenta) >= ?';
      params.push(fechaInicio);
    }

    if (fechaFin && fechaFin.trim() !== '') {
      query += ' AND DATE(FechaVenta) <= ?';
      params.push(fechaFin);
    }

    console.log('📊 Consulta SQL:', query);
    console.log('📊 Parámetros:', params);

    // CAMBIO AQUÍ: usar pool.query en lugar de db.execute
    pool.query(query, params, (err, result) => {
      if (err) {
        console.error('❌ Error en consulta de estadísticas:', err);
        return res.status(500).json({
          error: 'Error al cargar estadísticas',
          detalles: err.message
        });
      }

      const estadisticas = {
        totalVentas: parseFloat(result[0]?.totalVentas) || 0,
        ventasPagadas: parseInt(result[0]?.ventasPagadas) || 0,
        ventasAnuladas: parseInt(result[0]?.ventasAnuladas) || 0,
        totalRegistros: parseInt(result[0]?.totalRegistros) || 0
      };

      console.log('📊 Estadísticas calculadas:', estadisticas);

      res.json(estadisticas);
    });

  } catch (error) {
    console.error('❌ Error en estadísticas:', error);
    res.status(500).json({
      error: 'Error al cargar estadísticas',
      detalles: error.message
    });
  }
});







// ============================================
// CONFIGURACIÓN DE UBICACIÓN DE LA EMPRESA
// ============================================
const EMPRESA_CONFIG = {
  nombre: 'Golden Nails',
  direccion: 'Avenida los Pajuiles, Trujillo 13009, Perú',
  coordenadas: {
    latitud: -8.128544932138585,  // Reemplaza con la latitud de tu local
    longitud: -79.04263471792805   // Reemplaza con la longitud de tu local
  },
  radioPermitido: 15, // metros
  wifiPermitidos: [
    'GOLDEN NAILS 2.4G',
    'GOLDEN NAILS 5G'
  ],
  ipRedLocal: ['192.168.', '10.0.', '172.16.']
};

// ============================================
// FUNCIÓN PARA CALCULAR DISTANCIA
// ============================================
const calcularDistancia = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// Endpoint de prueba público
app.get('/api/ping', (req, res) => {
  res.json({
    message: 'pong',
    timestamp: new Date().toISOString(),
    status: 'OK'
  });
});


// ============================================
// MIDDLEWARE DE VALIDACIÓN DE UBICACIÓN
// ============================================
const validarUbicacionMarcacion = async (req, res, next) => {
  try {
    const { latitud, longitud, wifiSSID } = req.body;
    const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    console.log("📍 Validando ubicación:", { ip: ipCliente, wifiSSID, latitud, longitud });

    // Opción 1: Validar por WiFi
    if (wifiSSID && EMPRESA_CONFIG.wifiPermitidos.includes(wifiSSID)) {
      console.log("✅ WiFi válido:", wifiSSID);
      req.ubicacionValida = {
        valida: true,
        metodo: 'wifi',
        wifiSSID,
        ip: ipCliente
      };
      return next();
    }

    // Opción 2: Validar por IP de red local
    if (ipCliente && EMPRESA_CONFIG.ipRedLocal.some(red => ipCliente.includes(red))) {
      console.log("✅ IP de red local válida:", ipCliente);
      req.ubicacionValida = {
        valida: true,
        metodo: 'ip_local',
        ip: ipCliente
      };
      return next();
    }

    // Opción 3: Validar por geolocalización
    if (latitud && longitud) {
      const distancia = calcularDistancia(
        parseFloat(latitud),
        parseFloat(longitud),
        EMPRESA_CONFIG.coordenadas.latitud,
        EMPRESA_CONFIG.coordenadas.longitud
      );

      console.log(`📍 Distancia al local: ${distancia.toFixed(2)} metros`);

      if (distancia <= EMPRESA_CONFIG.radioPermitido) {
        req.ubicacionValida = {
          valida: true,
          metodo: 'gps',
          distancia: distancia.toFixed(2)
        };
        return next();
      } else {
        return res.status(403).json({
          error: 'Ubicación no válida',
          message: `Debes estar en el local para marcar. Distancia actual: ${distancia.toFixed(2)} metros`
        });
      }
    }

    return res.status(403).json({
      error: 'Acceso denegado',
      message: 'No estás en la ubicación autorizada. Conéctate al WiFi de la empresa o acércate al local.'
    });

  } catch (error) {
    console.error("❌ Error validando ubicación:", error);
    return res.status(500).json({
      error: 'Error validando ubicación',
      message: error.message
    });
  }
};

// ============================================
// ENDPOINTS DE MARCADO
// ============================================

app.get('/api/empleados/documento/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    
    console.log(`🔍 Buscando empleado con documento: ${codigo}`);
    
    // Buscar empleado por DocID (cédula)
    const [empleado] = await promisePool.query(
      `SELECT EmpId, DocID, Nombres, Apellidos, Cargo_EmpId, Tipo_EmpId, telefono 
       FROM empleado 
       WHERE DocID = ? AND fecha_renuncia IS NULL`,
      [codigo]
    );
    
    if (empleado.length === 0) {
      return res.status(404).json({
        error: 'Empleado no encontrado',
        message: 'No se encontró un empleado activo con ese documento'
      });
    }
    
    console.log(`✅ Empleado encontrado: ${empleado[0].Nombres} ${empleado[0].Apellidos}`);
    
    res.json(empleado[0]);
    
  } catch (error) {
    console.error("❌ Error buscando empleado:", error);
    res.status(500).json({
      error: 'Error al buscar empleado',
      message: error.message
    });
  }
});

/* 

// Marcar entrada
app.post('/api/marcaciones/entrada', validarUbicacionMarcacion, async (req, res) => {
  try {
    const { codigo_empleado, dispositivo } = req.body;
    const fecha = new Date().toISOString().split('T')[0];
    const hora = new Date().toTimeString().split(' ')[0];
    const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    console.log("📝 Registrando entrada:", { codigo_empleado, fecha, hora });

    // Buscar empleado por DocID (cédula) o podrías agregar un campo Codigo
    const [empleado] = await promisePool.query(
      `SELECT EmpId, Nombres, Apellidos, DocID 
             FROM empleado 
             WHERE DocID = ? AND fecha_renuncia IS NULL`,
      [codigo_empleado]
    );

    if (empleado.length === 0) {
      return res.status(404).json({
        error: 'Empleado no encontrado',
        message: 'Código de empleado inválido o empleado inactivo'
      });
    }

    const empId = empleado[0].EmpId;

    // Verificar si ya tiene registro hoy
    const [asistencia] = await promisePool.query(
      'SELECT AsistenciaID FROM asistencia WHERE EmpId = ? AND Fecha = ?',
      [empId, fecha]
    );

    if (asistencia.length > 0) {
      return res.status(400).json({
        error: 'Registro duplicado',
        message: 'Ya marcaste entrada hoy'
      });
    }

    await promisePool.query('START TRANSACTION');

    // Crear nuevo registro
    await promisePool.query(
      `INSERT INTO asistencia 
             (EmpId, Fecha, HoraEntrada, Estado, MetodoValidacion, IPAddress) 
             VALUES (?, ?, ?, 'Incompleto', ?, ?)`,
      [empId, fecha, hora, req.ubicacionValida.metodo, ipCliente]
    );

    // Registrar en historial
    await promisePool.query(
      `INSERT INTO historial_marcaciones 
             (EmpId, FechaHora, Tipo, IPAddress, Dispositivo, MetodoValidacion, DatosValidacion) 
             VALUES (?, NOW(), 'Entrada', ?, ?, ?, ?)`,
      [
        empId,
        ipCliente,
        dispositivo || 'web',
        req.ubicacionValida.metodo,
        JSON.stringify(req.ubicacionValida)
      ]
    );

    await promisePool.query('COMMIT');

    console.log(`✅ Entrada registrada: ${empleado[0].Nombres} ${empleado[0].Apellidos} - ${hora}`);

    res.json({
      success: true,
      message: 'Entrada registrada correctamente',
      empleado: `${empleado[0].Nombres} ${empleado[0].Apellidos}`,
      hora,
      metodo: req.ubicacionValida.metodo
    });

  } catch (error) {
    await promisePool.query('ROLLBACK');
    console.error("❌ Error registrando entrada:", error);
    res.status(500).json({
      error: 'Error al registrar entrada',
      message: error.message
    });
  }
});

// Marcar salida a almuerzo
app.post('/api/marcaciones/salida-almuerzo', validarUbicacionMarcacion, async (req, res) => {
  try {
    const { codigo_empleado, dispositivo } = req.body;
    const fecha = new Date().toISOString().split('T')[0];
    const hora = new Date().toTimeString().split(' ')[0];
    const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const [empleado] = await promisePool.query(
      'SELECT EmpId, Nombres, Apellidos FROM empleado WHERE DocID = ?',
      [codigo_empleado]
    );

    if (empleado.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const empId = empleado[0].EmpId;

    // Verificar registro de hoy
    const [asistencia] = await promisePool.query(
      `SELECT * FROM asistencia 
             WHERE EmpId = ? AND Fecha = ?`,
      [empId, fecha]
    );

    if (asistencia.length === 0) {
      return res.status(400).json({
        error: 'Registro no encontrado',
        message: 'Debes marcar entrada primero'
      });
    }

    if (asistencia[0].HoraSalidaAlmuerzo) {
      return res.status(400).json({
        error: 'Registro duplicado',
        message: 'Ya marcaste salida a almuerzo hoy'
      });
    }

    await promisePool.query('START TRANSACTION');

    // Actualizar registro
    await promisePool.query(
      `UPDATE asistencia 
             SET HoraSalidaAlmuerzo = ?, MetodoValidacion = ? 
             WHERE EmpId = ? AND Fecha = ?`,
      [hora, req.ubicacionValida.metodo, empId, fecha]
    );

    // Registrar en historial
    await promisePool.query(
      `INSERT INTO historial_marcaciones 
             (EmpId, FechaHora, Tipo, IPAddress, Dispositivo, MetodoValidacion, DatosValidacion) 
             VALUES (?, NOW(), 'SalidaAlmuerzo', ?, ?, ?, ?)`,
      [
        empId,
        ipCliente,
        dispositivo || 'web',
        req.ubicacionValida.metodo,
        JSON.stringify(req.ubicacionValida)
      ]
    );

    await promisePool.query('COMMIT');

    res.json({
      success: true,
      message: 'Salida a almuerzo registrada',
      hora,
      metodo: req.ubicacionValida.metodo
    });

  } catch (error) {
    await promisePool.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al registrar salida a almuerzo' });
  }
});

// Marcar regreso de almuerzo
app.post('/api/marcaciones/regreso-almuerzo', validarUbicacionMarcacion, async (req, res) => {
  try {
    const { codigo_empleado, dispositivo } = req.body;
    const fecha = new Date().toISOString().split('T')[0];
    const hora = new Date().toTimeString().split(' ')[0];
    const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const [empleado] = await promisePool.query(
      'SELECT EmpId FROM empleado WHERE DocID = ?',
      [codigo_empleado]
    );

    if (empleado.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const empId = empleado[0].EmpId;

    const [asistencia] = await promisePool.query(
      `SELECT * FROM asistencia 
             WHERE EmpId = ? AND Fecha = ?`,
      [empId, fecha]
    );

    if (asistencia.length === 0) {
      return res.status(400).json({
        error: 'Registro no encontrado',
        message: 'Debes marcar entrada primero'
      });
    }

    if (!asistencia[0].HoraSalidaAlmuerzo) {
      return res.status(400).json({
        error: 'Secuencia incorrecta',
        message: 'Debes marcar salida a almuerzo primero'
      });
    }

    if (asistencia[0].HoraRegresoAlmuerzo) {
      return res.status(400).json({
        error: 'Registro duplicado',
        message: 'Ya marcaste regreso de almuerzo hoy'
      });
    }

    await promisePool.query('START TRANSACTION');

    await promisePool.query(
      `UPDATE asistencia 
             SET HoraRegresoAlmuerzo = ?, MetodoValidacion = ? 
             WHERE EmpId = ? AND Fecha = ?`,
      [hora, req.ubicacionValida.metodo, empId, fecha]
    );

    await promisePool.query(
      `INSERT INTO historial_marcaciones 
             (EmpId, FechaHora, Tipo, IPAddress, Dispositivo, MetodoValidacion, DatosValidacion) 
             VALUES (?, NOW(), 'RegresoAlmuerzo', ?, ?, ?, ?)`,
      [
        empId,
        ipCliente,
        dispositivo || 'web',
        req.ubicacionValida.metodo,
        JSON.stringify(req.ubicacionValida)
      ]
    );

    await promisePool.query('COMMIT');

    res.json({
      success: true,
      message: 'Regreso de almuerzo registrado',
      hora,
      metodo: req.ubicacionValida.metodo
    });

  } catch (error) {
    await promisePool.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al registrar regreso de almuerzo' });
  }
});

// Marcar salida
app.post('/api/marcaciones/salida', validarUbicacionMarcacion, async (req, res) => {
  try {
    const { codigo_empleado, dispositivo } = req.body;
    const fecha = new Date().toISOString().split('T')[0];
    const hora = new Date().toTimeString().split(' ')[0];
    const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const [empleado] = await promisePool.query(
      'SELECT EmpId, Nombres, Apellidos FROM empleado WHERE DocID = ?',
      [codigo_empleado]
    );

    if (empleado.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const empId = empleado[0].EmpId;

    // Obtener registro actual
    const [asistencia] = await promisePool.query(
      `SELECT * FROM asistencia 
             WHERE EmpId = ? AND Fecha = ?`,
      [empId, fecha]
    );

    if (asistencia.length === 0) {
      return res.status(400).json({
        error: 'Registro no encontrado',
        message: 'No hay registro de entrada hoy'
      });
    }

    const reg = asistencia[0];

    // Calcular horas trabajadas
    const entrada = new Date(`${fecha}T${reg.HoraEntrada}`);
    const salidaAlmuerzo = reg.HoraSalidaAlmuerzo ? new Date(`${fecha}T${reg.HoraSalidaAlmuerzo}`) : null;
    const regresoAlmuerzo = reg.HoraRegresoAlmuerzo ? new Date(`${fecha}T${reg.HoraRegresoAlmuerzo}`) : null;
    const salida = new Date(`${fecha}T${hora}`);

    let horasTrabajadas = 0;

    if (entrada && salida) {
      if (salidaAlmuerzo && regresoAlmuerzo) {
        // Restar tiempo de almuerzo
        const tiempoManana = (salidaAlmuerzo - entrada) / (1000 * 60 * 60);
        const tiempoTarde = (salida - regresoAlmuerzo) / (1000 * 60 * 60);
        horasTrabajadas = tiempoManana + tiempoTarde;
      } else {
        horasTrabajadas = (salida - entrada) / (1000 * 60 * 60);
      }
    }

    await promisePool.query('START TRANSACTION');

    // Actualizar registro
    await promisePool.query(
      `UPDATE asistencia 
             SET HoraSalida = ?, HorasTrabajadas = ?, Estado = 'Completo', MetodoValidacion = ?
             WHERE EmpId = ? AND Fecha = ?`,
      [hora, horasTrabajadas.toFixed(2), req.ubicacionValida.metodo, empId, fecha]
    );

    // Registrar en historial
    await promisePool.query(
      `INSERT INTO historial_marcaciones 
             (EmpId, FechaHora, Tipo, IPAddress, Dispositivo, MetodoValidacion, DatosValidacion) 
             VALUES (?, NOW(), 'Salida', ?, ?, ?, ?)`,
      [
        empId,
        ipCliente,
        dispositivo || 'web',
        req.ubicacionValida.metodo,
        JSON.stringify(req.ubicacionValida)
      ]
    );

    await promisePool.query('COMMIT');

    res.json({
      success: true,
      message: 'Salida registrada correctamente',
      empleado: `${empleado[0].Nombres} ${empleado[0].Apellidos}`,
      horasTrabajadas: horasTrabajadas.toFixed(2),
      hora,
      metodo: req.ubicacionValida.metodo
    });

  } catch (error) {
    await promisePool.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al registrar salida' });
  }
});

// Obtener registro del día para un empleado
app.get('/api/marcaciones/hoy/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    const fecha = new Date().toISOString().split('T')[0];

    const [resultados] = await promisePool.query(
      `SELECT a.*, e.Nombres, e.Apellidos, e.DocID
             FROM asistencia a
             INNER JOIN empleado e ON a.EmpId = e.EmpId
             WHERE e.DocID = ? AND a.Fecha = ?`,
      [codigo, fecha]
    );

    res.json(resultados[0] || null);

  } catch (error) {
    console.error("❌ Error obteniendo registro:", error);
    res.status(500).json({
      error: 'Error al obtener registro',
      message: error.message
    });
  }
}); */

// Importar moment-timezone al inicio del archivo
const moment = require('moment-timezone');

// Función para obtener la fecha y hora actual de Perú
const getHoraPeru = () => {
    return moment().tz('America/Lima');
};

// Función para obtener fecha en formato YYYY-MM-DD (Perú)
const getFechaPeru = () => {
    return getHoraPeru().format('YYYY-MM-DD');
};

// Función para obtener hora en formato HH:MM:SS (Perú)
const getHoraPeruFormato = () => {
    return getHoraPeru().format('HH:mm:ss');
};

// Marcar entrada
app.post('/api/marcaciones/entrada', validarUbicacionMarcacion, async (req, res) => {
  try {
    const { codigo_empleado, dispositivo } = req.body;
    
    // 🔴 CORRECCIÓN: Usar hora de Perú
    const fecha = getFechaPeru();
    const hora = getHoraPeruFormato();
    const fechaHoraCompleta = getHoraPeru().format('YYYY-MM-DD HH:mm:ss');
    
    const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    console.log("📝 Registrando entrada:", { codigo_empleado, fecha, hora, fechaHoraCompleta });

    // Buscar empleado por DocID (cédula)
    const [empleado] = await promisePool.query(
      `SELECT EmpId, Nombres, Apellidos, DocID 
             FROM empleado 
             WHERE DocID = ? AND fecha_renuncia IS NULL`,
      [codigo_empleado]
    );

    if (empleado.length === 0) {
      return res.status(404).json({
        error: 'Empleado no encontrado',
        message: 'Código de empleado inválido o empleado inactivo'
      });
    }

    const empId = empleado[0].EmpId;

    // Verificar si ya tiene registro hoy (usando fecha de Perú)
    const [asistencia] = await promisePool.query(
      'SELECT AsistenciaID FROM asistencia WHERE EmpId = ? AND Fecha = ?',
      [empId, fecha]
    );

    if (asistencia.length > 0) {
      return res.status(400).json({
        error: 'Registro duplicado',
        message: 'Ya marcaste entrada hoy'
      });
    }

    await promisePool.query('START TRANSACTION');

    // Crear nuevo registro con hora de Perú
    await promisePool.query(
      `INSERT INTO asistencia 
             (EmpId, Fecha, HoraEntrada, Estado, MetodoValidacion, IPAddress) 
             VALUES (?, ?, ?, 'Incompleto', ?, ?)`,
      [empId, fecha, hora, req.ubicacionValida.metodo, ipCliente]
    );

    // Registrar en historial con fecha/hora completa de Perú
    await promisePool.query(
      `INSERT INTO historial_marcaciones 
             (EmpId, FechaHora, Tipo, IPAddress, Dispositivo, MetodoValidacion, DatosValidacion) 
             VALUES (?, ?, 'Entrada', ?, ?, ?, ?)`,
      [
        empId,
        fechaHoraCompleta,
        ipCliente,
        dispositivo || 'web',
        req.ubicacionValida.metodo,
        JSON.stringify(req.ubicacionValida)
      ]
    );

    await promisePool.query('COMMIT');

    console.log(`✅ Entrada registrada: ${empleado[0].Nombres} ${empleado[0].Apellidos} - ${hora} (Perú)`);

    res.json({
      success: true,
      message: 'Entrada registrada correctamente',
      empleado: `${empleado[0].Nombres} ${empleado[0].Apellidos}`,
      hora,
      fecha,
      metodo: req.ubicacionValida.metodo
    });

  } catch (error) {
    await promisePool.query('ROLLBACK');
    console.error("❌ Error registrando entrada:", error);
    res.status(500).json({
      error: 'Error al registrar entrada',
      message: error.message
    });
  }
});

// Marcar salida a almuerzo
app.post('/api/marcaciones/salida-almuerzo', validarUbicacionMarcacion, async (req, res) => {
  try {
    const { codigo_empleado, dispositivo } = req.body;
    
    // 🔴 CORRECCIÓN: Usar hora de Perú
    const fecha = getFechaPeru();
    const hora = getHoraPeruFormato();
    const fechaHoraCompleta = getHoraPeru().format('YYYY-MM-DD HH:mm:ss');
    
    const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const [empleado] = await promisePool.query(
      'SELECT EmpId, Nombres, Apellidos FROM empleado WHERE DocID = ?',
      [codigo_empleado]
    );

    if (empleado.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const empId = empleado[0].EmpId;

    // Verificar registro de hoy
    const [asistencia] = await promisePool.query(
      `SELECT * FROM asistencia 
             WHERE EmpId = ? AND Fecha = ?`,
      [empId, fecha]
    );

    if (asistencia.length === 0) {
      return res.status(400).json({
        error: 'Registro no encontrado',
        message: 'Debes marcar entrada primero'
      });
    }

    if (asistencia[0].HoraSalidaAlmuerzo) {
      return res.status(400).json({
        error: 'Registro duplicado',
        message: 'Ya marcaste salida a almuerzo hoy'
      });
    }

    await promisePool.query('START TRANSACTION');

    // Actualizar registro con hora de Perú
    await promisePool.query(
      `UPDATE asistencia 
             SET HoraSalidaAlmuerzo = ?, MetodoValidacion = ? 
             WHERE EmpId = ? AND Fecha = ?`,
      [hora, req.ubicacionValida.metodo, empId, fecha]
    );

    // Registrar en historial con fecha/hora completa de Perú
    await promisePool.query(
      `INSERT INTO historial_marcaciones 
             (EmpId, FechaHora, Tipo, IPAddress, Dispositivo, MetodoValidacion, DatosValidacion) 
             VALUES (?, ?, 'SalidaAlmuerzo', ?, ?, ?, ?)`,
      [
        empId,
        fechaHoraCompleta,
        ipCliente,
        dispositivo || 'web',
        req.ubicacionValida.metodo,
        JSON.stringify(req.ubicacionValida)
      ]
    );

    await promisePool.query('COMMIT');

    res.json({
      success: true,
      message: 'Salida a almuerzo registrada',
      hora,
      fecha,
      metodo: req.ubicacionValida.metodo
    });

  } catch (error) {
    await promisePool.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al registrar salida a almuerzo' });
  }
});

// Marcar regreso de almuerzo
app.post('/api/marcaciones/regreso-almuerzo', validarUbicacionMarcacion, async (req, res) => {
  try {
    const { codigo_empleado, dispositivo } = req.body;
    
    // 🔴 CORRECCIÓN: Usar hora de Perú
    const fecha = getFechaPeru();
    const hora = getHoraPeruFormato();
    const fechaHoraCompleta = getHoraPeru().format('YYYY-MM-DD HH:mm:ss');
    
    const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const [empleado] = await promisePool.query(
      'SELECT EmpId FROM empleado WHERE DocID = ?',
      [codigo_empleado]
    );

    if (empleado.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const empId = empleado[0].EmpId;

    const [asistencia] = await promisePool.query(
      `SELECT * FROM asistencia 
             WHERE EmpId = ? AND Fecha = ?`,
      [empId, fecha]
    );

    if (asistencia.length === 0) {
      return res.status(400).json({
        error: 'Registro no encontrado',
        message: 'Debes marcar entrada primero'
      });
    }

    if (!asistencia[0].HoraSalidaAlmuerzo) {
      return res.status(400).json({
        error: 'Secuencia incorrecta',
        message: 'Debes marcar salida a almuerzo primero'
      });
    }

    if (asistencia[0].HoraRegresoAlmuerzo) {
      return res.status(400).json({
        error: 'Registro duplicado',
        message: 'Ya marcaste regreso de almuerzo hoy'
      });
    }

    await promisePool.query('START TRANSACTION');

    // Actualizar registro con hora de Perú
    await promisePool.query(
      `UPDATE asistencia 
             SET HoraRegresoAlmuerzo = ?, MetodoValidacion = ? 
             WHERE EmpId = ? AND Fecha = ?`,
      [hora, req.ubicacionValida.metodo, empId, fecha]
    );

    // Registrar en historial con fecha/hora completa de Perú
    await promisePool.query(
      `INSERT INTO historial_marcaciones 
             (EmpId, FechaHora, Tipo, IPAddress, Dispositivo, MetodoValidacion, DatosValidacion) 
             VALUES (?, ?, 'RegresoAlmuerzo', ?, ?, ?, ?)`,
      [
        empId,
        fechaHoraCompleta,
        ipCliente,
        dispositivo || 'web',
        req.ubicacionValida.metodo,
        JSON.stringify(req.ubicacionValida)
      ]
    );

    await promisePool.query('COMMIT');

    res.json({
      success: true,
      message: 'Regreso de almuerzo registrado',
      hora,
      fecha,
      metodo: req.ubicacionValida.metodo
    });

  } catch (error) {
    await promisePool.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al registrar regreso de almuerzo' });
  }
});

// Marcar salida
app.post('/api/marcaciones/salida', validarUbicacionMarcacion, async (req, res) => {
  try {
    const { codigo_empleado, dispositivo } = req.body;
    
    // 🔴 CORRECCIÓN: Usar hora de Perú
    const fecha = getFechaPeru();
    const hora = getHoraPeruFormato();
    const fechaHoraCompleta = getHoraPeru().format('YYYY-MM-DD HH:mm:ss');
    
    const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const [empleado] = await promisePool.query(
      'SELECT EmpId, Nombres, Apellidos FROM empleado WHERE DocID = ?',
      [codigo_empleado]
    );

    if (empleado.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const empId = empleado[0].EmpId;

    // Obtener registro actual
    const [asistencia] = await promisePool.query(
      `SELECT * FROM asistencia 
             WHERE EmpId = ? AND Fecha = ?`,
      [empId, fecha]
    );

    if (asistencia.length === 0) {
      return res.status(400).json({
        error: 'Registro no encontrado',
        message: 'No hay registro de entrada hoy'
      });
    }

    const reg = asistencia[0];

    // Calcular horas trabajadas usando la fecha de Perú
    const entrada = new Date(`${fecha}T${reg.HoraEntrada}`);
    const salidaAlmuerzo = reg.HoraSalidaAlmuerzo ? new Date(`${fecha}T${reg.HoraSalidaAlmuerzo}`) : null;
    const regresoAlmuerzo = reg.HoraRegresoAlmuerzo ? new Date(`${fecha}T${reg.HoraRegresoAlmuerzo}`) : null;
    const salida = new Date(`${fecha}T${hora}`);

    let horasTrabajadas = 0;

    if (entrada && salida) {
      if (salidaAlmuerzo && regresoAlmuerzo) {
        // Restar tiempo de almuerzo
        const tiempoManana = (salidaAlmuerzo - entrada) / (1000 * 60 * 60);
        const tiempoTarde = (salida - regresoAlmuerzo) / (1000 * 60 * 60);
        horasTrabajadas = tiempoManana + tiempoTarde;
      } else {
        horasTrabajadas = (salida - entrada) / (1000 * 60 * 60);
      }
    }

    await promisePool.query('START TRANSACTION');

    // Actualizar registro con hora de Perú
    await promisePool.query(
      `UPDATE asistencia 
             SET HoraSalida = ?, HorasTrabajadas = ?, Estado = 'Completo', MetodoValidacion = ?
             WHERE EmpId = ? AND Fecha = ?`,
      [hora, horasTrabajadas.toFixed(2), req.ubicacionValida.metodo, empId, fecha]
    );

    // Registrar en historial con fecha/hora completa de Perú
    await promisePool.query(
      `INSERT INTO historial_marcaciones 
             (EmpId, FechaHora, Tipo, IPAddress, Dispositivo, MetodoValidacion, DatosValidacion) 
             VALUES (?, ?, 'Salida', ?, ?, ?, ?)`,
      [
        empId,
        fechaHoraCompleta,
        ipCliente,
        dispositivo || 'web',
        req.ubicacionValida.metodo,
        JSON.stringify(req.ubicacionValida)
      ]
    );

    await promisePool.query('COMMIT');

    res.json({
      success: true,
      message: 'Salida registrada correctamente',
      empleado: `${empleado[0].Nombres} ${empleado[0].Apellidos}`,
      horasTrabajadas: horasTrabajadas.toFixed(2),
      hora,
      fecha,
      metodo: req.ubicacionValida.metodo
    });

  } catch (error) {
    await promisePool.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al registrar salida' });
  }
});

// Obtener registro del día para un empleado
app.get('/api/marcaciones/hoy/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    
    // 🔴 CORRECCIÓN: Usar fecha de Perú
    const fecha = getFechaPeru();

    const [resultados] = await promisePool.query(
      `SELECT a.*, e.Nombres, e.Apellidos, e.DocID
             FROM asistencia a
             INNER JOIN empleado e ON a.EmpId = e.EmpId
             WHERE e.DocID = ? AND a.Fecha = ?`,
      [codigo, fecha]
    );

    res.json(resultados[0] || null);

  } catch (error) {
    console.error("❌ Error obteniendo registro:", error);
    res.status(500).json({
      error: 'Error al obtener registro',
      message: error.message
    });
  }
});

// Endpoint para verificar la hora del servidor (útil para debugging)
app.get('/api/hora-servidor', (req, res) => {
  const horaPeru = getHoraPeru();
  res.json({
    horaPeru: horaPeru.format('YYYY-MM-DD HH:mm:ss'),
    fechaPeru: getFechaPeru(),
    horaPeruFormato: getHoraPeruFormato(),
    zonaHoraria: 'America/Lima',
    timestamp: horaPeru.valueOf()
  });
});

// Obtener configuración de la empresa
app.get('/api/empresa/configuracion', (req, res) => {
  res.json({
    nombre: EMPRESA_CONFIG.nombre,
    direccion: EMPRESA_CONFIG.direccion,
    coordenadas: EMPRESA_CONFIG.coordenadas,
    radioPermitido: EMPRESA_CONFIG.radioPermitido,
    wifiPermitidos: EMPRESA_CONFIG.wifiPermitidos,
    requiereUbicacion: true
  });
});

// Verificar ubicación
app.post('/api/ubicacion/verificar', validarUbicacionMarcacion, (req, res) => {
  res.json({
    valida: true,
    metodo: req.ubicacionValida.metodo,
    datos: req.ubicacionValida
  });
});

// Reporte de asistencia
app.get('/api/reportes/asistencia', async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, empId } = req.query;

    let query = `
            SELECT 
                e.EmpId,
                e.DocID as Codigo,
                e.Nombres,
                e.Apellidos,
                e.Cargo_EmpId,
                a.Fecha,
                a.HoraEntrada,
                a.HoraSalidaAlmuerzo,
                a.HoraRegresoAlmuerzo,
                a.HoraSalida,
                a.HorasTrabajadas,
                a.Estado,
                a.MetodoValidacion
            FROM asistencia a
            INNER JOIN empleado e ON a.EmpId = e.EmpId
            WHERE a.Fecha BETWEEN ? AND ?
        `;

    const params = [fecha_inicio, fecha_fin];

    if (empId) {
      query += ' AND e.EmpId = ?';
      params.push(empId);
    }

    query += ' ORDER BY a.Fecha DESC, e.Nombres';

    const [resultados] = await promisePool.query(query, params);
    res.json(resultados);

  } catch (error) {
    console.error("❌ Error generando reporte:", error);
    res.status(500).json({
      error: 'Error al generar reporte',
      message: error.message
    });
  }
});


/* app.get('/api/venta/estadisticas', async (req, res) => {
  try {
    console.log('🔍 Headers recibidos:', req.headers);
    console.log('🔍 URL completa:', req.url);
    console.log('🔍 Query parameters:', req.query);
    console.log('🔍 Método:', req.method);
    
    const { search, fechaInicio, fechaFin } = req.query;
    
    // Resto de tu código...
    
  } catch (error) {
    console.error('❌ Error completo:', error);
    res.status(500).json({ error: error.message });
  }
}); */




// server.js - Agrega esto después de las importaciones y antes de las rutas

// 🔐 MIDDLEWARE DE AUTENTICACIÓN
const authenticateToken = (req, res, next) => {
  // Excluir rutas públicas
  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/create-admin',
    '/api/auth/check-table',
    '/api/test',
    '/'
  ];

  if (publicRoutes.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    console.log('❌ Token no proporcionado para ruta:', req.path);
    return res.status(401).json({
      success: false,
      error: 'Token de acceso requerido'
    });
  }

  jwt.verify(token, 'secreto_golden_nails_2024', (err, user) => {
    if (err) {
      console.log('❌ Token inválido:', err.message);
      return res.status(403).json({
        success: false,
        error: 'Token inválido o expirado'
      });
    }

    req.user = user;
    next();
  });
};



// 🔐 APLICAR MIDDLEWARE A TODAS LAS RUTAS DEL API
app.use('/api', authenticateToken);





// 🔄 RUTA PARA CAMBIAR CONTRASEÑA DESDE EL PERFIL
app.post('/api/auth/cambiar-password', authenticateToken, async (req, res) => {
  const { passwordActual, nuevoPassword } = req.body;
  const usuarioId = req.user.usuario_id;

  if (!passwordActual || !nuevoPassword) {
    return res.status(400).json({
      success: false,
      error: 'La contraseña actual y la nueva contraseña son requeridas'
    });
  }

  if (nuevoPassword.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'La nueva contraseña debe tener al menos 6 caracteres'
    });
  }

  try {
    // Primero verificar la contraseña actual
    const sqlVerificar = 'SELECT contrasena FROM usuario WHERE usuario_id = ?';

    pool.query(sqlVerificar, [usuarioId], async (err, results) => {
      if (err) {
        console.error('Error verificando contraseña actual:', err);
        return res.status(500).json({
          success: false,
          error: 'Error al verificar contraseña'
        });
      }

      if (results.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }

      const usuario = results[0];

      // Verificar que la contraseña actual sea correcta
      const isPasswordValid = await bcryptjs.compare(passwordActual, usuario.contrasena);

      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          error: 'La contraseña actual es incorrecta'
        });
      }

      // Encriptar la nueva contraseña
      const hashedPassword = await bcryptjs.hash(nuevoPassword, 10);

      // Actualizar la contraseña
      const sqlActualizar = 'UPDATE usuario SET contrasena = ? WHERE usuario_id = ?';

      pool.query(sqlActualizar, [hashedPassword, usuarioId], (err, results) => {
        if (err) {
          console.error('Error actualizando contraseña:', err);
          return res.status(500).json({
            success: false,
            error: 'Error al actualizar contraseña'
          });
        }

        if (results.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            error: 'Usuario no encontrado'
          });
        }

        console.log(`✅ Contraseña actualizada para usuario ID: ${usuarioId}`);

        res.json({
          success: true,
          message: 'Contraseña actualizada exitosamente'
        });
      });
    });

  } catch (error) {
    console.error('Error en proceso de cambio de contraseña:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// 🔄 RUTA PARA ACTUALIZAR PERFIL DE USUARIO
app.put('/api/auth/perfil', authenticateToken, async (req, res) => {
  const { nombre, apellido, correo, telefono, direccion } = req.body;
  const usuarioId = req.user.usuario_id;

  if (!nombre || !apellido || !correo) {
    return res.status(400).json({
      success: false,
      error: 'Nombre, apellido y correo son requeridos'
    });
  }

  try {
    const sql = `
      UPDATE usuario 
      SET nombre = ?, apellido = ?, correo = ?, telefono = ?, direccion = ?
      WHERE usuario_id = ?
    `;

    pool.query(sql, [nombre, apellido, correo, telefono, direccion, usuarioId], (err, results) => {
      if (err) {
        console.error('Error actualizando perfil:', err);

        // Manejar error de duplicado de correo
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({
            success: false,
            error: 'El correo electrónico ya está en uso'
          });
        }

        return res.status(500).json({
          success: false,
          error: 'Error al actualizar perfil'
        });
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }

      // Obtener los datos actualizados del usuario
      const sqlUsuario = 'SELECT usuario_id, nombre, apellido, usuario, correo, telefono, direccion, rol, estado FROM usuario WHERE usuario_id = ?';

      pool.query(sqlUsuario, [usuarioId], (err, userResults) => {
        if (err) {
          console.error('Error obteniendo usuario actualizado:', err);
          return res.status(500).json({
            success: false,
            error: 'Error al obtener datos actualizados'
          });
        }

        const usuarioActualizado = userResults[0];

        console.log(`✅ Perfil actualizado para usuario: ${usuarioActualizado.usuario}`);

        res.json({
          success: true,
          message: 'Perfil actualizado exitosamente',
          user: usuarioActualizado
        });
      });
    });

  } catch (error) {
    console.error('Error en proceso de actualización de perfil:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// 👤 RUTA PARA OBTENER DATOS DEL PERFIL
app.get('/api/auth/perfil', authenticateToken, (req, res) => {
  const usuarioId = req.user.usuario_id;

  const sql = 'SELECT usuario_id, nombre, apellido, usuario, correo, telefono, direccion, rol, estado FROM usuario WHERE usuario_id = ?';

  pool.query(sql, [usuarioId], (err, results) => {
    if (err) {
      console.error('Error obteniendo perfil:', err);
      return res.status(500).json({
        success: false,
        error: 'Error al obtener datos del perfil'
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const usuario = results[0];

    res.json({
      success: true,
      user: usuario
    });
  });
});


// MANEJO DE RUTAS NO ENCONTRADAS
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada',
    path: req.path
  });
});


// 🔹 Configuración del puerto del servidor Express
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});