import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { panelFromSlug } from "@/data/session";
import { PeopleTable } from "@/features/people/PeopleTable";

export const metadata: Metadata = { title: "People · 1Fold" };

export default async function PeoplePage(props: PageProps<"/[panel]/people">) {
  const { panel } = await props.params;
  if (panelFromSlug(panel) !== "admin") notFound();
  return <PeopleTable />;
}
