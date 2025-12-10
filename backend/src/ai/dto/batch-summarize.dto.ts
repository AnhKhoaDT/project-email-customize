import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class EmailToSummarize {
  emailId?: string;
  sender: string;
  subject: string;
  body: string;
}

export class BatchSummarizeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EmailToSummarize)
  emails: EmailToSummarize[];
}
