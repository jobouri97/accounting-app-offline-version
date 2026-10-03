# Accounting App

React, Express, and PostgreSQL accounting application. The local setup runs the frontend and API on your computer and stores data in a PostgreSQL server on your computer.

## Run with local PostgreSQL

You need Node.js with npm and a PostgreSQL server installed and running.

1. Create a database named `accounting_app`. Connect to your local PostgreSQL server as an administrator with `psql`:

   ```powershell
   psql -h 127.0.0.1 -U postgres -d postgres
   ```

   Then run:

   ```sql
   CREATE DATABASE accounting_app;
   ```

   You can also create it in pgAdmin: right-click **Databases**, choose **Create > Database**, and enter `accounting_app`.

2. Copy the example environment files:

   ```powershell
   Copy-Item server/.env.example server/.env
   Copy-Item client/.env.example client/.env
   ```

3. In `server/.env`, set `DB_USER` and `DB_PASSWORD` to a PostgreSQL account that can create tables in `accounting_app`. The example assumes PostgreSQL is listening at `127.0.0.1:5432`; update `DB_HOST` or `DB_PORT` if yours differs. Keep `DB_SSL=false` for a local server. If `DATABASE_URL` is set in this file, remove it for local use because it takes precedence over the `DB_*` settings. The PostgreSQL 18 server in this workspace is configured for port `5433`, so its local `.env` uses that port.

   Set `SESSION_SECRET` to a long random value. Leave `GOOGLE_CLIENT_ID` empty to use the app's local email-and-password sign-in.

4. Install the app dependencies:

   ```powershell
   npm install --prefix server
   npm install --prefix client
   ```

5. Open two terminals in the project folder and start the API and frontend:

   ```powershell
   npm run dev --prefix server
   ```

   ```powershell
   npm run dev --prefix client
   ```

6. Open `http://localhost:5173`. The API uses `http://localhost:3000`, and the server automatically applies database migrations on startup.

The PostgreSQL server must be running whenever you use the app. Your records and login sessions are stored in its local `accounting_app` database and remain there when the app is closed. The app does not need a hosted database. Google sign-in is optional and requires internet access; local email-and-password sign-in does not.

## Environment settings

`server/.env.example` contains local PostgreSQL settings. You can use either those `DB_*` fields or provide a PostgreSQL `DATABASE_URL`; `DATABASE_URL` takes precedence when both are set. Never put database credentials in `client/.env`.

`client/.env.example` points the browser app to the local API. `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` can stay blank when using email and password.

## Health check

With the API running, open `http://localhost:3000/api/health`. A healthy server responds with `{"status":"ok"}`.
