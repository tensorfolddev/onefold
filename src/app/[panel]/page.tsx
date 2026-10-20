"use client";

import { useMe } from "@/data/StoreProvider";
import { CompanyHome } from "@/features/home/CompanyHome";
import { MyWork } from "@/features/mywork/MyWork";
import { ManagerHome } from "@/features/home/ManagerHome";

/** Each panel's landing page: Admin → company, Manager → their products, Developer → My Work. */
export default function PanelHome() {
  const { panel } = useMe();
  if (panel === "developer") return <MyWork />;
  if (panel === "manager") return <ManagerHome />;
  return <CompanyHome />;
}
