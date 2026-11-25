import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { ReactNode } from "react";

const DOCUMENTOS = {
  terminos: { title: "Términos del servicio", file: "terminos-servicio.md", download: "/legal/v0.3/terminos-servicio.md" },
  privacidad: { title: "Política de tratamiento de datos personales", file: "politica-tratamiento.md", download: "/legal/v0.3/politica-tratamiento.md" },
  aviso: { title: "Aviso de privacidad de Dusema POS", file: "aviso-autorizacion.md", download: "/legal/v0.3/aviso-autorizacion.md" },
  anexo: { title: "Anexo de tratamiento por cuenta del negocio", file: "anexo-tratamiento.md", download: "/legal/v0.3/anexo-tratamiento.md" },
} as const;

export type LegalDocumentKey = keyof typeof DOCUMENTOS;

function renderInline(value: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    if (token.startsWith("**")) nodes.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) nodes.push(<code key={index} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em]">{token.slice(1, -1)}</code>);
    else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(token);
      nodes.push(link ? <a key={index} className="text-blue-700 underline underline-offset-2" href={link[2]}>{link[1]}</a> : token);
    }
    cursor = index + token.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function renderMarkdown(content: string): ReactNode[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!.trim();
    if (!line) { index += 1; continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Tag = heading[1]!.length === 1 ? "h1" : heading[1]!.length === 2 ? "h2" : "h3";
      blocks.push(<Tag key={index} className="mb-3 mt-8 font-bold leading-tight text-slate-900 first:mt-0">{renderInline(heading[2]!)}</Tag>);
      index += 1;
      continue;
    }
    if (/^\|/.test(line) && index + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[index + 1]!.trim())) {
      const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      const headers = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && /^\|/.test(lines[index]!.trim())) rows.push(cells(lines[index++]!));
      blocks.push(<div key={`table-${index}`} className="my-5 overflow-x-auto"><table className="min-w-full border-collapse text-left text-sm"><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex} className="border bg-slate-50 px-3 py-2 font-semibold">{renderInline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex} className="border px-3 py-2 align-top">{renderInline(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length && (ordered ? /^\d+\.\s+/.test(lines[index]!.trim()) : /^[-*]\s+/.test(lines[index]!.trim()))) {
        items.push(lines[index]!.trim().replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ""));
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={index} className={`my-4 space-y-2 pl-6 ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</List>);
      continue;
    }
    if (/^---+$/.test(line)) { blocks.push(<hr key={index} className="my-6 border-slate-200" />); index += 1; continue; }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index]!.trim()
      && !/^#{1,3}\s/.test(lines[index]!.trim())
      && !/^[-*]\s+/.test(lines[index]!.trim())
      && !/^\d+\.\s+/.test(lines[index]!.trim())
      && !/^\|/.test(lines[index]!.trim())
      && !/^---+$/.test(lines[index]!.trim())) paragraph.push(lines[index++]!.trim());
    blocks.push(<p key={index} className="my-3 leading-7">{renderInline(paragraph.join(" "))}</p>);
  }
  return blocks;
}

export function LegalDocumentPage({ documentKey }: { documentKey: LegalDocumentKey }) {
  const document = DOCUMENTOS[documentKey];
  const sourcePath = path.join(process.cwd(), "public", "legal", "v0.3", document.file);
  const content = readFileSync(sourcePath, "utf8");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Dusema POS · versión 0.3</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{document.title}</h1>
          </div>
          <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">Borrador · no exigible</span>
        </div>
        <div className="mb-6 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          Este texto está en revisión. No es una versión contractual vigente y todavía no puede aceptarse en el POS.
        </div>
        <div className="break-words font-sans text-sm leading-7 text-slate-700">{renderMarkdown(content)}</div>
        <div className="mt-8 flex flex-wrap gap-3 border-t border-slate-200 pt-6">
          <a className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" href={document.download} download>
            Descargar texto fuente
          </a>
          <Link className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold" href="/admin/login">Ir a iniciar sesión</Link>
          <Link className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold" href="/terminos">Términos</Link>
          <Link className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold" href="/privacidad">Privacidad</Link>
          <Link className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold" href="/anexo-tratamiento">Anexo</Link>
        </div>
      </article>
    </main>
  );
}
