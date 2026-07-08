import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  CreateSeriesRequestDto,
  UpdateSeriesRequestDto,
} from './models/series.model';
import { SeriesService } from './services/series.service';

@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get()
  listSeries() {
    return this.seriesService.listSeries();
  }

  @Post()
  createSeries(@Body() body: CreateSeriesRequestDto) {
    return this.seriesService.createSeries(body);
  }

  @Get(':id')
  getSeries(@Param('id') id: string) {
    return this.seriesService.getSeries(id);
  }

  @Put(':id')
  updateSeries(@Param('id') id: string, @Body() body: UpdateSeriesRequestDto) {
    return this.seriesService.updateSeries(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  deleteSeries(@Param('id') id: string) {
    return this.seriesService.deleteSeries(id);
  }
}
