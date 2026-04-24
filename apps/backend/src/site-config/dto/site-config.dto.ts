import { IsDefined } from 'class-validator';

export class SetConfigDto {
  // JSON 값 (boolean / string / number / object 허용).
  @IsDefined()
  value!: unknown;
}
