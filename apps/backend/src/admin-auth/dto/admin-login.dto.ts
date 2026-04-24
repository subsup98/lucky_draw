import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class AdminTotpDto {
  @IsString()
  @MaxLength(128)
  challengeToken!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class AdminBackupCodeDto {
  @IsString()
  @MaxLength(128)
  challengeToken!: string;

  // 백업 코드: 영숫자 8-16자(발급 포맷과 일치). 공백/대시 허용.
  @IsString()
  @MaxLength(32)
  code!: string;
}
