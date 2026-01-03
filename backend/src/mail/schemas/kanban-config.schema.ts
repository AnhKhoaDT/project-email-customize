import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type KanbanConfigDocument = KanbanConfig & Document;

/**
 * Kanban Column Configuration - Week 4 Feature III
 * 
 * Allows users to customize their Kanban board with custom columns.
 * Each column can be mapped to a Gmail label for automatic syncing.
 */

@Schema({ timestamps: true })
export class KanbanColumn {
  @Prop({ required: true })
  id: string; // Unique column ID (e.g., "col_1", "col_2")

  @Prop({ required: true })
  name: string; // Display name (e.g., "To Do", "In Progress", "Done")

  @Prop({ required: true })
  order: number; // Display order (0, 1, 2, ...)

  @Prop()
  gmailLabel?: string; // Gmail label to sync with (e.g., "STARRED", "IMPORTANT", custom label ID)
  
  @Prop()
  gmailLabelName?: string; // Friendly name of the Gmail label (backup for UX when label deleted)

  // ============================================
  // REFINEMENT: Advanced Mapping Options
  // ============================================
  @Prop({ default: 'label' })
  mappingType: 'label' | 'search' | 'custom'; // Label-based, Search-based, hoặc Custom logic

  @Prop()
  searchQuery?: string; // Nếu mappingType = 'search', lưu query (e.g., "is:unread from:boss@company.com")

  @Prop({ default: false })
  autoArchive?: boolean; // Tự động archive email khi move vào cột này

  @Prop({ default: false })
  removeInboxLabel?: boolean; // Tự động remove INBOX label khi move vào cột

  // ============================================
  // UI & Metadata
  // ============================================
  @Prop()
  color?: string; // Optional color for UI (e.g., "#FF5733")

  @Prop({ default: true })
  isVisible: boolean; // Whether column is visible on board

  @Prop({ default: 0 })
  emailCount?: number; // Cache số lượng emails trong column (để hiển thị nhanh)

  @Prop()
  lastSyncedAt?: Date; // Timestamp của lần sync gần nhất với Gmail

  // ============================================
  // ERROR HANDLING: Gmail Label Deleted/Invalid
  // ============================================
  @Prop({ default: false })
  hasLabelError?: boolean; // True if Gmail label was deleted or is invalid

  @Prop()
  labelErrorMessage?: string; // Error message from Gmail API

  @Prop()
  labelErrorDetectedAt?: Date; // When the error was first detected
}

export const KanbanColumnSchema = SchemaFactory.createForClass(KanbanColumn);

@Schema({ timestamps: true })
export class KanbanConfig {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ 
    type: [KanbanColumnSchema], 
    default: [],
    validate: {
      validator: function(columns: KanbanColumn[]) {
        // ============================================
        // DB CONSTRAINT 1: No Duplicate Gmail Labels
        // ============================================
        const labelsMap = new Map<string, string>();
        
        for (const col of columns) {
          if (col.gmailLabel) {
            const normalizedLabel = col.gmailLabel.toLowerCase().trim();
            
            if (labelsMap.has(normalizedLabel)) {
              // Duplicate found
              return false;
            }
            
            labelsMap.set(normalizedLabel, col.name);
          }
        }
        
        // ============================================
        // DB CONSTRAINT 2: No Duplicate Column Names
        // ============================================
        const namesMap = new Map<string, boolean>();
        
        for (const col of columns) {
          const normalizedName = col.name.toLowerCase().trim();
          
          if (namesMap.has(normalizedName)) {
            return false;
          }
          
          namesMap.set(normalizedName, true);
        }
        
        // ============================================
        // DB CONSTRAINT 3: No Duplicate Column IDs
        // ============================================
        const idsSet = new Set(columns.map(c => c.id));
        if (idsSet.size !== columns.length) {
          return false;
        }
        
        return true;
      },
      message: props => {
        const columns = props.value as KanbanColumn[];
        
        // Find which constraint failed
        const labels = columns
          .filter(c => c.gmailLabel)
          .map(c => c.gmailLabel.toLowerCase().trim());
        const labelSet = new Set(labels);
        
        if (labelSet.size !== labels.length) {
          const duplicates = labels.filter((label, index) => 
            labels.indexOf(label) !== index
          );
          return `Duplicate Gmail labels detected: ${[...new Set(duplicates)].join(', ')}`;
        }
        
        const names = columns.map(c => c.name.toLowerCase().trim());
        const nameSet = new Set(names);
        
        if (nameSet.size !== names.length) {
          const duplicates = names.filter((name, index) => 
            names.indexOf(name) !== index
          );
          return `Duplicate column names detected: ${[...new Set(duplicates)].join(', ')}`;
        }
        
        return 'Duplicate column IDs detected';
      }
    }
  })
  columns: KanbanColumn[];

  @Prop({ default: false })
  showInbox: boolean; // Whether to show INBOX as a source column

  @Prop({ default: 'name' })
  defaultSort: string; // Default sort field (name, date, etc.)

  // ============================================
  // REFINEMENT: Sync Strategy Options
  // ============================================
  @Prop({ default: 'optimistic' })
  syncStrategy: 'optimistic' | 'pessimistic'; // UI update strategy

  @Prop({ default: 5000 })
  syncTimeoutMs: number; // Timeout cho Gmail API calls (default 5s)

  @Prop({ default: true })
  enableAutoSync: boolean; // Bật/tắt auto-sync với Gmail

  @Prop()
  lastGlobalSync?: Date; // Timestamp của lần full sync gần nhất

  @Prop()
  lastModified: Date;
}

