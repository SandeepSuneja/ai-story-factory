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
  CreateProjectRequestDto,
  UpdateProjectRequestDto,
} from './models/project.model';
import { ProjectService } from './services/project.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  listProjects() {
    return this.projectService.listProjects();
  }

  @Post()
  createProject(@Body() body: CreateProjectRequestDto) {
    return this.projectService.createProject(body);
  }

  @Get(':id')
  getProject(@Param('id') id: string) {
    return this.projectService.getProject(id);
  }

  @Put(':id')
  updateProject(
    @Param('id') id: string,
    @Body() body: UpdateProjectRequestDto,
  ) {
    return this.projectService.updateProject(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  deleteProject(@Param('id') id: string) {
    return this.projectService.deleteProject(id);
  }
}
