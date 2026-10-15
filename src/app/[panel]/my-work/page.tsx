import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MyWork } from "@/features/mywork/MyWork";

export const metadata: Metadata = { title: "My Work · 1Fold" };

export default async function MyWorkPage(props: PageProps<"/[panel]/my-work">) {
  const { panel } = await props.params;
  if (panel === "admin") notFound(); // developers land on My Work at /dev; admins have no own tickets
  return <MyWork />;
}
