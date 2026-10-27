import { ProductSpace } from "@/features/products/ProductHeader";

/** Any project: built on its first visit, then served static — so its tabs prefetch in full and open at once. */
export const generateStaticParams = () => [];

export default async function ProductLayout(props: LayoutProps<"/[panel]/products/[key]">) {
  const { key } = await props.params;
  return <ProductSpace productKey={key}>{props.children}</ProductSpace>;
}
