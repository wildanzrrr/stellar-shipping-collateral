import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { generateCustomId } from 'src/utils/utils';
import {
  Prisma,
  User,
  UserRole,
  InvestmentProfile,
} from 'prisma/generated/prisma/client';

/** User with wallet + signSession + investmentProfile relations included. */
export type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    wallet: true;
    signSession: true;
    investmentProfile: true;
  };
}>;

@Injectable()
export class UsersRepository {
  private readonly logger = new Logger(UsersRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async get(payload: Prisma.UserWhereInput): Promise<UserWithRelations | null> {
    this.logger.debug('Getting user with payload,', payload);
    try {
      return await this.prisma.user.findFirst({
        where: payload,
        include: {
          wallet: true,
          signSession: true,
          investmentProfile: true,
        },
      });
    } catch (error) {
      this.logger.error('Error in get', error);
      throw error;
    }
  }

  async getByUsername(username: string): Promise<UserWithRelations | null> {
    this.logger.debug('Getting user by username,', username);
    try {
      return await this.prisma.user.findFirst({
        where: {
          username,
          deletedAt: null,
        },
        include: {
          wallet: true,
          signSession: true,
          investmentProfile: true,
        },
      });
    } catch (error) {
      this.logger.error('Error in getByUsername', error);
      throw error;
    }
  }

  async getByEmail(email: string): Promise<UserWithRelations | null> {
    this.logger.debug('Getting user by email,', email);
    try {
      return await this.prisma.user.findFirst({
        where: {
          email,
          deletedAt: null,
        },
        include: {
          wallet: true,
          signSession: true,
          investmentProfile: true,
        },
      });
    } catch (error) {
      this.logger.error('Error in getByEmail', error);
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
          email: username,
        },
      });
    } catch (error) {
      this.logger.error('Error in create', error);
      throw error;
    }
  }

  /** Create a user from the auth flow — email is the identity, names are profile. */
  async createWithProfile(payload: {
    email: string;
    role: UserRole;
    firstName?: string;
    lastName?: string;
  }): Promise<User> {
    this.logger.debug('Creating user with profile,', payload.email);
    try {
      return await this.prisma.user.create({
        data: {
          id: generateCustomId('usr'),
          username: payload.email,
          email: payload.email,
          role: payload.role,
          firstName: payload.firstName,
          lastName: payload.lastName,
        },
      });
    } catch (error) {
      this.logger.error('Error in createWithProfile', error);
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

  // --- Investment Profile ---

  /** Upsert the investment profile for a user (1:1 relation). */
  async upsertInvestmentProfile(
    userId: string,
    answers: Record<string, string | string[]>,
  ): Promise<InvestmentProfile> {
    this.logger.debug('Upserting investment profile for user,', userId);
    try {
      return await this.prisma.investmentProfile.upsert({
        where: { userId },
        create: { userId, answers },
        update: { answers },
      });
    } catch (error) {
      this.logger.error('Error in upsertInvestmentProfile', error);
      throw error;
    }
  }

  /** Get the investment profile for a user, if it exists. */
  async getInvestmentProfile(
    userId: string,
  ): Promise<InvestmentProfile | null> {
    this.logger.debug('Getting investment profile for user,', userId);
    try {
      return await this.prisma.investmentProfile.findUnique({
        where: { userId },
      });
    } catch (error) {
      this.logger.error('Error in getInvestmentProfile', error);
      throw error;
    }
  }
}
