const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error('El archivo de base de datos no existe en la ruta:', dbPath);
    return;
  }
  
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  // Get all columns and rows from usuarios
  try {
    const res = db.exec("SELECT id, usuario, password, rol, activo, debe_cambiar_password, ultimo_acceso FROM usuarios");
    console.log("=== USUARIOS ===");
    if (res.length > 0) {
      const columns = res[0].columns;
      const values = res[0].values;
      const usuarios = values.map(row => {
        const obj = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });
      console.log(JSON.stringify(usuarios, null, 2));
    } else {
      console.log("No hay usuarios registrados o la tabla está vacía.");
    }
  } catch (err) {
    console.error("Error al consultar usuarios:", err.message);
  }

  // Check audit logs to see password change logs or login attempts
  try {
    const auditRes = db.exec("SELECT id, usuario, accion, detalles, fecha FROM auditoria ORDER BY id DESC LIMIT 30");
    console.log("\n=== HISTORIAL DE AUDITORÍA ===");
    if (auditRes.length > 0) {
      const columns = auditRes[0].columns;
      const values = auditRes[0].values;
      const logs = values.map(row => {
        const obj = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });
      console.log(JSON.stringify(logs, null, 2));
    } else {
      console.log("No hay registros de auditoría.");
    }
  } catch (err) {
    console.error("Error al consultar auditoría:", err.message);
  }
}

main().catch(console.error);
