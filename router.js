import express from "express";
import pool from "./server.js"; // tu conexión MySQL

const router = express.Router();

router.post("/gastos", async (req, res) => {
  const { descripcion, monto, categoria_id, periodo_id, observaciones, EmpId, pagos } = req.body;

  const conn = await pool.getConnection();
  await conn.beginTransaction();
  
  try {
    // 🧩 Validaciones básicas
    if (!descripcion || !monto || !categoria_id || !periodo_id || !EmpId) {
      throw new Error("Faltan campos obligatorios");
    }

    if (!Array.isArray(pagos) || pagos.length === 0) {
      throw new Error("Debe incluir al menos un tipo de pago");
    }

    // Validar que los montos de los pagos sumen igual al monto total
    const sumaPagos = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
    if (Math.abs(sumaPagos - Number(monto)) > 0.01) {
      throw new Error("La suma de los montos por tipo de pago no coincide con el monto total");
    }

    // 📝 Insertar gasto principal
    const [result] = await conn.query(
      `INSERT INTO gastos (descripcion, monto, categoria_id, periodo_id, observaciones, EmpId)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [descripcion, monto, categoria_id, periodo_id, observaciones || null, EmpId]
    );

    const gastoId = result.insertId;


// Insertar tipos de pago
for (const pago of pagos) {
  const tipoId = parseInt(pago.tipo_pago_id, 10);
  const montoPago = parseFloat(pago.monto);

  console.log("💳 Insertando tipo de pago:", { gastoId, tipoId, montoPago }); // 👈 LOG NUEVO

  if (!tipoId || isNaN(tipoId) || isNaN(montoPago)) continue;

  await conn.query(
    `INSERT INTO gasto_tipo_pago (gasto_id, tipo_pago_id, monto)
     VALUES (?, ?, ?)`,
    [gastoId, tipoId, montoPago]
  );
}

    await conn.commit();

    res.json({
      success: true,
      message: "✅ Gasto registrado correctamente",
      gasto_id: gastoId,
    });
  } catch (error) {
    await conn.rollback();
    console.error("❌ Error al registrar gasto:", error.message);
    res.status(400).json({
      success: false,
      message: error.message || "Error al registrar gasto",
    });
  } finally {
    conn.release();
  }
});

export default router;
