# Project-Guille-Jorge: AI Agent Builder Platform

A full-stack web application for creating AI agents, featuring user authentication and VAPI AI integration.

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + React Router
- **Backend**: Node.js + Express + JWT Authentication
- **Database**: PostgreSQL + Prisma ORM
- **AI Integration**: VAPI AI SDK

## Project Structure

```
Project-Guille-Jorge/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── context/        # Auth context
│   │   └── services/       # API services
│   └── package.json
│
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/     # Auth middleware
│   │   ├── routes/         # API routes
│   │   └── services/       # VAPI service
│   ├── prisma/             # Database schema
│   └── package.json
│
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- VAPI AI API key (optional)

### 1. Clone and Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Configure Environment Variables

**Server** (`server/.env`):
```env
DATABASE_URL="postgresql://user:password@localhost:5432/agent_builder?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"
VAPI_API_KEY="your-vapi-api-key"  # Optional
PORT=5000
```

**Client** (`client/.env`):
```env
VITE_API_URL=/api
```

### 3. Set Up Database

```bash
cd server

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio to view data
npm run prisma:studio
```

### 4. Start Development Servers

```bash
# Terminal 1 - Start backend
cd server
npm run dev

# Terminal 2 - Start frontend
cd client
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | /api/auth/register | Register new user | No |
| POST | /api/auth/login | Login user | No |
| GET | /api/auth/me | Get current user | Yes |
| GET | /api/agents | List user's agents | Yes |
| GET | /api/agents/:id | Get single agent | Yes |
| POST | /api/agents | Create new agent | Yes |
| PUT | /api/agents/:id | Update agent | Yes |
| DELETE | /api/agents/:id | Delete agent | Yes |

## VAPI AI Integration

The platform integrates with VAPI AI to create voice-enabled AI agents. To enable VAPI features:

1. Sign up at [VAPI.ai](https://vapi.ai)
2. Get your API key
3. Add it to `server/.env` as `VAPI_API_KEY`

Without a VAPI API key, agents will be created locally without voice capabilities.

## Features

- User authentication (register/login)
- JWT-based session management
- Create and manage AI agents
- VAPI AI integration for voice agents
- Responsive dashboard UI

## Development

### Running Tests

```bash
# Server tests
cd server && npm test

# Client tests
cd client && npm test
```

### Database Management

```bash
# View database in browser
npm run prisma:studio

# Create a new migration
npm run prisma:migrate
```
