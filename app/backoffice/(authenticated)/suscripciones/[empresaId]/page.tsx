import { SubscriptionDetail } from "@/components/backoffice/subscription-detail";
export default async function Page({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  return <SubscriptionDetail empresaId={empresaId} />;
}
