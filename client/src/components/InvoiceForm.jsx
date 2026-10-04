import { useMemo, useState } from "react";

import FormError from "./FormError";
import BarcodeSection from "./invoice/BarcodeSection";
import CustomerSection from "./invoice/CustomerSection";
import InvoiceItemRow from "./invoice/InvoiceItemRow";
import {
  calculateLineTotal,
  createEmptyItem,
  filterCustomers,
  getInitialItems,
} from "./invoice/invoiceFormUtils";

function InvoiceForm({
  customers,
  products,
  editingInvoice,
  onSave,
  onCancelEdit,
}) {
  const [customerType, setCustomerType] = useState(
    editingInvoice?.invoice.customer_id ? "specified" : "passer"
  );
  const [customerId, setCustomerId] = useState(
    editingInvoice?.invoice.customer_id ?? ""
  );
  const [customerSearch, setCustomerSearch] = useState(() => {
    const selectedCustomer = customers.find(
      (customer) => customer.id === Number(editingInvoice?.invoice.customer_id)
    );

    return selectedCustomer?.customer_name ?? "";
  });
  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);
  const [items, setItems] = useState(() => getInitialItems(editingInvoice, products));
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openProductItemKey, setOpenProductItemKey] = useState(null);
  const [barcodeValue, setBarcodeValue] = useState("");

  const productsById = useMemo(() => {
    const productsMap = new Map(
      products.map((product) => [Number(product.id), product])
    );

    for (const item of editingInvoice?.items ?? []) {
      const productId = Number(item.product_id);
      if (productsMap.has(productId)) continue;

      productsMap.set(productId, {
        id: productId,
        name: item.product_name,
        purchase_price: item.purchase_price,
        selling_price: item.selling_price,
        stock_quantity: 0,
        is_active: false,
      });
    }

    return productsMap;
  }, [products, editingInvoice]);

  const selectedCustomer = customers.find(
    (customer) => customer.id === Number(customerId)
  );
  const matchingCustomers = filterCustomers(
    customers,
    selectedCustomer,
    customerSearch
  );

  const invoiceTotal = items.reduce((total, item) => {
    const product = productsById.get(Number(item.product_id));
    return total + calculateLineTotal(item, product);
  }, 0);

  function updateItem(itemKey, field, value) {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.key !== itemKey) {
          return item;
        }

        return { ...item, [field]: value };
      })
    );
  }

  function addItem() {
    setItems((currentItems) => [createEmptyItem(), ...currentItems]);
  }

  function removeItem(itemKey) {
    setItems((currentItems) => {
      if (currentItems.length === 1) {
        return currentItems;
      }

      return currentItems.filter((item) => item.key !== itemKey);
    });
  }

  function handleCustomerSearch(event) {
    setCustomerSearch(event.target.value);
    setCustomerId("");
    setIsCustomerListOpen(true);
  }

  function handleCustomerSelect(customer) {
    setCustomerId(customer.id);
    setCustomerSearch(customer.customer_name);
    setIsCustomerListOpen(false);
  }

  function handleProductSearch(itemKey, value) {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.key !== itemKey) {
          return item;
        }

        return {
          ...item,
          product_id: "",
          product_search: value,
        };
      })
    );

    setOpenProductItemKey(itemKey);
  }

  function handleProductSelect(itemKey, product) {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.key !== itemKey) {
          return item;
        }

        return {
          ...item,
          product_id: product.id,
          product_search: product.name,
        };
      })
    );

    setOpenProductItemKey(null);
  }

  function addScannedProduct(product) {
    setItems((currentItems) => {
      const existingItem = currentItems.find(
        (item) => Number(item.product_id) === product.id
      );

      if (existingItem) {
        const updatedItem = {
          ...existingItem,
          quantity: Number(existingItem.quantity) + 1,
        };
        const otherItems = currentItems.filter(
          (item) => item.key !== existingItem.key
        );

        return [updatedItem, ...otherItems];
      }

      const emptyItem = currentItems.find(
        (item) => !item.product_id && !item.product_search.trim()
      );

      if (emptyItem) {
        const scannedItem = {
          ...emptyItem,
          product_id: product.id,
          product_search: product.name,
          quantity: 1,
          discount: 0,
        };
        const otherItems = currentItems.filter(
          (item) => item.key !== emptyItem.key
        );

        return [scannedItem, ...otherItems];
      }

      const scannedItem = {
        ...createEmptyItem(),
        product_id: product.id,
        product_search: product.name,
      };

      return [scannedItem, ...currentItems];
    });

    setBarcodeValue("");
    setFormError("");
  }

  function findProductByBarcode(barcode) {
    const normalizedBarcode = barcode.trim().toLowerCase();

    if (!normalizedBarcode) {
      return null;
    }

    return products.find((product) => {
      const productBarcode = (product.barcode || "").trim().toLowerCase();
      return productBarcode === normalizedBarcode;
    }) || null;
  }

  function handleBarcodeChange(event) {
    setBarcodeValue(event.target.value);
  }

  function handleBarcodeKeyDown(event) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const product = findProductByBarcode(barcodeValue);

    if (product) {
      addScannedProduct(product);
      return;
    }

    if (barcodeValue.trim()) {
      setFormError(`No product found with barcode ${barcodeValue.trim()}.`);
    }
  }

  function validateCustomer() {
    if (customerType === "passer") {
      return { customerId: null };
    }

    const numericCustomerId = Number(customerId);

    if (!Number.isInteger(numericCustomerId) || numericCustomerId < 1) {
      return { error: "Please select a customer." };
    }

    return { customerId: numericCustomerId };
  }

  function validateItems() {
    const selectedProductIds = new Set();
    const normalizedItems = [];

    for (const [index, item] of items.entries()) {
      const lineNumber = index + 1;
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      const discount = Number(item.discount);
      const product = productsById.get(productId);

      if (!product) {
        return { error: `Please select a product for line ${lineNumber}.` };
      }

      if (selectedProductIds.has(productId)) {
        return { error: `${product.name} appears more than once.` };
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        return { error: `Quantity on line ${lineNumber} must be at least 1.` };
      }

      if (!Number.isFinite(discount) || discount < 0) {
        return { error: `Discount on line ${lineNumber} must be zero or greater.` };
      }

      const sellingPrice = Number(product.selling_price);
      const purchasePrice = Number(product.purchase_price);
      const profit = sellingPrice - purchasePrice;

      if (discount >= profit) {
        return {
          error: `Discount for ${product.name} must be less than ${profit.toFixed(2)}.`,
        };
      }

      selectedProductIds.add(productId);
      normalizedItems.push({
        product_id: productId,
        quantity,
        discount: discount.toFixed(2),
      });
    }

    return { items: normalizedItems };
  }

  function clearNewInvoiceForm() {
    setCustomerType("passer");
    setCustomerId("");
    setCustomerSearch("");
    setBarcodeValue("");
    setItems([createEmptyItem()]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    const customerResult = validateCustomer();

    if (customerResult.error) {
      setFormError(customerResult.error);
      return;
    }

    const itemsResult = validateItems();

    if (itemsResult.error) {
      setFormError(itemsResult.error);
      return;
    }

    try {
      setIsSubmitting(true);

      const result = await onSave({
        customer_type: customerType,
        customer_id: customerResult.customerId,
        items: itemsResult.items,
      });

      if (!result.success) {
        setFormError(result.message);
        return;
      }

      if (!editingInvoice) {
        clearNewInvoiceForm();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="invoice-form-card">
      <div className="invoice-form-heading">
        <div>
          <p>{editingInvoice ? `Invoice #${editingInvoice.invoice.id}` : "Sales Entry"}</p>
          <h2>{editingInvoice ? "Edit Invoice" : "New Invoice"}</h2>
        </div>

        <div className="invoice-form-total">
          <span>Invoice Total</span>
          <strong>{Math.max(0, invoiceTotal).toFixed(2)}</strong>
        </div>
      </div>

      <FormError message={formError} onDismiss={() => setFormError("")} />

      <form onSubmit={handleSubmit}>
        <CustomerSection
          customerType={customerType}
          customerId={customerId}
          customerSearch={customerSearch}
          filteredCustomers={matchingCustomers}
          isCustomerListOpen={isCustomerListOpen}
          onCustomerTypeChange={setCustomerType}
          onCustomerSearch={handleCustomerSearch}
          onCustomerSelect={handleCustomerSelect}
          onCustomerListOpen={() => setIsCustomerListOpen(true)}
          onCustomerListClose={() =>
            window.setTimeout(() => setIsCustomerListOpen(false), 150)
          }
        />

        <div className="invoice-lines-heading">
          <div>
            <h3>Invoice Items</h3>
            <span>Add products, quantities, and per-unit discounts.</span>
          </div>
        </div>

        <BarcodeSection
          barcodeValue={barcodeValue}
          onBarcodeChange={handleBarcodeChange}
          onBarcodeKeyDown={handleBarcodeKeyDown}
          onAddItem={addItem}
        />

        <div className="invoice-lines">
          {items.map((item, index) => (
            <InvoiceItemRow
              key={item.key}
              item={item}
              lineNumber={index + 1}
              items={items}
              products={products}
              product={productsById.get(Number(item.product_id))}
              isProductListOpen={openProductItemKey === item.key}
              onUpdateItem={updateItem}
              onProductSearch={handleProductSearch}
              onProductSelect={handleProductSelect}
              onProductListOpen={() => setOpenProductItemKey(item.key)}
              onProductListClose={() =>
                window.setTimeout(() => setOpenProductItemKey(null), 150)
              }
              onRemoveItem={removeItem}
            />
          ))}
        </div>

        <div className="invoice-form-actions">
          {editingInvoice && (
            <button type="button" className="cancel-invoice-button" onClick={onCancelEdit}>
              Cancel
            </button>
          )}

          <button type="submit" className="save-invoice-button" disabled={isSubmitting}>
            {isSubmitting
              ? editingInvoice ? "Updating..." : "Creating..."
              : editingInvoice ? "Update Invoice" : "Create Invoice"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default InvoiceForm;
