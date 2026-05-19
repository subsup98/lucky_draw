import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';

@Module({
  imports: [AuthModule],
  providers: [AddressService],
  controllers: [AddressController],
  exports: [AddressService],
})
export class AddressModule {}
