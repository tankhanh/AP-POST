import 'dotenv/config';
import mongoose from 'mongoose';

async function migrate(): Promise<void> {
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error('MONGO_URL is required');
  const apply = process.argv.includes('--apply');
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const orders = connection.collection('orders');
    const payments = connection.collection('payments');
    const [orderCount, paymentCount] = await Promise.all([
      orders.countDocuments({ paymentMethod: 'QR' }),
      payments.countDocuments({ method: 'QR' }),
    ]);

    console.log(`QR orders found: ${orderCount}`);
    console.log(`QR payments found: ${paymentCount}`);
    if (!apply) {
      console.log(
        'Dry run only. Re-run with --apply to migrate QR to BANK_TRANSFER.',
      );
      return;
    }

    const [orderResult, paymentResult] = await Promise.all([
      orders.updateMany(
        { paymentMethod: 'QR' },
        { $set: { paymentMethod: 'BANK_TRANSFER', updatedAt: new Date() } },
      ),
      payments.updateMany(
        { method: 'QR' },
        { $set: { method: 'BANK_TRANSFER', updatedAt: new Date() } },
      ),
    ]);
    console.log(`Orders migrated: ${orderResult.modifiedCount}`);
    console.log(`Payments migrated: ${paymentResult.modifiedCount}`);
  } finally {
    await connection.close();
  }
}

migrate().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
