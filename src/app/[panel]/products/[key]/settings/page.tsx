import { ProductSettings } from "@/features/products/ProductSettings";

export default async function ProductSettingsPage(props: PageProps<"/[panel]/products/[key]/settings">) {
  const { key } = await props.params;
  return <ProductSettings productKey={key} />;
}
