import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const ssl = process.env.DB_SSL === "true"
  ? { rejectUnauthorized: false }
  : false;

const db = new Pool(process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl,
    }
  : {
      user: process.env.DB_USER || "postgres",
      host: process.env.DB_HOST || "127.0.0.1",
      database: process.env.DB_NAME || "accounting_app",
      password: process.env.DB_PASSWORD || undefined,
      port: Number(process.env.DB_PORT || 5432),
      ssl,
    });

export default db;
