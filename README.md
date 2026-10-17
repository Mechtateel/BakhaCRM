# BakhaCRM

BakhaCRM is a customer relationship management (CRM) application developed as a web-based project. It includes a React frontend and a Node.js backend.

## Technology Stack

**Frontend**
- React
- TypeScript
- Vite
- React Router

**Backend**
- Node.js
- Express
- TypeScript
- Drizzle ORM
- libSQL client

## Project Structure

The repository is organized as a workspace containing:
- `frontend/apps/web` — web application
- `backend/server` — API server
- Database migration and seed scripts

## Development

Requirements: Node.js and npm.

Install dependencies from the repository root:

```bash
npm install
```

Run database migrations and seed scripts according to the project's local environment configuration:

```bash
npm run db:migrate
npm run db:seed
```

Start the frontend and backend in development mode:

```bash
npm run dev
```

Build the workspaces:

```bash
npm run build
```

## Notes

Configure environment variables locally before running the application. Do not commit `.env` files, API tokens, passwords, or production credentials.

## Author

GitHub: [@Mechtateel](https://github.com/Mechtateel)
