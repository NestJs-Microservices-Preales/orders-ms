import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChangeOrderStatusDto, CreateOrderDto, UpdateOrderDto } from './dto';
import { PrismaClient } from '@prisma/client';
import { NATS_SERVICE } from 'src/config';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { OrderPaginationDto } from './dto/order-pagination.dto';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');
  
  constructor(
    @Inject(NATS_SERVICE) private readonly productsClient: ClientProxy,
  ) {
    super();
    
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }
  
  async create(createOrderDto: CreateOrderDto) {
    try {
      //1 Confirmar los ids de los productos
      const productIds = createOrderDto.items.map((item) => item.productId);
      const products = await this.GetProducts(productIds);

      //2. Cálculos de los valores
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find(
          (product) => product.id === orderItem.productId,
        ).price;
        return price * orderItem.quantity;
      }, 0);

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);

      //3. Crear una transacción de base de datos
      const order = await this.order.create({
        data: {
          totalAmount: totalAmount,
          totalItems: totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find(
                  (product) => product.id === orderItem.productId,
                ).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === orderItem.productId)
            .name,
        })),
      };
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Check logs',
      });
    }
  }

  async findAll(orderPaginationDto:OrderPaginationDto) {
    const totalPages = await this.order.count({
      where : {
        status : orderPaginationDto.status
      }
    });

    const { page, limit } = orderPaginationDto;
    const lastPage = Math.ceil(totalPages / limit);

    return {
      data : await this.order.findMany({
        skip : (page -1)*limit,
        take : limit,
        where : {
          status : orderPaginationDto.status
        }
      }),
      meta:{
        total: totalPages,
        page,
        lastPage,
      }
    }
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where : {id},
      include : {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      }
    });

    if(!order){
      throw new RpcException({
        status : HttpStatus.BAD_REQUEST,
        message : `Order with id #${id} not found}`
      });
    }

    const productIds = order.OrderItem.map((item) => item.productId);
    const products = await this.GetProducts(productIds);

    return {
      ...order,
      OrderItem: order.OrderItem.map((orderItem) => ({
        ...orderItem,
        name: products.find((product) => product.id === orderItem.productId)
          .name,
      })),
    };
  }

  private async GetProducts(productIds : number[]) : Promise<any[]>
  {    
    const products : any[] = await firstValueFrom(
      this.productsClient.send({cmd: 'validate_products'},productIds)
    );

    return products;
  }

  async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const {id, status} = changeOrderStatusDto;

    const order = await this.findOne(id);
    if(order.status === status )
      return order;

    return this.order.update({
      where : {id},
      data : {status : status},
    });
  }
}
