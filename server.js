// server.js
const express = require('express');
const mysql = require('mysql2');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// ✅ CONFIGURACIÓN CORS MEJORADA - PERMITE TU FRONTEND EN VERCEL
app.use(cors({
  origin: [
    "https://sistemagolden.up.railway.app", // Tu frontend en Vercel
    "http://localhost:3000",
    "http://localhost:5173"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ✅ MANEJAR PREFLIGHT REQUESTS
app.options('*', cors());

app.use(express.json());

// ✅ CONEXIÓN A BASE DE DATOS OPTIMIZADA PARA RAILWAY
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'yamanote.proxy.rlwy.net',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || 'sqIqWLyrtCbSWodmEwMWKQipEjHOwrzC',
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
    console.log('🔍 Variables de entorno:');
    console.log('- MYSQLHOST:', process.env.MYSQLHOST);
    console.log('- MYSQLUSER:', process.env.MYSQLUSER);
    console.log('- MYSQLDATABASE:', process.env.MYSQLDATABASE);
    console.log('- MYSQLPORT:', process.env.MYSQLPORT);
  } else {
    console.log('✅ Conectado a MySQL en Railway');
    connection.release();
  }
});

// Middleware de log
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
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
      database: {
        connected: true,
        name: process.env.MYSQLDATABASE,
        host: process.env.MYSQLHOST,
        user: process.env.MYSQLUSER
      },
      message: '✅ Backend funcionando correctamente'
    });
  } catch (error) {
    res.json({ 
      status: 'server running', 
      database: {
        connected: false,
        error: error.message,
        name: process.env.MYSQLDATABASE,
        host: process.env.MYSQLHOST,
        user: process.env.MYSQLUSER
      },
      environment: 'production'
    });
  }
});

// ✅ RUTA DE LOGIN MEJORADA
app.post('/api/auth/login', (req, res) => {
  console.log('🔐 Intento de login recibido:', req.body);
  
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
    console.log('👤 Usuario encontrado:', user.usuario);

    if (user.estado !== 'activo') {
      return res.status(401).json({ 
        success: false,
        error: 'Usuario inactivo' 
      });
    }

    try {
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

    } catch (error) {
      console.error('❌ Error en bcryptjs:', error);
      res.status(500).json({ 
        success: false,
        error: 'Error interno del servidor' 
      });
    }
  });
});

// ✅ CREAR USUARIO ADMIN (SI NO EXISTE)
app.post('/api/auth/create-admin', async (req, res) => {
  const password = 'admin123';
  
  try {
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
        console.error('❌ Error creando admin:', err);
        return res.status(500).json({ 
          success: false,
          error: 'Error creando usuario admin' 
        });
      }

      console.log('✅ Usuario admin creado');
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
    console.error('❌ Error hasheando contraseña:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error creando usuario admin' 
    });
  }
});

// ✅ VERIFICAR TABLA USUARIO
app.get('/api/auth/check-table', (req, res) => {
  const sql = "SHOW TABLES LIKE 'usuario'";
  
  pool.query(sql, (err, results) => {
    if (err) {
      console.error('❌ Error verificando tabla:', err);
      return res.status(500).json({ error: 'Error en base de datos' });
    }
    
    res.json({ 
      tableExists: results.length > 0
    });
  });
});

