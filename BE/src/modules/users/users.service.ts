import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto, RegisterUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User as UserM, UserDocument } from './schemas/user.schema';
import mongoose, { Model } from 'mongoose';
import { genSaltSync, hashSync, compareSync } from 'bcryptjs';
import aqp from 'api-query-params';
import { Users } from 'src/health/decorator/customize';
import { IUser } from 'src/types/user.interface';
import { MailService } from '../mail/mail.service';
import dayjs from 'dayjs';
import { CodeAuthDto } from './dto/code-auth.dto';
import {
  ChangePasswordDto,
  ResetPasswordDto,
  VerifyResetCodeDto,
} from './dto/change-password.dto';
import { createHash, createHmac, randomInt } from 'crypto';
import {
  Order,
  OrderChannel,
  OrderDocument,
  OrderStatus,
} from '../orders/schemas/order.schemas';
import { ConfigService } from '@nestjs/config';
import { UserRole } from './user-role.enum';
import { ACTIVE_DELIVERY_STATES } from '../orders/delivery-state.machine';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(UserM.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Order.name)
    private orderModel: Model<OrderDocument>,
    private mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /* ------------ Helpers ------------ */
  private generateCode6(): string {
    // 6 ký tự chữ hoa + số, ví dụ: 3F2B8C
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from(
      { length: 6 },
      () => alphabet[randomInt(0, alphabet.length)],
    ).join('');
  }

  private normalizeEmail(email: string) {
    return (email || '').trim().toLowerCase();
  }

  private normalizePhone(phone: string | number | undefined) {
    return phone === undefined || phone === null ? '' : String(phone).trim();
  }

  private hashVerificationCode(code: string): string {
    return createHmac(
      'sha256',
      this.configService.getOrThrow<string>('JWT_ACCESS_TOKEN_SECRET'),
    )
      .update(code.trim().toUpperCase())
      .digest('hex');
  }

  // Hash password bằng bcrypt
  getHashPassword = (password: string) => {
    const salt = genSaltSync(10);
    return hashSync(password, salt);
  };

  // Gửi email kích hoạt
  async sendVerificationEmail(email: string, name: string, codeId: string) {
    return this.mailService.send(
      email,
      'Activate your account',
      'register.hbs',
      {
        name: name ?? email,
        activationCode: codeId,
      },
    );
  }

  /* ------------ Admin create STAFF user ------------ */
  async create(createUserDto: CreateUserDto, @Users() user: IUser) {
    const {
      name,
      email,
      password,
      age,
      gender,
      address,
      phone,
      branchId,
      avatarUrl,
      isActive,
      isAvailable,
      vehicleType,
      licensePlate,
      role,
    } = createUserDto;

    const emailNorm = this.normalizeEmail(email);
    const isExist = await this.userModel.findOne({ email: emailNorm });
    if (isExist) {
      throw new BadRequestException(`Email: ${emailNorm} already exists.`);
    }

    const hashPassword = this.getHashPassword(password);

    const newUser = await this.userModel.create({
      name,
      email: emailNorm,
      password: hashPassword,
      age,
      gender,
      address,
      phone,
      // chi nhánh làm việc
      branchId: new mongoose.Types.ObjectId(branchId),
      // avatar
      avatarUrl,
      role: role || UserRole.STAFF,
      accountType: 'LOCAL',
      // mặc định đang hoạt động nếu FE không gửi
      isActive: typeof isActive === 'boolean' ? isActive : true,
      isAvailable: typeof isAvailable === 'boolean' ? isAvailable : true,
      vehicleType,
      licensePlate: licensePlate?.trim().toUpperCase(),
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return newUser;
  }

  /* ------------ Self-register ------------ */
  async register(user: RegisterUserDto) {
    const { name, email, password, age, gender, address, phone } = user;

    const emailNorm = this.normalizeEmail(email);
    const isExist = await this.userModel.findOne({ email: emailNorm });
    if (isExist) {
      throw new BadRequestException(`Email: ${emailNorm} is existed.`);
    }

    // mã 6 ký tự
    const codeId = this.generateCode6();
    const hashPassword = this.getHashPassword(password);

    const newRegister = await this.userModel.create({
      name,
      email: emailNorm,
      password: hashPassword,
      age,
      gender,
      address,
      phone: this.normalizePhone(phone),
      role: 'USER',
      isActive: false,
      codeId: this.hashVerificationCode(codeId),
      codeExpired: dayjs().add(30, 'minute'),
    });

    await this.sendVerificationEmail(emailNorm, name, codeId);

    return newRegister;
  }

  private async linkGuestOrdersToUser(userId: string) {
    const account = await this.userModel.findById(userId).lean();
    if (!account) return 0;

    const emailNorm = this.normalizeEmail(account.email);
    const phoneNorm = this.normalizePhone(account.phone);
    const linkConditions: any[] = [];
    if (emailNorm) linkConditions.push({ email: emailNorm });
    if (phoneNorm) linkConditions.push({ senderPhone: phoneNorm });
    if (!linkConditions.length) return 0;

    const result = await this.orderModel.updateMany(
      {
        channel: OrderChannel.B2C_GUEST,
        userId: null,
        isDeleted: false,
        $or: linkConditions,
      },
      {
        userId: new mongoose.Types.ObjectId(userId),
        channel: OrderChannel.B2C_USER,
      },
    );

    return result.modifiedCount || 0;
  }

  /* ------------ Active by code ------------ */
  async handleActive(data: CodeAuthDto) {
    const user = await this.userModel.findOne({
      _id: data._id,
      codeId: this.hashVerificationCode(data.code),
      isDeleted: false,
      isActive: false,
    });

    if (!user) throw new BadRequestException('Invalid Code');
    if (dayjs().isAfter(user.codeExpired)) {
      throw new BadRequestException('Activation code expired!');
    }

    await this.userModel.updateOne(
      { _id: data._id, isDeleted: false, isActive: false },
      {
        isActive: true,
        $unset: { codeId: 1, codeExpired: 1 },
      },
    );
    const linkedOrders = await this.linkGuestOrdersToUser(data._id);
    return {
      message: 'Account activated successfully',
      linkedGuestOrders: linkedOrders,
    };
  }

  /* ------------ Retry Active (resend code) ------------ */
  async retryActive(email: string) {
    const emailNorm = this.normalizeEmail(email);
    const user = await this.userModel.findOne({
      email: emailNorm,
      isDeleted: false,
    });

    if (!user) throw new BadRequestException('Account does not exist');
    if (user.isActive)
      throw new BadRequestException('Account is already activated');

    const codeId = this.generateCode6();
    await this.userModel.updateOne(
      { _id: user._id },
      {
        codeId: this.hashVerificationCode(codeId),
        codeExpired: dayjs().add(30, 'minute'),
      },
    );

    await this.sendVerificationEmail(user.email, user.name, codeId);
    return { _id: user._id };
  }

  /* ------------ Retry Forgot Password (resend code) ------------ */
  async retryPassword(email: string) {
    const emailNorm = this.normalizeEmail(email);
    const user = await this.userModel.findOne({
      email: emailNorm,
      isDeleted: false,
      isActive: true,
    });

    if (!user) return { email: emailNorm };

    const codeId = this.generateCode6();
    await this.userModel.updateOne(
      { _id: user._id },
      {
        codeId: this.hashVerificationCode(codeId),
        codeExpired: dayjs().add(15, 'minute'),
      },
    );

    await this.mailService.send(
      user.email,
      'Change your password active code',
      'resetpassword.hbs',
      {
        name: user?.name ?? user.email,
        resetCode: codeId,
      },
    );

    return { email: user.email };
  }

  async verifyResetCode(data: VerifyResetCodeDto) {
    const user = await this.userModel.findOne({
      email: this.normalizeEmail(data.email),
      codeId: this.hashVerificationCode(data.code),
      isDeleted: false,
      isActive: true,
    });
    if (!user || !user.codeExpired || dayjs().isAfter(user.codeExpired)) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    return { verified: true };
  }

  async resetPassword(data: ResetPasswordDto) {
    if (data.newPassword !== data.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.userModel.findOne({
      email: this.normalizeEmail(data.email),
      codeId: this.hashVerificationCode(data.code),
      isDeleted: false,
      isActive: true,
    });
    if (!user || !user.codeExpired || dayjs().isAfter(user.codeExpired)) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    user.password = this.getHashPassword(data.newPassword);
    user.set('refreshToken', '');
    user.set('codeId', undefined);
    user.set('codeExpired', undefined);
    await user.save();

    return { message: 'Password changed successfully' };
  }

  /* ------------ Change password (using code) ------------ */
  async changePassword(data: ChangePasswordDto) {
    return this.resetPassword({
      email: data.email,
      code: data.code,
      newPassword: data.password,
      confirmPassword: data.confirmPassword,
    });
  }

  /* ------------ Find All ------------ */
  async findAll(currentPage: number, limit: number, qs: string) {
    const { filter, sort, population } = aqp(qs);
    delete (filter as any).current;
    delete (filter as any).pageSize;
    filter.isDeleted = false;

    currentPage = Math.max(Number(currentPage) || 1, 1);
    const defaultLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const offset = (currentPage - 1) * defaultLimit;

    const totalItems = await this.userModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.userModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .select('-password')
      .populate(population as any)
      .exec();

    const normalizedRole = String((filter as any).role || '').toUpperCase();
    const visibleResult =
      normalizedRole === UserRole.SHIPPER
        ? result.map((shipper) => this.withCurrentPresence(shipper.toObject()))
        : result;

    return {
      meta: {
        current: currentPage,
        pageSize: limit,
        pages: totalPages,
        total: totalItems,
      },
      result: visibleResult,
    };
  }

  /* ------------ Find All (deleted only - trash) ------------ */
  async findAllDeleted(qs: any) {
    const { filter, sort, population } = aqp(qs);
    delete (filter as any).current;
    delete (filter as any).pageSize;

    // Lấy các user đã xoá mềm: isDeleted = true
    const baseFilter: any = {
      ...filter,
      isDeleted: true,
    };

    const result = await this.userModel
      .find(baseFilter)
      .sort(sort as any)
      .select('-password')
      .populate(population as any)
      .exec();

    // KHÔNG phân trang, trả về mảng luôn
    return result;
  }

  /* ------------ Find One ------------ */
  async findOne(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException('User not found');
    }

    const user = await this.userModel
      .findOne({ _id: id, isDeleted: false })
      .select('-password')
      .populate({ path: 'branchId', select: { name: 1, _id: 1 } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /* ------------ Find By role ------------ */
  async findUserByRole(role: string) {
    const normalizedRole = String(role || '')
      .trim()
      .toUpperCase();
    const users = await this.userModel
      .find({ role: normalizedRole, isDeleted: false })
      .select('-password')
      .populate('branchId', 'name')
      .lean();

    if (normalizedRole !== UserRole.SHIPPER) return users;
    return users.map((shipper) => this.withCurrentPresence(shipper));
  }

  async findActiveShippers(user: IUser) {
    const filter: Record<string, unknown> = {
      role: UserRole.SHIPPER,
      isActive: true,
      isAvailable: { $ne: false },
      isDeleted: false,
    };
    if (user.role === UserRole.STAFF) {
      const branchId = user.branchId ?? user.BranchId;
      if (!branchId) {
        throw new ForbiddenException('Staff account has no assigned branch');
      }
      filter.branchId = new mongoose.Types.ObjectId(String(branchId));
    }
    const shippers = await this.userModel
      .find(filter)
      .select(
        '_id name phone email branchId avatarUrl isAvailable isOnline lastSeenAt vehicleType licensePlate',
      )
      .populate('branchId', 'name')
      .sort({ name: 1 })
      .lean();

    if (shippers.length === 0) return [];

    const workload = await this.orderModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      activeJobs: number;
    }>([
      {
        $match: {
          assignedShipperId: { $in: shippers.map((shipper) => shipper._id) },
          isDeleted: false,
          status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
          deliveryState: { $in: ACTIVE_DELIVERY_STATES },
        },
      },
      { $group: { _id: '$assignedShipperId', activeJobs: { $sum: 1 } } },
    ]);
    const jobsByShipper = new Map(
      workload.map((item) => [String(item._id), item.activeJobs]),
    );

    return shippers.map((shipper) => ({
      ...this.withCurrentPresence(shipper),
      activeJobs: jobsByShipper.get(String(shipper._id)) ?? 0,
    }));
  }

  private withCurrentPresence<
    T extends { isOnline?: boolean; lastSeenAt?: Date },
  >(shipper: T): T & { isOnline: boolean } {
    const lastSeenAt = shipper.lastSeenAt
      ? new Date(shipper.lastSeenAt).getTime()
      : 0;
    const presenceTtlMs = Number(
      this.configService.get<string>('SHIPPER_PRESENCE_TTL_MS', '90000'),
    );
    return {
      ...shipper,
      isOnline:
        shipper.isOnline === true &&
        Number.isFinite(lastSeenAt) &&
        Date.now() - lastSeenAt <= presenceTtlMs,
    };
  }

  /* ------------ For login ------------ */
  findOneByUsername(username: string) {
    const emailNorm = this.normalizeEmail(username);
    return this.userModel
      .findOne({ email: emailNorm, isDeleted: false })
      .select('+password');
  }

  /* ------------ Find by Email ------------ */
  async findByEmail(email: string) {
    const emailNorm = this.normalizeEmail(email);
    if (!emailNorm) throw new BadRequestException('Email is required');

    return this.userModel.findOne({ email: emailNorm, isDeleted: false });
  }

  /* ------------ Password compare ------------ */
  isValidPassword(password: string, hash?: string) {
    return !!hash && compareSync(password, hash);
  }

  /* ------------ Update (admin) ------------ */
  async update(updateUserDto: UpdateUserDto, user: IUser, _id: string) {
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const isAdmin = user.role === 'ADMIN';
    const isSelf = String(user._id) === _id;
    if (!isAdmin && !isSelf) {
      throw new ForbiddenException('You can only update your own profile');
    }

    const target = await this.userModel.findOne({ _id, isDeleted: false });
    if (!target) throw new NotFoundException('User not found');

    const safeUpdate: Partial<UpdateUserDto> = { ...updateUserDto };
    if (!isAdmin) {
      delete safeUpdate.role;
      delete safeUpdate.branchId;
      delete safeUpdate.isActive;
      delete safeUpdate.accountType;
      delete safeUpdate.password;
      delete safeUpdate.email;
      if (target.role !== UserRole.SHIPPER) {
        delete safeUpdate.isAvailable;
        delete safeUpdate.vehicleType;
        delete safeUpdate.licensePlate;
      }
    }

    if (safeUpdate.licensePlate) {
      safeUpdate.licensePlate = safeUpdate.licensePlate.trim().toUpperCase();
    }

    if (isAdmin && target.role === UserRole.SHIPPER) {
      const deactivating = safeUpdate.isActive === false;
      const changingRole =
        safeUpdate.role !== undefined &&
        String(safeUpdate.role) !== UserRole.SHIPPER;
      const changingBranch =
        safeUpdate.branchId !== undefined &&
        String(safeUpdate.branchId) !== String(target.branchId ?? '');
      if (deactivating || changingRole || changingBranch) {
        await this.assertNoActiveShipperJobs(_id);
      }
    }

    if (safeUpdate.email) {
      safeUpdate.email = this.normalizeEmail(safeUpdate.email);
      const duplicate = await this.userModel.exists({
        _id: { $ne: new mongoose.Types.ObjectId(_id) },
        email: safeUpdate.email,
      });
      if (duplicate) {
        throw new BadRequestException(
          `Email: ${safeUpdate.email} already exists.`,
        );
      }
    }

    if (safeUpdate.password) {
      safeUpdate.password = this.getHashPassword(safeUpdate.password);
    }

    const updated = await this.userModel.updateOne(
      { _id, isDeleted: false },
      {
        ...safeUpdate,
        updatedBy: {
          _id: user._id,
          email: user.email,
        },
      },
    );

    if (updated.matchedCount === 0) {
      throw new BadRequestException('Update failed');
    }

    return { message: 'User updated', updated };
  }

  /* ------------ Soft delete (admin) ------------ */
  async remove(id: string, user: IUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) return 'Not found user';

    const foundUser = await this.userModel.findById(id);
    if (foundUser?.email === 'admin@gmail.com') {
      throw new BadRequestException('Cannot delete admin@gmail.com');
    }
    if (foundUser?.role === UserRole.SHIPPER) {
      await this.assertNoActiveShipperJobs(id);
    }

    const result = await this.userModel.updateOne(
      { _id: id, isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: { _id: user._id, email: user.email },
          refreshToken: '',
          isActive: false,
        },
      },
    );
    if (result.modifiedCount === 0) {
      throw new BadRequestException('User not found or already deleted');
    }
    return { message: 'User deleted' };
  }

  /* ------------ Restore (admin) ------------ */
  async restore(id: string, user: IUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    // không cho restore admin nếu bạn muốn, tuỳ bạn
    const foundUser = await this.userModel.findById(id);
    if (!foundUser) {
      throw new BadRequestException('User not found');
    }

    const restored = await this.userModel.updateOne(
      { _id: id, isDeleted: true },
      {
        $set: {
          isDeleted: false,
          updatedBy: { _id: user._id, email: user.email },
        },
        $unset: { deletedAt: 1, deletedBy: 1 },
      },
    );
    if (restored.modifiedCount === 0) {
      throw new BadRequestException('User is not deleted or restore failed');
    }

    return { message: 'User restored' };
  }

  /* ------------ Hard delete (admin) ------------ */
  async hardDelete(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const foundUser = await this.userModel.findById(id);
    if (!foundUser) {
      throw new BadRequestException('User not found');
    }

    if (foundUser.email === 'admin@gmail.com') {
      throw new BadRequestException('Cannot hard delete admin@gmail.com');
    }

    if (foundUser.role === UserRole.SHIPPER) {
      await this.assertNoActiveShipperJobs(id);
    }

    await this.userModel.deleteOne({ _id: id });

    return { message: 'User permanently deleted' };
  }

  /* ------------ Token helpers ------------ */
  async updateUserToken(refreshToken: string, _id: string) {
    const updated = await this.userModel.updateOne(
      { _id, isDeleted: false, isActive: true },
      { refreshToken: this.hashRefreshToken(refreshToken) },
    );
    return { message: 'Token updated', updated };
  }

  async findUserByToken(refreshToken: string) {
    return this.userModel.findOne({
      refreshToken: this.hashRefreshToken(refreshToken),
      isDeleted: false,
      isActive: true,
    });
  }

  private hashRefreshToken(token: string): string {
    return token ? createHash('sha256').update(token).digest('hex') : '';
  }

  /* ------------ Strategies helpers ------------ */
  async validateUser(username: string, password: string) {
    const emailNorm = this.normalizeEmail(username);
    const user = await this.userModel
      .findOne({ email: emailNorm, isDeleted: false })
      .select('+password');

    if (!user) return null;
    if (!this.isValidPassword(password, user.password)) return null;

    return user;
  }

  async findById(_id: string) {
    if (!mongoose.Types.ObjectId.isValid(_id)) return null;
    return this.userModel
      .findOne({ _id, isDeleted: false })
      .select('-password');
  }

  private async assertNoActiveShipperJobs(shipperId: string): Promise<void> {
    const activeJob = await this.orderModel
      .findOne({
        assignedShipperId: new mongoose.Types.ObjectId(shipperId),
        isDeleted: false,
        status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
        deliveryState: { $in: ACTIVE_DELIVERY_STATES },
      })
      .select('waybill')
      .lean();

    if (activeJob) {
      throw new BadRequestException(
        `Shipper đang phụ trách đơn ${activeJob.waybill}. Hãy điều phối lại đơn trước khi thay đổi tài khoản.`,
      );
    }
  }
}
