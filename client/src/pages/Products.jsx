import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getProducts,
  createProduct,
  deleteProduct,
  updateProduct,
} from "../api/products";

import ProductForm from "../components/ProductForm";
import ProductTable from "../components/ProductTable";
import DismissibleError from "../components/DismissibleError";
import SearchBox from "../components/SearchBox";
import TableStatus from "../components/TableStatus";

import "./Products.css";

const initialPagination = {
  page: 1,
  pageSize: 100,
  totalItems: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Products({ onOpenStockHistory }) {

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState(initialPagination);
  const [totalInventoryProfit, setTotalInventoryProfit] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingProduct, setEditingProduct] = useState(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const loadProducts = useCallback(async (page, search = "") => {
    try {
      setIsLoading(true);
      setError("");

      const response = await getProducts(page, search);

      setProducts(response.data.products);
      setPagination(response.data.pagination);
      setTotalInventoryProfit(response.data.summary.totalInventoryProfit);
    } catch (error) {
      console.error("Error loading products:", error);

      setError(
        "An error occurred while loading the products."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts(currentPage, debouncedSearch);
  }, [
    currentPage,
    debouncedSearch,
    loadProducts,
  ]);

  function handleEditClick(product) {
    setEditingProduct(product);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function handlePageChange(page) {
    if (
      page < 1 ||
      page > pagination.totalPages ||
      page === currentPage ||
      isLoading
    ) {
      return;
    }

    setCurrentPage(page);
  }

  async function handleAddProduct(productData) {
    try {
      setError("");

      await createProduct(productData);

      if (currentPage === 1) {
        await loadProducts(1, debouncedSearch);
      } else {
        setCurrentPage(1);
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error("Error creating product:", error);

      return {
        success: false,
        message:
          error.response?.data?.message ||
          "An error occurred while adding the product.",
      };
    }
  }

  async function handleDeleteProduct(id) {
    const isConfirmed = window.confirm(
      "Delete this product? Products with remaining stock or that appear on invoices cannot be deleted."
    );

    if (!isConfirmed) {
      return;
    }

    try {
      setError("");

      await deleteProduct(id);

      const nextPage =
        products.length === 1 && currentPage > 1
          ? currentPage - 1
          : currentPage;

      if (nextPage === currentPage) {
        await loadProducts(
          currentPage,
          debouncedSearch
        );
      } else {
        setCurrentPage(nextPage);
      }
    } catch (error) {
      console.error("Error deleting product:", error);

      setError(
        error.response?.data?.message ||
          "An error occurred while deleting the product."
      );
    }
  }

  async function handleUpdateProduct(
    productId,
    updatedProductData
  ) {
    try {
      setError("");

      const response = await updateProduct(
        productId,
        updatedProductData
      );

      setProducts((previousProducts) =>
        previousProducts.map((product) =>
          product.id === productId
            ? response.data
            : product
        )
      );

      setEditingProduct(null);
      await loadProducts(currentPage, debouncedSearch);

      return {
        success: true,
      };
    } catch (error) {
      console.error("Failed to update product:", error);

      return {
        success: false,
        message:
          error.response?.data?.message ||
          "An error occurred while updating the product.",
      };
    }
  }

  return (
    <main className="products-page">
      <div className="products-container">
        <header className="products-header">
          <div>
            <p className="products-subtitle">
              Inventory Management
            </p>

            <h1>Products</h1>
          </div>

          <div className="products-summary">
            <div className="products-count">
              <span>Total Products</span>

              <strong>{pagination.totalItems}</strong>
            </div>

            <div className="products-count products-profit-count">
              <span>Potential Stock Profit</span>

              <strong>{isLoading ? "—" : formatMoney(totalInventoryProfit)}</strong>
              <small>Sum of (selling − purchase) × stock{debouncedSearch ? " (search results)" : ""}</small>
            </div>
          </div>
        </header>

        <DismissibleError message={error} onDismiss={() => setError("")} />

        <ProductForm
          onAddProduct={handleAddProduct}
          editingProduct={editingProduct}
          onUpdateProduct={handleUpdateProduct}
          onCancelEdit={() => setEditingProduct(null)}
        />

        <SearchBox
          onSearch={setDebouncedSearch}
          onPageReset={setCurrentPage}
          label="Search Products"
          placeholder="Search by name or barcode"
        />

        {isLoading ? (
          <TableStatus>Loading products...</TableStatus>
        ) : (
          <ProductTable
            products={products}
            pagination={pagination}
            hasSearch={Boolean(debouncedSearch)}
            onPageChange={handlePageChange}
            onDeleteProduct={handleDeleteProduct}
            onEditProduct={handleEditClick}
            onOpenStockHistory={onOpenStockHistory}
          />
        )}
      </div>
    </main>
  );
}

export default Products;