// ✅ LISTAR USUARIOS
app.get('/api/auth/users', (req, res) => {
  const sql = 'SELECT usuario_id, nombre, usuario, correo, rol, estado FROM usuario';
  
  pool.query(sql, (err, results) => {
    if (err) {
      console.error('❌ Error obteniendo usuarios:', err);
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

///////////////////Empleados/////////////////////////////////////////////////////////////
// 🔹 Combobox tipo_empleado
app.get('/api/tipo-empleado', (req, res) => {
  pool.query('SELECT * FROM tipo_empleado', (err, results) => {
    if (err) {
      console.error('❌ Error en la consulta:', err);
      return res.status(500).json({ error: 'Error en la consulta' });
    }
    res.json(results);
  });
});

// 🔹 Combobox cargo_empleado
app.get('/api/cargo-empleado', (req, res) => {
  pool.query('SELECT * FROM Cargo_Empleado', (err, results) => {
    if (err) {
      console.error('❌ Error en la consulta:', err);
      return res.status(500).json({ error: 'Error en la consulta' });
    }
    res.json(results);
  });
});

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
    FROM Empleado e
    JOIN tipo_empleado t ON e.Tipo_EmpId = t.Tipo_EmpId
    JOIN Cargo_Empleado c ON e.Cargo_EmpId = c.Cargo_EmpId
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

  if (!nombres || !apellidos || !docId || !tipo_EmpId || !fechaNacimiento || !fechaIngreso || !sueldo || !cargo_EmpId ) {
    return res.status(400).json({ 
      error: "Todos los campos excepto fecha_renuncia son requeridos" 
    });
  }

  const query = `
    UPDATE Empleado 
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
    fechaRenuncia || null,
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
// ✅ Obtener todas las citas
app.get('/api/citas', (req, res) => {
  const query = `
    SELECT c.*, CONCAT(p.nombre, ' ', p.apellido) AS ClienteNombre, CONCAT(e.nombres, ' ', e.apellidos) AS EmpleadoNombre
    FROM citas c
    LEFT JOIN cliente p ON c.ClienteID = p.ClienteID
    LEFT JOIN Empleado e ON c.EmpId = e.EmpId
    ORDER BY c.FechaInicio;
  `;
  pool.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al obtener citas' });

    const eventos = results.map(r => ({
      id: r.CitaID,
      title: r.Titulo || r.ClienteNombre || 'Cita sin título',
      descripcion: r.Descripcion,
      start: r.FechaInicio,
      end: r.FechaFin,
      backgroundColor:
        r.Estado === 'Cancelada' ? '#f87171' :
          r.Estado === 'Completada' ? '#34d399' : '#60a5fa',
      extendedProps: {
        clienteNombre: r.ClienteNombre,
        empleadoNombre: r.EmpleadoNombre,
        estado: r.Estado,
        clienteID: r.ClienteID,
        EmpId: r.EmpId
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

// ✅ Obtener citas filtradas para combo
app.get("/api/citascombo", (req, res) => {
  const { search = "" } = req.query;

  const sql = `
    SELECT DISTINCT
      c.CitaID, 
      CONCAT(
        DAY(c.FechaInicio), ' ',
        ELT(MONTH(c.FechaInicio),
          'Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 
          'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'
        ), 
        ' ', DATE_FORMAT(c.FechaInicio, '%H:%i'),
        ' - ', c.titulo
      ) AS nombre,
      c.ClienteID
    FROM citas c
    LEFT JOIN venta v ON c.CitaID = v.CitaID
    WHERE v.VentaID IS NULL
      AND c.ClienteID LIKE ?
    LIMIT 15;
  `;

  const filtro = `%${search}%`;

  pool.query(sql, [filtro], (err, results) => {
    if (err) {
      console.error("❌ Error obteniendo Citas combo:", err);
      return res.status(500).json({ error: "Error al obtener citas" });
    }
    res.json(results);
  });
});

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

          const insertPago = `
            INSERT INTO gasto_tipo_pago (gasto_id, tipo_pago_id, monto)
            VALUES (?, ?, ?)
          `;

          const promises = pagos.map((pago) => {
            return new Promise((resolve, reject) => {
              const tipoId = parseInt(pago.tipo_pago_id, 10);
              const montoPago = parseFloat(pago.monto);

              if (!tipoId || isNaN(tipoId) || isNaN(montoPago)) return resolve();

              conn.query(insertPago, [gastoId, tipoId, montoPago], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          });

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

// 🔹 Obtener todos los artículos
app.get("/api/articulos", (req, res) => {
  pool.query("SELECT * FROM Articulo", (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

// 🔹 Obtener tipos de pago para ventas
app.get("/api/tipos_pago", (req, res) => {
  pool.query("SELECT * FROM tipo_pago", (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

// 🔹 Registrar una nueva venta
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

      const sqlVenta = `
        INSERT INTO venta (ClienteID, FechaVenta, Total, CitaID, Observaciones, usuario_id, Estado)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      connection.query(
        sqlVenta,
        [ClienteID, FechaVenta, Total, CitaID || null, Observaciones || null, 1, 'Pagada'],
        (err, resultVenta) => {
          if (err) {
            return connection.rollback(() => {
              connection.release();
              res.status(500).json({ error: "Error al registrar venta." });
            });
          }

          const ventaID = resultVenta.insertId;

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

// Listar ventas
app.get('/api/venta', (req, res) => {
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

  pool.query(sqlVentas, [`%${search}%`, `%${search}%`, parseInt(limit), parseInt(offset)], (err, ventas) => {
    if (err) {
      console.error("❌ Error al obtener ventas:", err);
      return res.status(500).json({ error: "Error al obtener ventas" });
    }

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
});

// Obtener venta por ID
app.get("/api/venta/:id", (req, res) => {
  const { id } = req.params;

  const sqlVenta = `
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

    const sqlDetalles = `
      SELECT 
        d.DetalleID,
        a.ArticuloID,
        a.Nombre AS ArticuloNombre,
        d.Cantidad,
        d.PrecioUnitario,
        (d.Cantidad * d.PrecioUnitario) AS Importe
      FROM Venta_Detalle d
      JOIN Articulo a ON d.ArticuloID = a.ArticuloID
      WHERE d.VentaID = ?
    `;

    pool.query(sqlDetalles, [id], (err, detallesResult) => {
      if (err) {
        console.error("❌ Error al obtener detalles:", err);
        return res.status(500).json({ error: "Error al obtener detalles" });
      }

      const sqlPagos = `
        SELECT 
          vp.venta_pago_id,
          tp.nombre AS TipoPago,
          vp.monto
        FROM Venta_Tipo_Pago vp
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

// Eliminar venta
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

      conn.query("DELETE FROM Venta_Tipo_Pago WHERE VentaID = ?", [id], (err) => {
        if (err) {
          return conn.rollback(() => {
            conn.release();
            console.error("❌ Error al eliminar pagos:", err);
            res.status(500).json({ error: "Error al eliminar pagos" });
          });
        }

        conn.query("DELETE FROM Venta_Detalle WHERE VentaID = ?", [id], (err) => {
          if (err) {
            return conn.rollback(() => {
              conn.release();
              console.error("❌ Error al eliminar detalles:", err);
              res.status(500).json({ error: "Error al eliminar detalles" });
            });
          }

          conn.query("DELETE FROM Venta WHERE VentaID = ?", [id], (err) => {
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

// ✅ Obtener resumen de comisiones por empleado
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
    FROM Empleado e
    LEFT JOIN Tipo_Empleado te ON e.Tipo_EmpId = te.Tipo_EmpId
    LEFT JOIN Cargo_Empleado ce ON e.Cargo_EmpId = ce.Cargo_EmpId
    LEFT JOIN Venta_Detalle vd ON e.EmpId = vd.EmpId
    LEFT JOIN Venta v ON vd.VentaID = v.VentaID
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

// ✅ Obtener detalle de ventas de un empleado
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
    FROM Venta_Detalle vd
    INNER JOIN Venta v ON vd.VentaID = v.VentaID
    INNER JOIN Articulo a ON vd.ArticuloID = a.ArticuloID
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
    SELECT g.*, c.nombre AS categoria_nombre, CONCAT(e.nombre, ' ', e.apellido) AS usuario_nombre
    FROM gastos g
    LEFT JOIN categoria_gasto c ON g.categoria_id = c.categoria_id
    LEFT JOIN usuario e ON g.usuario_id = e.usuario_id
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

// Estadísticas de ventas
app.get('/api/estadisticas/ventas', (req, res) => {
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
});

// 🔐 MIDDLEWARE DE AUTENTICACIÓN
const authenticateToken = (req, res, next) => {
  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/create-admin', 
    '/api/auth/check-table',
    '/api/test',
    '/health',
    '/'
  ];
  
  if (publicRoutes.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ Token no proporcionado para ruta:', req.path);
    return res.status(401).json({ 
      success: false,
      error: 'Token de acceso requerido' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secreto_golden_nails_2024', (err, user) => {
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

// RUTAS DE PERFIL Y CAMBIO DE CONTRASEÑA
app.post('/api/auth/cambiar-password', async (req, res) => {
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
      const isPasswordValid = await bcryptjs.compare(passwordActual, usuario.contrasena);
      
      if (!isPasswordValid) {
        return res.status(400).json({ 
          success: false,
          error: 'La contraseña actual es incorrecta' 
        });
      }

      const hashedPassword = await bcryptjs.hash(nuevoPassword, 10);
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
app.put('/api/auth/perfil', async (req, res) => {
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
app.get('/api/auth/perfil', (req, res) => {
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

// RUTA PRINCIPAL
app.get("/", (req, res) => {
  res.json({ 
    message: "🚀 Backend Sistema Golden funcionando",
    status: "online",
    timestamp: new Date().toISOString()
  });
});

// MANEJO DE RUTAS NO ENCONTRADAS
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Ruta no encontrada',
    path: req.path,
    method: req.method
  });
});

// 🔹 Configuración del puerto del servidor Express
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});