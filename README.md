# Calorie Tracker App

Full-stack calorie tracking app.

## Tech
- Frontend: Next.js 13 App Router + TypeScript + Tailwind + shadcn/ui
- Backend: Express + Prisma + PostgreSQL + JWT

## Local Setup

### Prerequisites
- Node 18+
- PostgreSQL (or Docker)

### Backend
```bash
cd backend
# cp .env.example .env # edit DATABASE_URL and JWT_SECRET
npm i
npx prisma generate
# Start Postgres then run:
npx prisma migrate dev --name init
npm run seed
npm run dev
```
API runs at http://localhost:4000/api

### Frontend
```bash
cd frontend
npm i
# echo "NEXT_PUBLIC_API_URL=http://localhost:4000/api" > .env.local
npm run dev
```
App runs at http://localhost:3000

## Deployment

### Frontend → Vercel
- Set env `NEXT_PUBLIC_API_URL`
- GitHub secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_FRONTEND`

### Backend → Railway/Render/AWS
- Env: `DATABASE_URL`, `JWT_SECRET`, `PORT=4000`
- Railway GitHub secrets: `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID_BACKEND`

## API Endpoints
- POST `/api/auth/signup` { email, password }
- POST `/api/auth/login` { email, password }
- GET `/api/auth/me`
- GET/PUT `/api/profile`
- GET `/api/foods?q=`
- GET `/api/foods/favorites`
- POST/DELETE `/api/foods/favorites/:foodId`
- GET `/api/meals?date=YYYY-MM-DD`, POST `/api/meals/add`
- GET `/api/exercises?date=YYYY-MM-DD`, POST `/api/exercises/add`
- GET `/api/weights`, POST `/api/weights/add`

## Notes
- JWT stored in localStorage on frontend
- CORS origin defaults to http://localhost:3000

