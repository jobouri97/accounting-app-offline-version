import db from "../db/index.js";
import { currentUserId } from "../middleware/auth.js";

const USER_ID = currentUserId;
const BARCODE_UNIQUE_CONSTRAINTS = new Set([
  "products_barcode_key",
  "products_user_id_barcode_key",
]);

function isDuplicateBarcodeError(error) {
  return error.code === "23505" && BARCODE_UNIQUE_CONSTRAINTS.has(error.constraint);
}

//-----------------------------GET ALL PRODUCTS-----------------------------

export async function getAllProducts(req, res) {
    const page = Number(req.query.page ?? 1);
    const limit = 100;
    const search = req.query.search?.trim() || "";

    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
        message: "Page must be a positive integer",
      });
    }

    if (search.length > 100) {
      return res.status(400).json({
        message: "Search cannot exceed 100 characters",
      });
    }

    const offset = (page - 1) * limit;
    const searchPattern = `%${search}%`;

    const [productsResult, countResult] =
      await Promise.all([
        db.query(
          `SELECT
             id,
             user_id,
             name,
             purchase_price,
             selling_price,
             stock_quantity,
             barcode
           FROM products
           WHERE user_id = $1
             AND is_active = TRUE
             AND (
               name ILIKE $2
               OR COALESCE(barcode, '') ILIKE $2
             )
           ORDER BY id DESC
           LIMIT $3 OFFSET $4`,
          [
            USER_ID,
            searchPattern,
            limit,
            offset,
          ]
        ),

        db.query(
          `SELECT
             COUNT(*)::int AS total,
             COALESCE(
               SUM((selling_price - purchase_price) * stock_quantity),
               0
             ) AS total_inventory_profit
           FROM products
           WHERE user_id = $1
             AND is_active = TRUE
             AND (
               name ILIKE $2
               OR COALESCE(barcode, '') ILIKE $2
             )`,
          [USER_ID, searchPattern]
        ),
      ]);

    const totalItems = countResult.rows[0].total;
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      products: productsResult.rows,
      summary: {
        totalInventoryProfit: countResult.rows[0].total_inventory_profit,
      },
      pagination: {
        page,
        pageSize: limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
}

//-----------------------------GET ONE PRODUCT BY ID-----------------------------

