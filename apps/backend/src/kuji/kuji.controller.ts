import { Controller, Get, Param } from '@nestjs/common';
import { KujiService } from './kuji.service';

@Controller('kujis')
export class KujiController {
  constructor(private readonly kuji: KujiService) {}

  @Get()
  list() {
    return this.kuji.list();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.kuji.detail(id);
  }

  @Get(':id/remaining')
  remaining(@Param('id') id: string) {
    return this.kuji.remaining(id);
  }
}