export const KanbanConfigSchema = SchemaFactory.createForClass(KanbanConfig);

// ============================================
// INDEXES
// ============================================

// Index for fast user queries
KanbanConfigSchema.index({ userId: 1 });

// Compound index cho label lookup
KanbanConfigSchema.index({ userId: 1, 'columns.gmailLabel': 1 });

// Index cho timestamp queries
KanbanConfigSchema.index({ lastGlobalSync: 1 });

// ============================================
// MIDDLEWARE - Pre-save Validation
// ============================================

/**
 * Pre-save hook to enforce data integrity constraints
 * This catches duplicates before they're saved to DB
 */
KanbanConfigSchema.pre('save', function(next) {
  const config = this as KanbanConfigDocument;
  
  // Skip validation if this is a delete operation (marked by a special flag)
  if ((config as any)._skipValidationForDelete) {
    return next();
  }
  
  // Skip validation if validateBeforeSave is false (force save)
  if ((this as any).$__.saveOptions && (this as any).$__.saveOptions.validateBeforeSave === false) {
    return next();
  }
  
  try {
    // Validate duplicate Gmail labels
    const labelCounts = new Map<string, number>();
    const duplicateLabels: string[] = [];
    
    config.columns.forEach((col) => {
      if (col.gmailLabel) {
        const normalized = col.gmailLabel.toLowerCase().trim();
        const count = (labelCounts.get(normalized) || 0) + 1;
        labelCounts.set(normalized, count);
        
        if (count > 1) {
          duplicateLabels.push(col.gmailLabel);
        }
      }
    });
    
    if (duplicateLabels.length > 0) {
      const error = new Error(
        `Cannot save: Duplicate Gmail labels detected: ${[...new Set(duplicateLabels)].join(', ')}`
      );
      return next(error);
    }
    
    // Validate duplicate column names
    const nameCounts = new Map<string, number>();
    const duplicateNames: string[] = [];
    
    config.columns.forEach((col) => {
      const normalized = col.name.toLowerCase().trim();
      const count = (nameCounts.get(normalized) || 0) + 1;
      nameCounts.set(normalized, count);
      
      if (count > 1) {
        duplicateNames.push(col.name);
      }
    });
    
    if (duplicateNames.length > 0) {
      const error = new Error(
        `Cannot save: Duplicate column names detected: ${[...new Set(duplicateNames)].join(', ')}`
      );
      return next(error);
    }
    
    // All validations passed
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * Pre-update hook to enforce constraints on updates
 */
KanbanConfigSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate() as any;
  
  // Skip validation for $pull operations (delete operations should not be validated)
  if (update.$pull) {
    return next();
  }
  
  // Only validate if columns are being updated
  if (update.$set?.columns || update.$push?.columns || update.columns) {
    const columns = update.$set?.columns || update.columns;
    
    if (columns && Array.isArray(columns)) {
      // Check for duplicate labels
      const labels = columns
        .filter((c: KanbanColumn) => c.gmailLabel)
        .map((c: KanbanColumn) => c.gmailLabel.toLowerCase().trim());
      
      const labelSet = new Set(labels);
      if (labelSet.size !== labels.length) {
        const error = new Error('Cannot update: Duplicate Gmail labels detected');
        return next(error);
      }
      
      // Check for duplicate names
      const names = columns.map((c: KanbanColumn) => c.name.toLowerCase().trim());
      const nameSet = new Set(names);
      if (nameSet.size !== names.length) {
        const error = new Error('Cannot update: Duplicate column names detected');
        return next(error);
      }
    }
  }
  
  next();
});
