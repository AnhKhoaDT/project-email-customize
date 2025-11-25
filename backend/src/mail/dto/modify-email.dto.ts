export class ModifyEmailDto {
  action: 'markRead' | 'markUnread' | 'star' | 'unstar' | 'delete' | 'archive' | 'unarchive';
}
