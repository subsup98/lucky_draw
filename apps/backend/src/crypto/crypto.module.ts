import { Global, Module } from '@nestjs/common';
import { FieldCipherService } from './field-cipher.service';

@Global()
@Module({
  providers: [FieldCipherService],
  exports: [FieldCipherService],
})
export class CryptoModule {}
