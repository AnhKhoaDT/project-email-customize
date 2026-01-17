import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

// 1. Load biến môi trường
dotenv.config();

async function runMigration() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is missing in .env file');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  
  try {
    // 2. Kết nối trực tiếp
    await mongoose.connect(uri);
    console.log('✅ Connected.');

    // 3. Lấy collection trực tiếp (Không cần Schema/Model của NestJS)
    // ⚠️ LƯU Ý: Mongoose thường đặt tên collection là tên class viết thường + 's'
    // Ví dụ: EmailMetadata -> emailmetadatas
    // Hãy kiểm tra trong DB của bạn xem tên chính xác là gì.
    const collectionName = 'emailmetadatas'; 
    const collection = mongoose.connection.collection(collectionName);

    // =========================================================
    // STEP 1: RENAME FIELD (cachedColumnId -> kanbanColumnId)
    // =========================================================
    console.log('🚀 Step 1: Renaming cachedColumnId -> kanbanColumnId...');
    
    // Sử dụng $rename của MongoDB (Nhanh hơn updateMany + set/unset)
    const renameResult = await collection.updateMany(
      { cachedColumnId: { $exists: true } }, // Chỉ rename những thằng có field cũ
      { $rename: { 'cachedColumnId': 'kanbanColumnId' } }
    );

    console.log(`   👉 Renamed ${renameResult.modifiedCount} documents.`);

    // =========================================================
    // STEP 2: SET DEFAULT VALUE ('inbox')
    // =========================================================
    console.log("🚀 Step 2: Setting default 'inbox' for missing fields...");

    const defaultResult = await collection.updateMany(
      {
        $or: [
          { kanbanColumnId: { $exists: false } },
          { kanbanColumnId: null },
          { kanbanColumnId: '' }
        ]
      },
      { $set: { kanbanColumnId: 'inbox' } }
    );

    console.log(`   👉 Updated ${defaultResult.modifiedCount} documents to 'inbox'.`);
    
    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    // 4. Đóng kết nối
    await mongoose.disconnect();
    console.log('👋 Disconnected.');
    process.exit(0);
  }
}

runMigration();