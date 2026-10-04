import db from "../db/index.js";
import { currentUserId } from "../middleware/auth.js";

const USER_ID = currentUserId;

export async function getDashboard(req, res) {
    const [summaryResult, trendResult, recentInvoicesResult, lowStockResult, topProductsResult] =
      await Promise.all([
        db.query(
          `SELECT
             (SELECT COUNT(*)::int FROM products WHERE user_id = $1 AND is_active = TRUE) AS product_count,
             (SELECT COUNT(*)::int FROM products WHERE user_id = $1 AND is_active = TRUE AND stock_quantity <= 5) AS low_stock_count,
             (SELECT COALESCE(SUM(stock_quantity * purchase_price), 0) FROM products WHERE user_id = $1 AND is_active = TRUE) AS inventory_value,
             (SELECT COUNT(*)::int FROM customers WHERE user_id = $1) AS customer_count,
             (SELECT COALESCE(SUM(GREATEST(balance, 0)), 0) FROM customers WHERE user_id = $1) AS receivables,
             (SELECT COUNT(*)::int FROM invoices WHERE user_id = $1) AS invoice_count,
             (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE user_id = $1) AS total_sales,
             (SELECT COALESCE(SUM(total), 0)
                FROM invoices
               WHERE user_id = $1
                 AND created_at >= DATE_TRUNC('month', NOW())) AS month_sales,
             (SELECT COALESCE(SUM(invoice_items.quantity *
                       (invoice_items.selling_price - invoice_items.purchase_price)), 0)
                FROM invoice_items
                JOIN invoices ON invoices.id = invoice_items.invoice_id
               WHERE invoices.user_id = $1
                 AND invoices.created_at >= DATE_TRUNC('month', NOW())) AS month_profit`,
          [USER_ID]
        ),
        db.query(
          `WITH months AS (
             SELECT GENERATE_SERIES(
               DATE_TRUNC('month', NOW()) - INTERVAL '5 months',
               DATE_TRUNC('month', NOW()),
               INTERVAL '1 month'
             ) AS month
           )
           SELECT TO_CHAR(months.month, 'Mon') AS label,
                  COALESCE(SUM(invoices.total), 0) AS sales
             FROM months
             LEFT JOIN invoices
               ON invoices.user_id = $1
              AND invoices.created_at >= months.month
              AND invoices.created_at < months.month + INTERVAL '1 month'
            GROUP BY months.month
            ORDER BY months.month`,
          [USER_ID]
        ),
        db.query(
          `SELECT invoices.id,
                  invoices.total,
                  invoices.created_at,
                  COALESCE(customers.customer_name, 'Walk-in customer') AS customer_name,
                  COUNT(invoice_items.id)::int AS item_count
             FROM invoices
             LEFT JOIN customers
               ON customers.id = invoices.customer_id
              AND customers.user_id = invoices.user_id
             LEFT JOIN invoice_items ON invoice_items.invoice_id = invoices.id
            WHERE invoices.user_id = $1
            GROUP BY invoices.id, customers.customer_name
            ORDER BY invoices.created_at DESC, invoices.id DESC
            LIMIT 5`,
          [USER_ID]
        ),
        db.query(
          `SELECT id, name, stock_quantity
             FROM products
            WHERE user_id = $1 AND is_active = TRUE AND stock_quantity <= 5
            ORDER BY stock_quantity ASC, name ASC
            LIMIT 5`,
          [USER_ID]
        ),
        db.query(
          `SELECT products.id,
                  products.name,
                  SUM(invoice_items.quantity)::int AS units_sold,
                  SUM((invoice_items.selling_price - invoice_items.discount) *
                      invoice_items.quantity) AS revenue
             FROM invoice_items
             JOIN invoices
               ON invoices.id = invoice_items.invoice_id
              AND invoices.user_id = $1
             JOIN products
               ON products.id = invoice_items.product_id
              AND products.user_id = invoices.user_id
            GROUP BY products.id, products.name
            ORDER BY units_sold DESC, revenue DESC
            LIMIT 5`,
          [USER_ID]
        ),
      ]);

    res.status(200).json({
      summary: summaryResult.rows[0],
      salesTrend: trendResult.rows,
      recentInvoices: recentInvoicesResult.rows,
      lowStock: lowStockResult.rows,
      topProducts: topProductsResult.rows,
    });
}
