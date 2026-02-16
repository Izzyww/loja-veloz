import express from 'express';
import { Pool } from 'pg';
import * as amqp from 'amqplib';

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let channel: amqp.Channel | null = null;
const ORDER_CREATED_QUEUE = 'order.created';

// Conecta no RabbitMQ; sem o healthcheck no compose a API subia antes da fila e dava erro
async function connectRabbitMQ(): Promise<void> {
  const url = process.env.RABBITMQ_URL || 'amqp://user:password@localhost:5672';
  console.log('Tentando conectar no RabbitMQ...');
  const conn = await amqp.connect(url);
  channel = await conn.createChannel();
  await channel.assertQueue(ORDER_CREATED_QUEUE, { durable: true });
}

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'order-service' });
});

// O K8s usa isso pra saber se pode mandar tráfego pro pod (readiness probe)
app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    if (channel) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready', reason: 'rabbitmq' });
    }
  } catch (e) {
    res.status(503).json({ status: 'not ready', error: String(e) });
  }
});

app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('# HELP http_requests_total Total HTTP requests\n# TYPE http_requests_total counter\nhttp_requests_total{service="order-service"} 0\n');
});

app.post('/orders', async (req, res) => {
  try {
    const { customer_id: customerId, total_cents: totalCents } = req.body;
    const result = await pool.query(
      `INSERT INTO orders (customer_id, status, total_cents) VALUES ($1, 'PENDING', $2) RETURNING id, customer_id, total_cents, status, created_at`,
      [customerId || 'anonymous', totalCents || 0]
    );
    const order = result.rows[0];
    if (channel) {
      channel.sendToQueue(ORDER_CREATED_QUEUE, Buffer.from(JSON.stringify({
        orderId: order.id,
        customerId: order.customer_id,
        totalCents: order.total_cents,
      })), { persistent: true });
    }
    res.status(202).json({ id: order.id, status: order.status, created_at: order.created_at });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/orders', async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, customer_id, status, total_cents, created_at FROM orders ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

async function start(): Promise<void> {
  try {
    await connectRabbitMQ();
  } catch (e) {
    console.warn('RabbitMQ ainda não disponível, vai tentar de novo quando publicar');
  }
  app.listen(PORT, () => {
    console.log(`Order service listening on port ${PORT}`);
  });
}

start().catch(console.error);
