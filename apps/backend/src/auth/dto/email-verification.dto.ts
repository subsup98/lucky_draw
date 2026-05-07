import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifySignupCodeDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class RequestPasswordResetDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  // 가입 시와 동일 비밀번호 정책.
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$|^(?=.*[A-Za-z])(?=.*\d).{10,}$|^(?=.*[A-Za-z])(?=.*[^A-Za-z0-9]).{10,}$|^(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/,
    { message: 'password must be at least 10 chars with 2+ of letter/digit/symbol' },
  )
  newPassword!: string;
}
