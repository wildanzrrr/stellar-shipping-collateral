/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { generateCustomId } from 'src/utils/utils';
import { Prisma, User } from 'prisma/generated/prisma/client';

@Injectable()
export class UsersRepository {
  private readonly logger = new Logger(UsersRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async get(payload: Prisma.UserWhereInput): Promise<User | null> {
    this.logger.debug('Getting user with payload,', payload);
    try {
      return await this.prisma.user.findFirst({
        where: payload,
        include: {
          wallet: true,
          signSession: true,
        },
      });
    } catch (error) {
      this.logger.error('Error in get', error);
      throw error;
    }
  }

  async getByUsername(username: string): Promise<User | null> {
    this.logger.debug('Getting user by username,', username);
    try {
      return await this.prisma.user.findFirst({
        where: {
          username,
          deletedAt: null,
        },
        include: {
          wallet: true,
        },
      });
    } catch (error) {
      this.logger.error('Error in getByUsername', error);
      throw error;
    }
  }

  async create(username: string): Promise<User> {
    this.logger.debug('Creating user with username,', username);
    try {
      return await this.prisma.user.create({
        data: {
          id: generateCustomId('usr'),
          username,
        },
      });
    } catch (error) {
      this.logger.error('Error in create', error);
      throw error;
    }
  }

  async update(id: string, payload: Prisma.UserUpdateInput): Promise<User> {
    this.logger.debug('Updating user with id and payload,', id, payload);
    try {
      return await this.prisma.user.update({
        where: { id },
        data: payload,
      });
    } catch (error) {
      this.logger.error('Error in update', error);
      throw error;
    }
  }

  async delete(id: string): Promise<User> {
    this.logger.debug('Deleting user with id,', id);
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      this.logger.error('Error in delete', error);
      throw error;
    }
  }
}
