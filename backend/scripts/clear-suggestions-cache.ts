/**
 * Clear search suggestions cache
 * Run this after updating suggestion logic to see new results
 */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emailcustomize';

async function main() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();
    const collection = db.collection('searchsuggestioncaches');

    // Clear all suggestion caches
    const result = await collection.deleteMany({});
    
    console.log(`✅ Cleared ${result.deletedCount} suggestion cache entries`);
    console.log('💡 Next search will fetch fresh suggestions from Gmail API');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
