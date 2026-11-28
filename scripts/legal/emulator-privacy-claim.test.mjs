import test from 'node:test';
import assert from 'node:assert/strict';

// Rehearsal only. The owner token is accepted by the local emulator.
test('reclamo sintético: anotar motivo en el registro afectado y conservar el cierre', async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host ?? '', /^127\.0\.0\.1:[1-9]\d{0,4}$/);
  const database = 'projects/demo-dusema-privacy/databases/(default)';
  const base = `http://${host}/v1/${database}/documents`;
  const record = 'privacy_claim_fixtures/affected';
  const neighbor = 'privacy_claim_fixtures/neighbor';
  const claim = 'privacy_claim_fixtures/claim';
  const fields = values => Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { stringValue: value }]),
  );
  const request = async (suffix, method = 'GET', data) => {
    const response = await fetch(base + suffix, {
      method,
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    assert.equal(response.ok, true, `${method} ${response.status}`);
    return response.json();
  };
  const update = (path, values, currentDocument) => ({
    update: { name: `${database}/documents/${path}`, fields: fields(values) },
    updateMask: { fieldPaths: Object.keys(values) },
    currentDocument,
  });
  const seed = async (path, tenant) => request(`/${path}`, 'PATCH', {
    fields: fields({ tenant, nombre: 'Dato sintético' }),
  });
  const affected = await seed(record, 'tenant-a');
  const other = await seed(neighbor, 'tenant-b');
  const motivo = 'Rectificación de nombre';

  await request(':commit', 'POST', { writes: [
    update(record, { leyenda: 'reclamo en trámite', motivo }, { updateTime: affected.updateTime }),
    update(claim, { tenant: 'tenant-a', record, motivo, estado: 'ABIERTO' }, { exists: false }),
  ] });
  const annotated = await request(`/${record}`);
  const opened = await request(`/${claim}`);
  assert.equal(annotated.fields.leyenda.stringValue, 'reclamo en trámite');
  assert.equal(annotated.fields.motivo.stringValue, motivo);
  assert.equal(opened.fields.record.stringValue, record);

  const corrected = update(record, { nombre: 'Dato corregido' }, { updateTime: annotated.updateTime });
  corrected.updateMask.fieldPaths.push('leyenda', 'motivo');
  await request(':commit', 'POST', { writes: [
    corrected,
    update(claim, { estado: 'RESUELTO', resultado: 'Rectificado' }, { updateTime: opened.updateTime }),
  ] });
  const after = await request(`/${record}`);
  assert.equal(after.fields.nombre.stringValue, 'Dato corregido');
  assert.equal(after.fields.tenant.stringValue, 'tenant-a');
  assert.equal(after.fields.leyenda, undefined);
  assert.equal(after.fields.motivo, undefined);
  const closed = await request(`/${claim}`);
  assert.equal(closed.fields.estado.stringValue, 'RESUELTO');
  assert.equal(closed.fields.motivo.stringValue, motivo);
  assert.deepEqual(await request(`/${neighbor}`), other);
});
