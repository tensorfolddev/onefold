import { DecisionsList } from "./DecisionsList";
import { ProductsTable } from "./ProductsTable";
import { Widget } from "./Widget";

/** Products (2/3) + Needs a decision (1/3). Approvals go through the store, so both update together. */
export function ProductsAndDecisions() {
  return (
    <>
      <Widget title="Products" className="span-2">
        <ProductsTable />
      </Widget>
      <Widget title="Needs a decision">
        <DecisionsList />
      </Widget>
    </>
  );
}
