import assert from "node:assert/strict";
import test from "node:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DusemaTenantCardView,
  type DusemaTenantCardViewState,
} from "./dusema-tenant-card";
import { entradaConsultaTenantDusema } from "@/lib/platform/client";
import { Button } from "@/components/ui/button";

const tenant = {
  id: "tenant-1",
  nombre: "Tenant Uno",
  razonSocial: "Tenant Uno S.A.S.",
  nit: "900000000-1",
  activo: true,
  plan: "basic",
  createdAt: "2026-08-31T12:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z",
};

function renderState(state: DusemaTenantCardViewState) {
  return renderToStaticMarkup(<DusemaTenantCardView state={state} onRetry={() => undefined} />);
}

function findButtons(node: ReactNode): ReactElement[] {
  if (!node || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return [];
  if (Array.isArray(node)) return node.flatMap(findButtons);
  if (typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === Button) return [element];
  if (typeof element.type === "function") {
    const Component = element.type as (props: Record<string, unknown>) => ReactNode;
    return findButtons(Component(element.props));
  }
  return findButtons((element.props as { children?: ReactNode }).children);
}

test("renderiza NO_VINCULADO sin error técnico", () => {
  const html = renderState({ kind: "result", value: { estado: "NO_VINCULADO", tenant: null } });
  assert.match(html, /No vinculado/);
  assert.match(html, /no tiene un Tenant Dusema vinculado/);
  assert.doesNotMatch(html, /No fue posible cargar/);
});

test("renderiza Tenant activo y solamente metadata permitida", () => {
  const html = renderState({ kind: "result", value: { estado: "ACTIVO", tenant } });
  for (const value of [tenant.id, tenant.nombre, tenant.razonSocial, tenant.nit, "Activo", tenant.plan]) {
    assert.match(html, new RegExp(value));
  }
  assert.doesNotMatch(html, /externalTenantId|passwordHash|users|Authorization|Bearer|DUSEMA_S2S_PRIVATE_KEY/);
});

test("renderiza Tenant inactivo de forma explícita", () => {
  const html = renderState({ kind: "result", value: { estado: "INACTIVO", tenant: { ...tenant, activo: false } } });
  assert.match(html, /INACTIVO/);
  assert.match(html, /Inactivo/);
});

test("renderiza NO_ENCONTRADO", () => {
  const html = renderState({ kind: "result", value: { estado: "NO_ENCONTRADO", tenant: null } });
  assert.match(html, /Tenant no encontrado/);
});

test("ERROR_TEMPORAL es el único resultado con reintento", () => {
  const html = renderState({ kind: "result", value: { estado: "ERROR_TEMPORAL", tenant: null } });
  assert.match(html, /Error temporal/);
  assert.match(html, /Reintentar/);

  let retries = 0;
  const tree = DusemaTenantCardView({
    state: { kind: "result", value: { estado: "ERROR_TEMPORAL", tenant: null } },
    onRetry: () => { retries += 1; },
  });
  const button = findButtons(tree)[0];
  assert.ok(button);
  (button.props as { onClick?: () => void }).onClick?.();
  assert.equal(retries, 1);
});

test("errores de autorización, binding y otros errores son controlados y no reintentan", () => {
  for (const message of [
    "No tienes autorización para consultar Dusema.",
    "El Tenant Dusema no está disponible para esta Empresa.",
    "No fue posible consultar el Tenant Dusema.",
  ]) {
    const html = renderState({ kind: "error", message });
    assert.match(html, new RegExp(message.replace(/[.?]/g, "\\$&")));
    assert.doesNotMatch(html, /Reintentar/);
  }
});

test("sin facultad no inicia una consulta", () => {
  const html = renderToStaticMarkup(<DusemaTenantCardView state={{ kind: "unauthorized" }} />);
  assert.match(html, /No tienes autorización para consultar Dusema/);
  assert.doesNotMatch(html, /Consultando Tenant Dusema/);
});

test("la Callable recibe únicamente empresaPosId", () => {
  const entrada = entradaConsultaTenantDusema("empresa-a");
  assert.deepEqual(entrada, { empresaPosId: "empresa-a" });
  assert.deepEqual(Object.keys(entrada), ["empresaPosId"]);
  assert.doesNotMatch(JSON.stringify(entrada), /tenantId|externalTenantId|baseUrl/i);
});
