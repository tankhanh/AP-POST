import { Controller, Post, Get, Param, Body, Patch, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Public } from 'src/health/decorator/customize';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':orderId')
  create(@Param('orderId') orderId: string, @Body('method') method: string) {
    return this.paymentsService.create(orderId, method);
  }

  @Get()
  findAll() {
    return this.paymentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.paymentsService.updateStatus(id, status);
  }
}

@Controller('payments/gateway')
export class PaymentsGatewayController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('callback')
  @Public()
  async handleCallback(@Body() body: any, @Query() query: any) {
    const txnRef = body.txnRef || query.txnRef || body.order_id;  // Tùy gateway
    const status = body.status === 'success' ? 'paid' : 'failed';
    return this.paymentsService.handleGatewayCallback(txnRef, status, body);
  }
}