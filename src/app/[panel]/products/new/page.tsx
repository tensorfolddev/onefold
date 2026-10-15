import { redirect } from "next/navigation";

/** Old link: "New product" is now a popup on the Products page. */
export default async function NewProductPage(props: PageProps<"/[panel]/products/new">) {
  const { panel } = await props.params;
  redirect(`/${panel}/products?new=1`);
}
