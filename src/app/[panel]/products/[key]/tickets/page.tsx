import { TicketBoard } from "@/features/tickets/TicketBoard";

export default async function ProductTickets(props: PageProps<"/[panel]/products/[key]/tickets">) {
  const { key } = await props.params;
  return <TicketBoard productKey={key} />;
}
