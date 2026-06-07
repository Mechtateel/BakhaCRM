# Bakha CRM

MVP CRM for Bakha Potolok: React + Vite + TypeScript frontend, Node.js + Express API, SQLite with Drizzle schema and local migrations.

## Commands

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
npm run build
```

Demo login:

- Email: `admin@bakha.kz`
- Password: `admin123`

Default URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:4000`

## WAPPI / WhatsApp env

By default real sending is blocked.

```bash
WAPPI_ENABLED=false
WAPPI_DRY_RUN=true
WAPPI_API_BASE_URL=
WAPPI_TOKEN=
WAPPI_PROFILE_ID=
WAPPI_WEBHOOK_SECRET=
```
