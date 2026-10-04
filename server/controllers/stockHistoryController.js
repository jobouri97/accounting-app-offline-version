import db from "../db/index.js";
import { currentUserId } from "../middleware/auth.js";

const USER_ID = currentUserId;
const PAGE_SIZE = 100;

// GET /api/stock-history
export async function getStockHistory(req, res) {
        const page = Number(req.query.page ?? 1);
        const productId = req.query.product_id
            ? Number(req.query.product_id)
            : null;

        if (!Number.isInteger(page) || page < 1) {
            return res.status(400).json({
                message: "Page must be a positive integer",
            });
        }

        if (
            productId !== null &&
            (!Number.isInteger(productId) || productId < 1)
        ) {
            return res.status(400).json({
                message: "Product ID must be a positive integer",
            });
        }

        const offset = (page - 1) * PAGE_SIZE;

        const values = [USER_ID];
        let productCondition = "";

        if (productId !== null) {
            values.push(productId);
            productCondition = "AND stock_history.product_id = $2";
        }

        const limitPosition = values.length + 1;
        const offsetPosition = values.length + 2;

        const [historyResult, countResult] = await Promise.all([
            db.query(
                `SELECT
           stock_history.id,
           stock_history.product_id,
           stock_history.user_id,
           stock_history.quantity,
           stock_history.description,
           stock_history.created_at,
           products.name AS product_name
         FROM stock_history
         INNER JOIN products
           ON products.id = stock_history.product_id
          AND products.user_id = stock_history.user_id
         WHERE stock_history.user_id = $1
           ${productCondition}
         ORDER BY stock_history.created_at DESC,
                  stock_history.id DESC
         LIMIT $${limitPosition}
         OFFSET $${offsetPosition}`,
                [...values, PAGE_SIZE, offset]
            ),

            db.query(
                `SELECT COUNT(*)::int AS total
         FROM stock_history
         WHERE user_id = $1
           ${productId !== null ? "AND product_id = $2" : ""}`,
                values
            ),
        ]);

        const totalItems = countResult.rows[0].total;
        const totalPages = Math.ceil(totalItems / PAGE_SIZE);

        res.status(200).json({
            stockHistory: historyResult.rows,
            pagination: {
                page,
                pageSize: PAGE_SIZE,
                totalItems,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        });
}

// GET /api/stock-history/:id
export async function getStockHistoryById(req, res) {
        const historyId = Number(req.params.id);

        if (!Number.isInteger(historyId) || historyId < 1) {
            return res.status(400).json({
                message: "History ID must be a positive integer",
            });
        }

        const result = await db.query(
            `SELECT
         stock_history.id,
         stock_history.product_id,
         stock_history.user_id,
         stock_history.quantity,
         stock_history.description,
         stock_history.created_at,
         products.name AS product_name
       FROM stock_history
       INNER JOIN products
         ON products.id = stock_history.product_id
        AND products.user_id = stock_history.user_id
       WHERE stock_history.id = $1
         AND stock_history.user_id = $2`,
            [historyId, USER_ID]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Stock history record not found",
            });
        }

        res.status(200).json(result.rows[0]);
}

