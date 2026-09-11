import assert from 'node:assert/strict';
import test from 'node:test';
import { esAdminTenantActivo, listarPerfilesMinimosTenant } from './service';

function documento(id: string, datos: Record<string, unknown> | undefined) {
  return { id, exists: datos !== undefined, data: () => datos };
}

function dbDePrueba() {
  const membresias = [
    documento('empresa-a_admin-a', { empresaId: 'empresa-a', uid: 'admin-a', rol: 'admin', estado: 'activa', activo: true }),
    documento('empresa-a_cajero-a', { empresaId: 'empresa-a', uid: 'cajero-a', rol: 'cajero', estado: 'activa', activo: true }),
    documento('empresa-a_inactivo', { empresaId: 'empresa-a', uid: 'inactivo-a', rol: 'cajero', estado: 'inactiva', activo: false }),
    documento('empresa-b_admin-b', { empresaId: 'empresa-b', uid: 'admin-b', rol: 'admin', estado: 'activa', activo: true }),
  ];
  const perfiles: Record<string, Record<string, unknown>> = {
    'admin-a': { nombre: 'Admin A', username: 'admin-a', email: 'a@example.test', fcmTokens: ['secret-a'] },
    'cajero-a': { nombre: 'Cajero A', username: 'cajero-a', email: 'c@example.test', fcmTokens: ['secret-c'] },
    'admin-b': { nombre: 'Admin B', username: 'admin-b', email: 'b@example.test', fcmTokens: ['secret-b'] },
  };
  const consultas: Array<{ campo: string, valor: string }> = [];
  return {
    consultas,
    db: {
      collection(nombre: string) {
        return {
          doc(id: string) { return { nombre, id }; },
          where(campo: string, _operador: '==', valor: string) {
            return {
              async get() {
                consultas.push({ campo, valor });
                return { docs: nombre === 'membresias' ? membresias.filter((m) => m.data()?.empresaId === valor || m.id.startsWith(`${valor}_`)) : [] };
              },
            };
          },
        };
      },
      async getAll(...referencias: Array<{ nombre: string, id: string }>) {
        return referencias.map((referencia) => documento(referencia.id, perfiles[referencia.id]));
      },
    },
  };
}

test('autoriza únicamente un admin con claim y membresía activa coincidentes', () => {
  const contexto = { uid: 'admin-a', empresaId: 'empresa-a', rol: 'admin' };
  assert.equal(esAdminTenantActivo(contexto, { empresaId: 'empresa-a', uid: 'admin-a', rol: 'admin', estado: 'activa', activo: true }), true);
  assert.equal(esAdminTenantActivo({ ...contexto, rol: 'cajero' }, { empresaId: 'empresa-a', uid: 'admin-a', rol: 'admin', estado: 'activa', activo: true }), false);
  assert.equal(esAdminTenantActivo(contexto, { empresaId: 'empresa-a', uid: 'admin-b', rol: 'admin', estado: 'activa', activo: true }), false);
  assert.equal(esAdminTenantActivo(contexto, { empresaId: 'empresa-b', uid: 'admin-a', rol: 'admin', estado: 'activa', activo: true }), false);
  assert.equal(esAdminTenantActivo(contexto, { empresaId: 'empresa-a', uid: 'admin-a', rol: 'admin', estado: 'inactiva', activo: false }), false);
});

test('el directorio backend se limita al tenant y no proyecta email ni fcmTokens', async () => {
  const prueba = dbDePrueba();
  const perfiles = await listarPerfilesMinimosTenant(prueba.db as never, 'empresa-a');

  assert.deepEqual(prueba.consultas, [{ campo: 'empresaId', valor: 'empresa-a' }]);
  assert.deepEqual(perfiles, [
    { uid: 'admin-a', nombre: 'Admin A', username: 'admin-a' },
    { uid: 'cajero-a', nombre: 'Cajero A', username: 'cajero-a' },
    { uid: 'inactivo-a', nombre: 'inactivo-a', username: '' },
  ]);
  assert.equal(JSON.stringify(perfiles).includes('fcmTokens'), false);
  assert.equal(JSON.stringify(perfiles).includes('example.test'), false);
});
