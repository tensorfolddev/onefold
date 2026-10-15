import { MembersList } from "@/features/products/MembersList";

export default async function ProductMembers(props: PageProps<"/[panel]/products/[key]/members">) {
  const { key } = await props.params;
  return <MembersList productKey={key} />;
}