// POST /api/stock-history
export async function createStockHistory(req, res) {
    const client = await db.connect();

    try {
        const { product_id, quantity, description } = req.body;

        const productId = Number(product_id);
        const quantityAdjustment = Number(quantity);
        if (
            description !== undefined &&
            description !== null &&
            typeof description !== "string"
        ) {
            return res.status(400).json({
                message: "Description must be text",
            });
        }

        const normalizedDescription = description?.trim() || null;
        if (!Number.isInteger(productId) || productId < 1) {
            return res.status(400).json({
                message: "Product ID must be a positive integer",
            });
        }

        if (
            !Number.isInteger(quantityAdjustment) ||
            quantityAdjustment === 0
        ) {
            return res.status(400).json({
                message: "Quantity must be a non-zero integer",
            });
        }

        if (
            normalizedDescription &&
            normalizedDescription.length > 500
        ) {
            return res.status(400).json({
                message: "Description cannot exceed 500 characters",
            });
        }

        await client.query("BEGIN");

        const productResult = await client.query(
            `SELECT id, stock_quantity
       FROM products
       WHERE id = $1 AND user_id = $2 AND is_active = TRUE
       FOR UPDATE`,
            [productId, USER_ID]
        );

        if (productResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Product not found",
            });
        }

        const currentStock = Number(
            productResult.rows[0].stock_quantity
        );
        const newStockQuantity = currentStock + quantityAdjustment;

        if (newStockQuantity < 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Stock quantity cannot become negative",
            });
        }

        await client.query(
            `UPDATE products
       SET stock_quantity = $1
       WHERE id = $2 AND user_id = $3`,
            [newStockQuantity, productId, USER_ID]
        );

        const historyResult = await client.query(
            `INSERT INTO stock_history
         (product_id, user_id, quantity, description, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING
         id,
         product_id,
         user_id,
         quantity,
         description,
         created_at`,
            [
                productId,
                USER_ID,
                quantityAdjustment,
                normalizedDescription,
            ]
        );

        await client.query("COMMIT");

        res.status(201).json({
            stockHistory: historyResult.rows[0],
            newStockQuantity,
        });
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// PUT /api/stock-history/:id
export async function updateStockHistory(req, res) {
    const client = await db.connect();

    try {
        const historyId = Number(req.params.id);
        const { quantity, description } = req.body;

        const newQuantity = Number(quantity);
        if (
            description !== undefined &&
            description !== null &&
            typeof description !== "string"
        ) {
            return res.status(400).json({
                message: "Description must be text",
            });
        }

        const normalizedDescription = description?.trim() || null;
        if (!Number.isInteger(historyId) || historyId < 1) {
            return res.status(400).json({
                message: "History ID must be a positive integer",
            });
        }

        if (!Number.isInteger(newQuantity) || newQuantity === 0) {
            return res.status(400).json({
                message: "Quantity must be a non-zero integer",
            });
        }

        if (
            normalizedDescription &&
            normalizedDescription.length > 500
        ) {
            return res.status(400).json({
                message: "Description cannot exceed 500 characters",
            });
        }

        await client.query("BEGIN");

        const historyResult = await client.query(
            `SELECT id, product_id, quantity
       FROM stock_history
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
            [historyId, USER_ID]
        );

        if (historyResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Stock history record not found",
            });
        }

        const historyRecord = historyResult.rows[0];
        const oldQuantity = Number(historyRecord.quantity);
        const quantityDifference = newQuantity - oldQuantity;

        const productResult = await client.query(
            `SELECT id, stock_quantity
       FROM products
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
            [historyRecord.product_id, USER_ID]
        );

        if (productResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Product not found",
            });
        }

        const currentStock = Number(
            productResult.rows[0].stock_quantity
        );
        const newStockQuantity = currentStock + quantityDifference;

        if (newStockQuantity < 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Stock quantity cannot become negative",
            });
        }

        await client.query(
            `UPDATE products
       SET stock_quantity = $1
       WHERE id = $2 AND user_id = $3`,
            [newStockQuantity, historyRecord.product_id, USER_ID]
        );

        const updatedHistoryResult = await client.query(
            `UPDATE stock_history
       SET quantity = $1,
           description = $2
       WHERE id = $3 AND user_id = $4
       RETURNING
         id,
         product_id,
         user_id,
         quantity,
         description,
         created_at`,
            [
                newQuantity,
                normalizedDescription,
                historyId,
                USER_ID,
            ]
        );

        await client.query("COMMIT");

        res.status(200).json({
            stockHistory: updatedHistoryResult.rows[0],
            newStockQuantity,
        });
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// DELETE /api/stock-history/:id
export async function deleteStockHistory(req, res) {
    const client = await db.connect();

    try {
        const historyId = Number(req.params.id);

        if (!Number.isInteger(historyId) || historyId < 1) {
            return res.status(400).json({
                message: "History ID must be a positive integer",
            });
        }

        await client.query("BEGIN");

        const historyResult = await client.query(
            `SELECT id, product_id, quantity
       FROM stock_history
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
            [historyId, USER_ID]
        );

        if (historyResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Stock history record not found",
            });
        }

        const historyRecord = historyResult.rows[0];

        const productResult = await client.query(
            `SELECT id, stock_quantity
       FROM products
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
            [historyRecord.product_id, USER_ID]
        );

        if (productResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Product not found",
            });
        }

        const currentStock = Number(
            productResult.rows[0].stock_quantity
        );

        // Reverse the original adjustment.
        const newStockQuantity =
            currentStock - Number(historyRecord.quantity);

        if (newStockQuantity < 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Deleting this record would make stock negative",
            });
        }

        await client.query(
            `UPDATE products
       SET stock_quantity = $1
       WHERE id = $2 AND user_id = $3`,
            [newStockQuantity, historyRecord.product_id, USER_ID]
        );

        await client.query(
            `DELETE FROM stock_history
       WHERE id = $1 AND user_id = $2`,
            [historyId, USER_ID]
        );

        await client.query("COMMIT");

        res.status(200).json({
            message: "Stock history record deleted successfully",
            historyId,
            newStockQuantity,
        });
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
