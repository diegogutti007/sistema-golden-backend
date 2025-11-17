import express from "express";
//import pool from "../server.js";
const pool = require("../server.js");
const router = express.Router();

// 🟢 Listar todos los gastos
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`
 SELECT 
        g.gasto_id,
        g.descripcion,
        g.monto,
        g.observaciones,
        g.categoria_id,
        c.nombre AS categoria_nombre,
        g.periodo_id,
        p.nombre AS periodo_nombre,
        g.EmpId,
        CONCAT(e.Nombres, ' ', e.Apellidos) AS empleado_nombre
      FROM gastos g
      LEFT JOIN categoria_gasto c ON g.categoria_id = c.categoria_id
      LEFT JOIN periodo p ON g.periodo_id = p.periodo_id
      LEFT JOIN empleado e ON g.EmpId = e.EmpId
      ORDER BY g.gasto_id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener gastos" });
  }
});

// 🟡 Obtener un gasto por ID
/* router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM gastos WHERE gasto_id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Gasto no encontrado" });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener gasto" });
  }
});

// 🟢 Crear un nuevo gasto
router.post("/", async (req, res) => {
  try {
    const { descripcion, monto, categoria_id, periodo_id, observaciones, EmpId } = req.body;
    const [result] = await pool.query(
      `INSERT INTO gastos (descripcion, monto, categoria_id, periodo_id, observaciones, EmpId)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [descripcion, monto, categoria_id, periodo_id, observaciones, EmpId]
    );
    res.json({ id: result.insertId, mensaje: "Gasto registrado" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al registrar gasto" });
  }
});

// 🟠 Actualizar gasto
router.put("/:id", async (req, res) => {
  try {
    const { descripcion, monto, categoria_id, periodo_id, observaciones, EmpId } = req.body;
    await pool.query(
      `UPDATE gastos 
       SET descripcion=?, monto=?, categoria_id=?, periodo_id=?, observaciones=?, EmpId=?
       WHERE gasto_id=?`,
      [descripcion, monto, categoria_id, periodo_id, observaciones, EmpId, req.params.id]
    );
    res.json({ mensaje: "Gasto actualizado" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar gasto" });
  }
});

// 🔴 Eliminar gasto
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM gastos WHERE gasto_id = ?", [req.params.id]);
    res.json({ mensaje: "Gasto eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar gasto" });
  }
});
 */
export default router;
