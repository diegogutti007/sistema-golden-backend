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


// 🔹 Combobox tipo_empleado
app.get('/api/cargo-empleado', (req, res) => {
  pool.query('SELECT * FROM cargo_empleado', (err, results) => {
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
        SELECT c.*, CONCAT(p.nombre, ' ', p.apellido) AS ClienteNombre, CONCAT(e.nombres, ' ', e.apellidos) AS EmpleadoNombre
    FROM citas c
    LEFT JOIN cliente p ON c.ClienteID = p.ClienteID
    LEFT JOIN empleado e ON c.EmpId = e.EmpId
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
      end: r.FechaFin,
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
              res.status(500).json({ ClienteID, FechaVenta, Total, Detalles, Pagos, CitaID, Observaciones});
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
  let montoInicial = 500.00;
  
  if (!fecha) {
    console.log("⚠️ Sin fecha, usando valor por defecto:", montoInicial);
    return res.json({ monto: montoInicial });
  }
  
  const sql = `
    SELECT dinero_final_caja as monto 
    FROM cierre_caja 
    WHERE estado = 'CORRECTO'
    ORDER BY fecha DESC, fecha_creacion DESC 
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
app.get('/api/cierre-caja/verificar', async (req, res) => {
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






// ✅ Obtener citas filtradas para combo con búsqueda
app.get("/api/citascombo", (req, res) => {
  const { search = "" } = req.query; // parámetro opcional ?search=

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

  pool.query(sql, [filtro, filtro, filtro], (err, results) => {
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

app.get('/api/venta', async (req, res) => {
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
          const monto = parseFloat(venta.Total || venta.total || venta.monto || venta.Importe || 0);
          total += monto;
          
          const metodoPago = (venta.MetodoPago || venta.metodo_pago || venta.Metodo_Pago || '').toString().toLowerCase();
          
          if (metodoPago.includes('efectivo') || metodoPago === 'cash') {
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
      `SELECT * FROM venta WHERE DATE(FechaVenta) = ?`,
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
      `SELECT * FROM venta WHERE DATE(FechaVenta) BETWEEN ? AND ?`,
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
      `SELECT SUM(Total) as total FROM venta`,
      (error, results) => {
        if (error) {
          console.error('❌ Error al calcular total general:', error);
          resultados.errores.push('Error total general');
        } else {
          resultados.totalGeneral = parseFloat(results[0]?.total) || 0;
          console.log('✅ Total general ventas:', resultados.totalGeneral);
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