export async function getProductById(req, res) {
    const productId = req.params.id;

    const result = await db.query(
      `SELECT id, name, purchase_price, selling_price, stock_quantity, barcode
       FROM products
       WHERE id = $1 AND user_id = $2 AND is_active = TRUE`,
      [productId, USER_ID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    res.status(200).json(result.rows[0]);
}

//-----------------------------CREATE NEW PRODUCT-----------------------------

export async function createProduct(req, res) {
  try {
    const {
      name,
      purchase_price,
      selling_price,
      stock_quantity = 0,
      barcode,
    } = req.body;

    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedBarcode = barcode?.trim() || null;

    if (normalizedBarcode && normalizedBarcode.length > 100) {
      return res.status(400).json({
        message: "Barcode cannot exceed 100 characters",
      });
    }

    if (!normalizedName || purchase_price === undefined || selling_price === undefined) {
      return res.status(400).json({
        message: "Product name, purchase price, and selling price are required",
      });
    }

    const numericPurchasePrice = Number(purchase_price);
    const numericSellingPrice = Number(selling_price);
    const numericStockQuantity = Number(stock_quantity);

    if (!Number.isFinite(numericPurchasePrice) || numericPurchasePrice < 0) {
      return res.status(400).json({
        message: "Purchase price must be a valid non-negative number",
      });
    }

    if (!Number.isFinite(numericSellingPrice) || numericSellingPrice < 0) {
      return res.status(400).json({
        message: "Selling price must be a valid non-negative number",
      });
    }

    if (numericSellingPrice < numericPurchasePrice) {
      return res.status(400).json({
        message: "Selling price cannot be less than purchase price",
      });
    }

    if (
      !Number.isInteger(numericStockQuantity) ||
      numericStockQuantity < 0
    ) {
      return res.status(400).json({
        message: "Stock quantity must be a non-negative integer",
      });
    }

    const existingProduct = await db.query(
      `SELECT id FROM products
       WHERE user_id = $1
         AND is_active = TRUE
         AND LOWER(name) = LOWER($2)
       LIMIT 1`,
      [USER_ID, normalizedName]
    );

    if (existingProduct.rows.length > 0) {
      return res.status(409).json({ message: "Product name already exists" });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const productResult = await client.query(
        `INSERT INTO products
            (user_id, name, purchase_price, selling_price, stock_quantity, barcode)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING
            id,
            user_id,
            name,
            purchase_price,
            selling_price,
            stock_quantity,
            barcode`,
        [
          USER_ID,
          normalizedName,
          numericPurchasePrice,
          numericSellingPrice,
          numericStockQuantity,
          normalizedBarcode,
        ]
      );

      const newProduct = productResult.rows[0];

      if (numericStockQuantity > 0) {
        await client.query(
          `INSERT INTO stock_history
              (product_id, user_id, quantity, description, created_at)
            VALUES ($1, $2, $3, $4, NOW())`,
          [
            newProduct.id,
            USER_ID,
            numericStockQuantity,
            "Initial stock",
          ]
        );
      }

      await client.query("COMMIT");

      res.status(201).json(newProduct);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (isDuplicateBarcodeError(error)) {
      return res.status(409).json({
        message: "Barcode already exists.",
      });
    }

    throw error;
  }
}



//-----------------------------UPDATE PRODUCT-----------------------------

export async function updateProduct(req, res) {
  try {
    const productId = req.params.id;
    const { name, purchase_price, selling_price, barcode } = req.body;

    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedBarcode = barcode?.trim() || null;

    if (normalizedBarcode && normalizedBarcode.length > 100) {
      return res.status(400).json({
        message: "Barcode cannot exceed 100 characters",
      });
    }

    if (!normalizedName || purchase_price === undefined || selling_price === undefined) {
      return res.status(400).json({
        message: "Name, purchase price, and selling price are required",
      });
    }

    const numericPurchasePrice = Number(purchase_price);
    const numericSellingPrice = Number(selling_price);

    if (!Number.isFinite(numericPurchasePrice) || numericPurchasePrice < 0) {
      return res.status(400).json({
        message: "Purchase price must be a valid non-negative number",
      });
    }

    if (!Number.isFinite(numericSellingPrice) || numericSellingPrice < 0) {
      return res.status(400).json({
        message: "Selling price must be a valid non-negative number",
      });
    }

    if (numericSellingPrice < numericPurchasePrice) {
      return res.status(400).json({
        message: "Selling price cannot be less than purchase price",
      });
    }

    const existingProduct = await db.query(
      `SELECT id FROM products
       WHERE user_id = $1
         AND is_active = TRUE
         AND LOWER(name) = LOWER($2)
         AND id <> $3
       LIMIT 1`,
      [USER_ID, normalizedName, productId]
    );

    if (existingProduct.rows.length > 0) {
      return res.status(409).json({ message: "Product name already exists" });
    }

    const result = await db.query(
      `UPDATE products
        SET name = $1,
            purchase_price = $2,
            selling_price = $3,
            barcode = $4
        WHERE id = $5 AND user_id = $6 AND is_active = TRUE
        RETURNING
          id,
          user_id,
          name,
          purchase_price,
          selling_price,
          stock_quantity,
          barcode`,
      [
        normalizedName,
        numericPurchasePrice,
        numericSellingPrice,
        normalizedBarcode,
        productId,
        USER_ID,
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    if (isDuplicateBarcodeError(error)) {
      return res.status(409).json({
        message: "Barcode already exists.",
      });
    }

    throw error;
  }
}

//-----------------------------DELETE PRODUCT-----------------------------

export async function deleteProduct(req, res) {
    const productId = req.params.id;
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const productResult = await client.query(
        `SELECT id, is_active, stock_quantity
         FROM products
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [productId, USER_ID]
      );

      if (productResult.rows.length === 0 || !productResult.rows[0].is_active) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Product not found" });
      }

      const invoiceItemResult = await client.query(
        `SELECT 1
         FROM invoice_items
         WHERE product_id = $1
         LIMIT 1`,
        [productId]
      );

      const stockQuantity = Number(productResult.rows[0].stock_quantity);
      const hasInvoiceHistory = invoiceItemResult.rows.length > 0;

      if (hasInvoiceHistory || stockQuantity > 0) {
        const restrictions = [];

        if (stockQuantity > 0) {
          restrictions.push(
            `it has ${stockQuantity} item${stockQuantity === 1 ? "" : "s"} in stock`
          );
        }

        if (hasInvoiceHistory) {
          restrictions.push("it appears on one or more invoices");
        }

        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Cannot delete this product because ${restrictions.join(" and ")}.`,
        });
      }

      const result = await client.query(
        `DELETE FROM products
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [productId, USER_ID]
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Product not found" });
      }

      await client.query("COMMIT");
      return res.status(200).json({
        message: "Product deleted successfully",
        productId: result.rows[0].id,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});

      if (error.code === "23503") {
        return res.status(409).json({
          message: "This product is still in use and could not be deleted.",
        });
      }

      throw error;
    } finally {
      client.release();
    }
}
