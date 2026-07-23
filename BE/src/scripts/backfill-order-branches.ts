import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

type BranchRecord = {
  _id: Types.ObjectId;
  provinceName?: string;
  communeName?: string;
  createdAt?: Date;
};

function normalizeLocationName(value?: string): string {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('vi-VN')
    .replace(
      /^(tỉnh|thành phố|tp\.?|quận|huyện|thị xã|phường|xã|thị trấn)\s+/u,
      '',
    )
    .replace(/[.,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main(): Promise<void> {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) throw new Error('MONGO_URL is required');

  await mongoose.connect(mongoUrl);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  const branches = (await db
    .collection<BranchRecord>('branches')
    .find({ isDeleted: false, isActive: true })
    .sort({ createdAt: 1 })
    .toArray()) as BranchRecord[];
  const orders = db.collection('orders');
  const addresses = db.collection('addresses');
  const provinces = db.collection('provinces');
  const communes = db.collection('communes');
  const locationCache = new Map<string, string>();

  const locationName = async (
    collection: typeof provinces,
    id: unknown,
  ): Promise<string> => {
    if (!id || !Types.ObjectId.isValid(String(id))) return '';
    const key = `${collection.collectionName}:${String(id)}`;
    if (locationCache.has(key)) return locationCache.get(key) ?? '';
    const location = await collection.findOne(
      { _id: new Types.ObjectId(String(id)) },
      { projection: { name: 1 } },
    );
    const name = normalizeLocationName(location?.name as string | undefined);
    locationCache.set(key, name);
    return name;
  };

  let scanned = 0;
  let repaired = 0;
  let unresolved = 0;
  const cursor = orders.find(
    {
      isDeleted: { $ne: true },
      $or: [{ branchId: null }, { branchId: { $exists: false } }],
    },
    { projection: { pickupAddressId: 1 } },
  );

  for await (const order of cursor) {
    scanned += 1;
    const pickupAddress = order.pickupAddressId
      ? await addresses.findOne(
          { _id: new Types.ObjectId(String(order.pickupAddressId)) },
          { projection: { provinceId: 1, communeId: 1 } },
        )
      : null;
    const communeName = await locationName(communes, pickupAddress?.communeId);
    const provinceName = await locationName(
      provinces,
      pickupAddress?.provinceId,
    );
    let source = 'ADDRESS';
    let selected = communeName
      ? branches.find(
          (branch) => normalizeLocationName(branch.communeName) === communeName,
        )
      : undefined;
    if (!selected && provinceName) {
      selected = branches.find(
        (branch) => normalizeLocationName(branch.provinceName) === provinceName,
      );
    }
    if (!selected && branches.length === 1) {
      selected = branches[0];
      source = 'SINGLE_ACTIVE_BRANCH';
    }
    if (!selected) {
      unresolved += 1;
      continue;
    }

    const result = await orders.updateOne(
      {
        _id: order._id,
        $or: [{ branchId: null }, { branchId: { $exists: false } }],
      },
      {
        $set: {
          branchId: selected._id,
          branchAssignmentSource: source,
          branchAssignedAt: new Date(),
        },
      },
    );
    repaired += result.modifiedCount;
  }

  console.log(
    `Order branch backfill complete: scanned=${scanned}, repaired=${repaired}, unresolved=${unresolved}`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
