# Docker Setup Instructions

This project has been dockerized to run the Backend, Frontend, and MongoDB services together.

## Prerequisites

- Docker and Docker Compose installed.
- Stop any local instances of the backend (port 4000) or frontend (port 3000).

## Setup

1. **Environment Variables**:
   **Option A: Copy existing backend .env (Recommended)**
   If you already have a working `backend/.env`, simply copy it to the root:
   ```bash
   cp backend/.env .env
   ```

   **Option B: Create manually**
   Create a `.env` file in the root directory (`/home/khoa123/mail-project/.env`) with the following content:

   ```env
   # Google OAuth
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:3000

   # Security
   ACCESS_TOKEN_SECRET=your_access_token_secret
   REFRESH_TOKEN_SECRET=your_refresh_token_secret

   # AI Service
   GEMINI_API_KEY=your_gemini_api_key
   ```

   > Note: `MONGODB_URI`, `PORT`, `FE_URL`, and `NEXT_PUBLIC_API_URL` are automatically configured in `docker-compose.yml`, but you can override them here if needed.

2. **Run the Application**:

   ```bash
   docker-compose up --build
   ```

   - Backend will be available at: http://localhost:4000
   - Frontend will be available at: http://localhost:3000
   - MongoDB is running on: localhost:27018 (internally 27017)

3. **Seeding Data (Optional)**:
   If you need to seed the database with initial data:
   
   ```bash
   # Enter the backend container
   docker-compose exec backend npm run seed
   ```

## Troubleshooting

- If the frontend fails to connect to the backend, ensure `NEXT_PUBLIC_API_URL` matches the backend URL reachable from the browser.
- If MongoDB fails to start, check if port 27017 is already in use on your host machine.
