import { ProductSpace } from "@/features/products/ProductHeader";

export default async function ProductLayout(props: LayoutProps<"/[panel]/products/[key]">) {
  const { key } = await props.params;
  return <ProductSpace productKey={key}>{props.children}</ProductSpace>;
}
