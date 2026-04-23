import { Module } from '@nestjs/common';

import { AdminProductsController } from './admin-products.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsTrashService } from './products-trash.service';

@Module({
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService, ProductsTrashService],
  exports: [ProductsService],
})
export class ProductsModule {}
