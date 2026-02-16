import express from 'express';
import { Pool } from 'pg';
import * as amqp from 'amqplib';

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const ORDER_CREATED_QUEUE = 'order.created';
const INVENTORY_RESERVED_QUEUE = 'inventory.reserved';

async function connectRabbitMQ(): Promise<amqp.Channel> {
  const url = process.env.RABBITMQ_URL || 'amqp://user:password@localhost:5672';
  console.log('Conectando na fila (order.created)...');
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertQueue(ORDER_CREATED_QUEUE, { durable: true });
  await ch.assertQueue(INVENTORY_RESERVED_QUEUE, { durable: true });
  return ch;
}

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'inventory-service' });
});

app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (e) {
    res.status(503).json({ status: 'not ready', error: String(e) });
  }
});

app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('# HELP http_requests_total Total HTTP requests\n# TYPE http_requests_total counter\nhttp_requests_total{service="inventory-service"} 0\n');
});

app.get('/inventory', async (_req, res) => {
  try {
    const result = await pool.query('SELECT product_id, quantity, reserved, updated_at FROM inventory');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/inventory', async (req, res) => {
  try {
    const { product_id: productId, quantity } = req.body;
    await pool.query(
      `INSERT INTO inventory (product_id, quantity) VALUES ($1, $2)
       ON CONFLICT (product_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = NOW()`,
      [productId, quantity || 0]
    );
    res.status(201).json({ product_id: productId, quantity: quantity || 0 });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Consome evento de pedido criado e publica inventory.reserved (fluxo da saga)
async function consumeOrderCreated(ch: amqp.Channel): Promise<void> {
  await ch.consume(ORDER_CREATED_QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      const { orderId, totalCents } = payload;
      // por enquanto só confirma; depois dá pra checar estoque de verdade
      await pool.query('SELECT 1');
      ch.sendToQueue(INVENTORY_RESERVED_QUEUE, Buffer.from(JSON.stringify({
        orderId,
        reserved: true,
      })), { persistent: true });
      ch.ack(msg);
    } catch (e) {
      ch.nack(msg, false, true);
    }
  }, { noAck: false });
}

async function start(): Promise<void> {
  const ch = await connectRabbitMQ();
  await consumeOrderCreated(ch);
  app.listen(PORT, () => {
    console.log(`Inventory service listening on port ${PORT}`);
  });
}

start().catch(console.error);
