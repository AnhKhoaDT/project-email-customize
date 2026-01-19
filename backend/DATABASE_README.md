# 🗄️ Database Folder

This folder contains database-related files for the Mail Project.

## 📁 Structure

```
backend/
├── src/
│   ├── migrations/           # Database migration scripts
│   │   └── kanban-column-id-migration.ts
│   ├── seed/                 # Seed data scripts
│   │   └── seed.ts
│   └── */schemas/            # Mongoose schemas (distributed by module)
│       ├── users/schemas/user.schema.ts
│       ├── mail/schemas/
│       │   ├── email-metadata.schema.ts
│       │   ├── kanban-config.schema.ts
│       │   ├── gmail-sync-state.schema.ts
│       │   └── search-suggestion-cache.schema.ts
│       └── sessions/sessions.schema.ts
└── backups/                  # Database backups (gitignored)
```

## 📚 Documentation

- **[DATABASE_DOCUMENTATION.md](../DATABASE_DOCUMENTATION.md)** - Complete database schema documentation
- **[DATABASE_MIGRATION_GUIDE.md](../DATABASE_MIGRATION_GUIDE.md)** - Migration and seed instructions

## 🚀 Quick Start

### 1. Setup Database
```bash
# Make sure MongoDB is running
sudo systemctl start mongod

# Verify connection
mongosh mongodb://localhost:27017/mail-your
```

### 2. Run Seed (First Time Setup)
```bash
cd backend
npm run seed
```

### 3. Run Migrations (When Needed)
```bash
cd backend
npm run migrate
```

## 📊 Collections

| Collection | Purpose | Documents (after seed) |
|------------|---------|------------------------|
| `users` | User accounts | 3 |
| `emailmetadatas` | Email metadata & Kanban state | 45 |
| `kanbanconfigs` | Kanban board configurations | 3 |
| `gmailsyncstates` | Gmail sync tracking | 0-3 |
| `searchsuggestioncaches` | Search optimization cache | Dynamic |
| `sessions` | User sessions | Dynamic |

## 🔧 Available Scripts

```bash
# Seed database with sample data
npm run seed

# Run database migrations
npm run migrate

# Backup database
mongodump --uri="mongodb://localhost:27017/mail-your" --out=./backups/backup_$(date +%Y%m%d)

# Restore database
mongorestore --uri="mongodb://localhost:27017/mail-your" --drop ./backups/backup_20260119
```

## 📝 Sample Data

After running `npm run seed`, you can login with:

| Email | Password | Role |
|-------|----------|------|
| demo@example.com | Demo123! | User |
| alice@example.com | Alice123! | User |
| bob@example.com | Bob123! | User |

Each user has:
- 15 sample emails
- 1 Kanban configuration with 4 columns (Inbox, To Do, In Progress, Done)

## 🔍 Useful MongoDB Commands

```bash
# Connect to database
mongosh mongodb://localhost:27017/mail-your

# Count documents in each collection
db.users.countDocuments()
db.emailmetadatas.countDocuments()
db.kanbanconfigs.countDocuments()

# View a sample document
db.emailmetadatas.findOne()

# Check indexes
db.emailmetadatas.getIndexes()

# Database statistics
db.stats()
```

## ⚠️ Important Notes

1. **Always backup** before running migrations
2. **Never commit** backup files to git (already in .gitignore)
3. **Environment variables** must be set in `.env` file
4. **MongoDB must be running** before executing any database operations

## 🆘 Troubleshooting

See [DATABASE_MIGRATION_GUIDE.md](../DATABASE_MIGRATION_GUIDE.md#troubleshooting) for common issues and solutions.

---

**Last Updated**: 2026-01-19
