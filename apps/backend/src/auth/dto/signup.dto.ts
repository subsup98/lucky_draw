import { IsDateString, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // 최소 10자 + 영문/숫자/특수 중 3종 (auth 설계 §1 비밀번호 정책)
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$|^(?=.*[A-Za-z])(?=.*\d).{10,}$|^(?=.*[A-Za-z])(?=.*[^A-Za-z0-9]).{10,}$|^(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/,
    { message: 'password must be at least 10 chars with 2+ of letter/digit/symbol' },
  )
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  // 만 14세 이상 검증용. 가입 시점에만 검증, 이후 사용 안 함.
  // 형식: YYYY-MM-DD
  @IsDateString({ strict: true })
  birthdate!: string;
}
