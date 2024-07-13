import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { envs } from './common';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Main');

  const app = await NestFactory.create(AppModule);
  await app.listen(envs.port);

  logger.log(`Products Microservice running on port ${envs.port}`);

}
bootstrap();
