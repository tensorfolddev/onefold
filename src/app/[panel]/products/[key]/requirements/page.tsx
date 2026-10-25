import { RequirementsView } from "@/features/requirements/RequirementsView";

export default async function ProductRequirements(props: PageProps<"/[panel]/products/[key]/requirements">) {
  const { key } = await props.params;
  return <RequirementsView productKey={key} />;
}
