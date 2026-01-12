# ✅ Database Mock Data - Action Checklist

## 🎯 Goal
Fix the missing seed data issue to avoid -1 point deduction.

## 📋 What I Created For You

✅ **Seed Script** (`src/seed/seed.ts`)
   - Creates 3 sample users
   - Creates 45 sample emails (15 per user)
   - Creates Kanban configurations
   - Includes proper error handling

✅ **NPM Script** (in `package.json`)
   - Added `npm run seed` command

✅ **Documentation** (3 files)
   - `src/seed/README.md` - Full documentation
   - `SEED_SETUP.md` - Quick setup guide
   - `DATABASE_MOCK_DATA_SUMMARY.md` - Summary for grading

✅ **Updated Main README**
   - Added seeding section with instructions

## 🚨 IMPORTANT: What You Need To Do

### Step 1: Fix MongoDB Connection

The seed script needs MongoDB to be running. You have 2 options:

#### Option A: Use Local MongoDB (Recommended)
```bash
# 1. Check if MongoDB is running
mongosh --eval "db.version()"

# 2. If it works, update your .env file:
# Change MONGODB_URI to:
MONGODB_URI=mongodb://localhost:27017/mail-project

# 3. Run the seeder
npm run seed
```

#### Option B: Use MongoDB Atlas (Cloud)
```bash
# 1. Create free cluster at mongodb.com/cloud/atlas
# 2. Get connection string from Atlas
# 3. Update .env with your credentials
# 4. Run the seeder
npm run seed
```

### Step 2: Run The Seeder

```bash
cd backend
npm run seed
```

**Expected output:**
```
🌱 Starting database seeding...
🗑️  Clearing existing data...
✅ Existing data cleared

👥 Creating sample users...
  ✓ Created user: demo@example.com
  ✓ Created user: alice@example.com
  ✓ Created user: bob@example.com
✅ Created 3 users

📧 Creating sample emails...
  ✓ Created 15 emails for demo@example.com
  ...
✅ Created 45 total emails

📋 Creating Kanban configurations...
✅ Created 3 Kanban configurations

🎉 Seeding completed successfully!
```

### Step 3: Test The Seeded Data

```bash
# 1. Start backend (if not running)
npm run dev

# 2. In another terminal, start frontend
cd ../frontend
npm run dev

# 3. Open browser: http://localhost:3000

# 4. Login with:
Email: demo@example.com
Password: Demo123!

# 5. You should see:
- 15 emails in various folders
- Kanban board with 4 columns
- Emails distributed across columns
```

### Step 4: Show Your Teacher

To prove you have seed data, show them:

1. **The seed script file**: `backend/src/seed/seed.ts`
2. **The documentation**: `backend/DATABASE_MOCK_DATA_SUMMARY.md`
3. **Run the seeder** in front of them: `npm run seed`
4. **Show the results** in the UI after logging in

## 📝 Quick Reference

### Sample Credentials
```
Email: demo@example.com
Password: Demo123!

Email: alice@example.com
Password: Alice123!

Email: bob@example.com
Password: Bob123!
```

### What Gets Created
- **3 users** with authentication
- **45 emails** across all folders (Inbox, Sent, Drafts, Spam, Archive, Trash)
- **3 Kanban boards** with 4 columns each

### Commands
```bash
# Seed the database
npm run seed

# Start backend
npm run dev

# Check MongoDB
mongosh --eval "db.version()"
```

## 🐛 Troubleshooting

### Error: "Unable to connect to the database"
→ See `SEED_SETUP.md` for detailed MongoDB setup

### Error: "Duplicate key error"
→ Database already has data. The seeder clears it automatically, but if it fails:
```bash
mongosh
use mail-project
db.users.deleteMany({})
db.emailmetadata.deleteMany({})
db.kanbanconfigs.deleteMany({})
exit
```

### MongoDB not installed?
→ See `SEED_SETUP.md` for installation instructions

## ✨ Summary

You now have:
- ✅ Complete seed data implementation
- ✅ Comprehensive documentation
- ✅ Easy-to-use npm script
- ✅ Sample users and emails ready to demo

**Next action:** Fix MongoDB connection and run `npm run seed`!

---

**Need help?** Read the detailed guides:
- Quick setup: `SEED_SETUP.md`
- Full docs: `src/seed/README.md`
- Summary: `DATABASE_MOCK_DATA_SUMMARY.md`
