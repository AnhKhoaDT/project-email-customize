export class ToggleLabelDto {
  action: 'add' | 'remove';
  emailIds: string[]; // array of message IDs
}
