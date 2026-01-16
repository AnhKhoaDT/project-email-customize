/**
 * Migration: Backfill `position` for existing EmailMetadata documents
 *
 * - Connects to MongoDB using MONGODB_URI in backend/.env
 * - For each user and each kanbanColumnId, assigns positions 0, 1000, 2000, ...
 * - Uses bulkWrite for efficiency
 *
 * Run: npx ts-node scripts/backfill-email-positions.ts
 */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emailcustomize';
const GAP = Number(process.env.BACKFILL_POSITION_GAP) || 1000;

async function main() {
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();
    const collection = db.collection('emailmetadatas');

    // Get all users that have email metadata
    const users: string[] = await collection.distinct('userId');
    console.log(`🔍 Found ${users.length} users with metadata`);

    let totalUpdated = 0;

    for (const userId of users) {
      console.log(`\n👤 Processing user: ${userId}`);

      // Get distinct kanbanColumnId values for this user
      const columns: string[] = await collection.distinct('kanbanColumnId', { userId, kanbanColumnId: { $exists: true, $ne: null } });
      console.log(`  ➤ Found ${columns.length} columns with explicit kanbanColumnId`);

      for (const columnId of columns) {
        // Load documents for this column in deterministic order
        // Sort by existing position ascending (if any), then by kanbanUpdatedAt asc
        const docs = await collection.find({ userId, kanbanColumnId: columnId }).sort({ position: 1, kanbanUpdatedAt: 1 }).toArray();
        if (!docs || docs.length === 0) continue;

        console.log(`    - Column '${columnId}': ${docs.length} emails`);

        const ops = docs.map((doc: any, idx: number) => ({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { position: idx * GAP } }
          }
        }));

        if (ops.length > 0) {
          const res = await collection.bulkWrite(ops, { ordered: false });
          const modified = (res.modifiedCount || res.upsertedCount || 0) as number;
          totalUpdated += modified;
          console.log(`      → Updated positions for ${modified} docs (gap=${GAP})`);
        }
      }
    }

    console.log(`\n🎯 Backfill complete. Total updated: ${totalUpdated}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
