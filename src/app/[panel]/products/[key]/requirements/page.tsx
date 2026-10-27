import { Suspense } from "react";
import { TeamRoom } from "@/features/room/team/TeamRoom";

export default async function ProductRequirements(props: PageProps<"/[panel]/products/[key]/requirements">) {
  const { key } = await props.params;
  // The open chat is in ?t=… (useSearchParams needs a Suspense boundary).
  return <Suspense fallback={<div className="app-loading" aria-busy="true" />}><TeamRoom productKey={key} /></Suspense>;
}
