# ProductionOperationsManagement

## Purpose

A web application for PC (Production Control) plan creation, distribution, and tooling request management — enabling PC to distribute production plans to all departments (Engineer, QC, PH, ISO, Cost) and allowing production operators to request and return cutting/setup tools through purchase.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 18 + Tailwind CSS |
| Backend | Node.js + Express |
| Database | Microsoft SQL Server 2019 |
| Auth | JWT |

---

## Roles

| Role | Access |
|------|--------|
| PC | Create and manage production plans |
| Production | Request and return tools |
| Purchase | Approve requests, manage disbursement, view analysis |
| Engineer / QC / Gauge / Cost | View plan list and request history (read-only) |
| Admin | Full access, user management |

---

## Quick Start

### Prerequisites
- Node.js v18+
- Angular CLI v18

### Install
```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && npm install
```

### Configure
```bash
copy .env.example .env
# Fill in DB credentials and JWT secret
```

### Run
```bash
npm start
```

- Frontend: http://localhost:4200
- Backend: http://localhost:3000

---

## Project Structure

```
ProductionOperationsManagement/
├── frontend/          # Angular 18 SPA
│   └── src/app/pages/ # PC, user (request/return), purchase
├── backend/           # Express API
│   └── src/
│       ├── controllers/  # PCPlan, PurchaseRequest, Return, Analyze...
│       └── routes/
├── docs/
│   ├── Full_Dev_Manual.md
│   └── sql/           # Database schema and stored procedures
├── .env.example
└── README.md
```
