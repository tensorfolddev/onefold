import { DecisionLog } from "@/features/products/DecisionLog";

export default async function ProductDecisions(props: PageProps<"/[panel]/products/[key]/decisions">) {
  const { key } = await props.params;
  return <DecisionLog productKey={key} />;
}
