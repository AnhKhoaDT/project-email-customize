# Quick Setup Guide for Database Seeding

## ⚠️ MongoDB Connection Issue

If you see "Unable to connect to the database" errors, your `.env` file might be configured for MongoDB Atlas (cloud) instead of local MongoDB.

## 🔧 Fix: Update MongoDB URI

### Option 1: Use Local MongoDB (Recommended for Development)

1. **Check if MongoDB is running locally:**
   ```bash
   mongosh --eval "db.version()"
   ```
   
   If you see a version number (e.g., `7.0.25`), MongoDB is running! ✅

2. **Update your `.env` file:**
   
   Change this line:
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/mail?retryWrites=true&w=majority
   ```
   
   To this (for local MongoDB):
   ```
   MONGODB_URI=mongodb://localhost:27017/mail-project
   ```

3. **Run the seed script:**
   ```bash
   npm run seed
   ```

### Option 2: Use MongoDB Atlas (Cloud)

If you prefer to use MongoDB Atlas:

1. **Create a free cluster** at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)

2. **Get your connection string** from Atlas dashboard

3. **Update `.env` with your Atlas credentials:**
   ```
   MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/mail-project?retryWrites=true&w=majority
   ```

4. **Whitelist your IP address** in Atlas Network Access settings

5. **Run the seed script:**
   ```bash
   npm run seed
   ```

## 🚀 After Fixing MongoDB Connection

Once MongoDB is connected, run:

```bash
npm run seed
```

You should see:
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
  ✓ Created 15 emails for alice@example.com
  ✓ Created 15 emails for bob@example.com
✅ Created 45 total emails

📋 Creating Kanban configurations...
  ✓ Created Kanban config for demo@example.com
  ✓ Created Kanban config for alice@example.com
  ✓ Created Kanban config for bob@example.com
✅ Created 3 Kanban configurations

🎉 Seeding completed successfully!

📝 Sample credentials:
  - demo@example.com / Demo123!
  - alice@example.com / Alice123!
  - bob@example.com / Bob123!
```

## 📝 Test the Seeded Data

1. **Start the backend:**
   ```bash
   npm run dev
   ```

2. **Start the frontend:**
   ```bash
   cd ../frontend
   npm run dev
   ```

3. **Login with sample account:**
   - Email: `demo@example.com`
   - Password: `Demo123!`

4. **You should see:**
   - 15 sample emails in various folders (Inbox, Sent, Drafts, etc.)
   - A Kanban board with 4 columns
   - Emails distributed across Kanban columns

## 🐛 Troubleshooting

### MongoDB not installed?

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
```

**macOS:**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Windows:**
Download from [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)

### Check MongoDB status:

```bash
# Linux
sudo systemctl status mongod

# macOS
brew services list | grep mongodb

# All platforms
mongosh --eval "db.version()"
```

### Clear database manually:

If you need to reset the database:
```bash
mongosh
use mail-project
db.users.deleteMany({})
db.emailmetadata.deleteMany({})
db.kanbanconfigs.deleteMany({})
exit
```

## ✅ Success Checklist

- [ ] MongoDB is running locally or Atlas is configured
- [ ] `.env` has correct `MONGODB_URI`
- [ ] `npm run seed` completes without errors
- [ ] Backend starts with `npm run dev`
- [ ] Can login with `demo@example.com` / `Demo123!`
- [ ] See 15 sample emails in the UI
- [ ] Kanban board shows 4 columns with emails

---

**Need help?** Check the full documentation in `src/seed/README.md`
