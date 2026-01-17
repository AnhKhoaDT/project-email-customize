export class ModifyEmailDto {
  action: 'markRead' | 'markUnread' | 'star' | 'unstar' | 'delete' | 'archive' | 'unarchive';
  // When true and action === 'delete', controller will also remove email metadata from DB.
  deleteMetadata?: boolean;
}
