import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import {
  GenerateContentRequestDto,
  GenerateContentResponseDto,
} from './models/content.model';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('generate')
  generate(
    @Body() body: GenerateContentRequestDto
  ): Promise<GenerateContentResponseDto> {
    return this.appService.generate(body.topic);
  }
}
