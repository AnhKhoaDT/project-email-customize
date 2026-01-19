# 🗄️ Database Migration Guide

**Project**: Mail Project  
**Database**: MongoDB  
**Last Updated**: 2026-01-19

---

## 📑 Table of Contents
1. [Overview](#overview)
2. [Migration Scripts](#migration-scripts)
3. [How to Run Migrations](#how-to-run-migrations)
4. [Seed Data](#seed-data)
5. [Database Backup & Restore](#database-backup--restore)
6. [Troubleshooting](#troubleshooting)

---

## Overview

### Database Structure
Dự án sử dụng **MongoDB** với **Mongoose ORM** trong NestJS. Database bao gồm:

- **6 Collections** (users, emailmetadatas, kanbanconfigs, gmailsyncstates, searchsuggestioncaches, sessions)
- **Migration Scripts** để update schema khi cần
- **Seed Scripts** để tạo sample data

### Migration Strategy
- **Schema-less**: MongoDB không yêu cầu strict schema, nhưng Mongoose enforces schema
- **Incremental Migrations**: Mỗi migration script xử lý một thay đổi cụ thể
- **Rollback**: Cần tạo reverse migration nếu cần rollback

---

## Migration Scripts

### Location
```
backend/src/migrations/
```

### Available Migrations

#### 1. `kanban-column-id-migration.ts`
**Purpose**: Migrate từ `cachedColumnId` sang `kanbanColumnId`

**Changes**:
- Rename field `cachedColumnId` → `kanbanColumnId`
- Set default value `'inbox'` cho documents thiếu field này

**Affected Collection**: `emailmetadatas`

**When to Run**: 
- Khi upgrade từ version cũ (trước Week 4)
- Khi có documents thiếu `kanbanColumnId` field

---

## How to Run Migrations

### Prerequisites
1. **MongoDB Running**: Đảm bảo MongoDB đang chạy
2. **Environment Variables**: File `.env` đã được cấu hình đúng
3. **Backup**: Luôn backup database trước khi migrate

### Step-by-Step Guide

#### Step 1: Backup Database (IMPORTANT!)
```bash
# Navigate to backend directory
cd backend

# Backup entire database
mongodump --uri="mongodb://localhost:27017/mail-your" --out=./backups/$(date +%Y%m%d_%H%M%S)
```

#### Step 2: Check Environment Variables
```bash
# Verify .env file has MONGODB_URI
cat .env | grep MONGODB_URI

# Should output something like:
# MONGODB_URI=mongodb://localhost:27017/mail-your
```

#### Step 3: Run Migration
```bash
# Using npm script (recommended)
npm run migrate

# Or run directly with ts-node
npx ts-node-dev --transpile-only src/migrations/kanban-column-id-migration.ts
```

#### Step 4: Verify Migration
```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/mail-your

# Check a sample document
db.emailmetadatas.findOne()

# Verify kanbanColumnId exists
db.emailmetadatas.countDocuments({ kanbanColumnId: { $exists: true } })
```

### Expected Output
```
🔌 Connecting to MongoDB...
✅ Connected.
🚀 Step 1: Renaming cachedColumnId -> kanbanColumnId...
   👉 Renamed 45 documents.
🚀 Step 2: Setting default 'inbox' for missing fields...
   👉 Updated 0 documents to 'inbox'.
🎉 Migration completed successfully!
👋 Disconnected.
```

---

## Seed Data

### Purpose
Tạo sample data để test và development

### What Gets Seeded
- **3 Users** (demo@example.com, alice@example.com, bob@example.com)
- **45 Emails** (15 emails per user)
- **3 Kanban Configs** (1 per user)

### How to Run Seed

#### Step 1: Clear Existing Data (Optional)
```bash
# WARNING: This will delete ALL data!
mongosh mongodb://localhost:27017/mail-your

db.users.deleteMany({})
db.emailmetadatas.deleteMany({})
db.kanbanconfigs.deleteMany({})
```

#### Step 2: Run Seed Script
```bash
cd backend
npm run seed
```

#### Step 3: Verify Seed Data
```bash
mongosh mongodb://localhost:27017/mail-your

# Check counts
db.users.countDocuments()          // Should be 3
db.emailmetadatas.countDocuments() // Should be 45
db.kanbanconfigs.countDocuments()  // Should be 3
```

### Sample Credentials
After seeding, you can login with:
- `demo@example.com` / `Demo123!`
- `alice@example.com` / `Alice123!`
- `bob@example.com` / `Bob123!`

---

## Database Backup & Restore

### Backup

#### Full Database Backup
```bash
# Backup to timestamped folder
mongodump --uri="mongodb://localhost:27017/mail-your" \
  --out=./backups/$(date +%Y%m%d_%H%M%S)
```

#### Single Collection Backup
```bash
# Backup only emailmetadatas collection
mongodump --uri="mongodb://localhost:27017/mail-your" \
  --collection=emailmetadatas \
  --out=./backups/emailmetadatas_$(date +%Y%m%d_%H%M%S)
```

### Restore

#### Full Database Restore
```bash
# Restore from backup folder
mongorestore --uri="mongodb://localhost:27017/mail-your" \
  --drop \
  ./backups/20260119_233000
```

#### Single Collection Restore
```bash
# Restore only emailmetadatas
mongorestore --uri="mongodb://localhost:27017/mail-your" \
  --collection=emailmetadatas \
  --drop \
  ./backups/emailmetadatas_20260119_233000/mail-your/emailmetadatas.bson
```

---

## Troubleshooting

### Common Issues

#### 1. "MONGODB_URI is missing in .env file"
**Solution**:
```bash
# Check .env file exists
ls -la backend/.env

# Add MONGODB_URI if missing
echo "MONGODB_URI=mongodb://localhost:27017/mail-your" >> backend/.env
```

#### 2. "Connection refused"
**Solution**:
```bash
# Check if MongoDB is running
sudo systemctl status mongod

# Start MongoDB if not running
sudo systemctl start mongod
```

#### 3. "Collection not found"
**Solution**:
```bash
# List all collections
mongosh mongodb://localhost:27017/mail-your --eval "db.getCollectionNames()"

# Verify collection name matches migration script
# Default: EmailMetadata -> emailmetadatas (lowercase + 's')
```

#### 4. Migration runs but no documents updated
**Possible Causes**:
- Collection is empty (run seed first)
- Field already exists (migration already ran)
- Query filter doesn't match any documents

**Solution**:
```bash
# Check if field exists
mongosh mongodb://localhost:27017/mail-your

db.emailmetadatas.findOne({ cachedColumnId: { $exists: true } })
db.emailmetadatas.findOne({ kanbanColumnId: { $exists: true } })
```

#### 5. "Duplicate key error"
**Solution**:
```bash
# Check for duplicate indexes
mongosh mongodb://localhost:27017/mail-your

db.emailmetadatas.getIndexes()

# Drop problematic index if needed
db.emailmetadatas.dropIndex("index_name")
```

---

## Creating New Migrations

### Template
```typescript
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is missing in .env file');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected.');

    const collection = mongoose.connection.collection('your_collection_name');

    // =========================================================
    // YOUR MIGRATION LOGIC HERE
    // =========================================================
    console.log('🚀 Running migration...');
    
    const result = await collection.updateMany(
      { /* your filter */ },
      { /* your update */ }
    );

    console.log(`   👉 Updated ${result.modifiedCount} documents.`);
    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected.');
    process.exit(0);
  }
}

runMigration();
```

### Best Practices
1. **Always backup** before running migrations
2. **Test on development** database first
3. **Use transactions** for complex migrations
4. **Log everything** for debugging
5. **Create reverse migration** for rollback capability
6. **Document changes** in migration file comments

### Adding to package.json
```json
{
  "scripts": {
    "migrate:your-migration-name": "ts-node-dev --transpile-only src/migrations/your-migration-name.ts"
  }
}
```

---

## Database Monitoring

### Check Database Size
```bash
mongosh mongodb://localhost:27017/mail-your --eval "db.stats()"
```

### Check Collection Sizes
```bash
mongosh mongodb://localhost:27017/mail-your --eval "
  db.getCollectionNames().forEach(function(collection) {
    var stats = db[collection].stats();
    print(collection + ': ' + (stats.size / 1024 / 1024).toFixed(2) + ' MB');
  });
"
```

### Check Indexes
```bash
mongosh mongodb://localhost:27017/mail-your --eval "
  db.getCollectionNames().forEach(function(collection) {
    print('\\n' + collection + ' indexes:');
    printjson(db[collection].getIndexes());
  });
"
```

---

## Quick Reference

### Common Commands
```bash
# Run migration
npm run migrate

# Run seed
npm run seed

# Backup database
mongodump --uri="mongodb://localhost:27017/mail-your" --out=./backups/backup_$(date +%Y%m%d)

# Restore database
mongorestore --uri="mongodb://localhost:27017/mail-your" --drop ./backups/backup_20260119

# Connect to MongoDB shell
mongosh mongodb://localhost:27017/mail-your

# Check collection count
mongosh mongodb://localhost:27017/mail-your --eval "db.emailmetadatas.countDocuments()"
```

---

**End of Migration Guide**
