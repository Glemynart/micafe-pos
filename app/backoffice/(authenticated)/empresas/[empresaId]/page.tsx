import { CompanyDetail } from "@/components/backoffice/company-detail";
export default async function Page({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  return <CompanyDetail empresaId={empresaId} />;
}

