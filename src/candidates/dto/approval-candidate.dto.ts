import {
    IsEnum, IsString,
  } from 'class-validator';
  import { Approval } from '@prisma/client';
  export class ApprovalCandidateDto {
    @IsEnum(Approval)
    approval: Approval;

    @IsString()
    description: string
}