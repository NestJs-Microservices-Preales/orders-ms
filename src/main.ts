import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { envs } from './config';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const logger = new Logger('Main');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule,
    {
      transport : Transport.NATS,
      options : {
        servers : envs.natsServers
      }
    }
  );
  await app.listen();

  logger.log(`Orders Microservice running on port ${envs.port}`);

}
bootstrap();
