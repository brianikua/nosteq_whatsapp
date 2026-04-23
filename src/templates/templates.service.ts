import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template } from './entities/template.entity';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template)
    private templateRepository: Repository<Template>,
  ) {}

  async findAll(): Promise<Template[]> {
    return this.templateRepository.find({
      where: { status: 'active' },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Template> {
    const template = await this.templateRepository.findOne({
      where: { id },
    });
    if (!template) {
      throw new Error(`Template with ID ${id} not found`);
    }
    return template;
  }

  async create(templateData: Partial<Template>): Promise<Template> {
    const template = this.templateRepository.create(templateData);
    return this.templateRepository.save(template);
  }

  async update(id: number, templateData: Partial<Template>): Promise<Template> {
    await this.templateRepository.update(id, templateData);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.templateRepository.delete(id);
  }
}