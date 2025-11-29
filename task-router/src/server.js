const express = require('express');
const amqp = require('amqplib');
const Redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

const app = express();
app.use(express.json());

// Configuration
const RABBITMQ_URL = 'amqp://localhost:5672';
const REDIS_URL = 'redis://localhost:6379';
const PORT = 3000;

// Initialize and start the server
async function startServer() {
  // Logger setup
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'task-router' },
    transports: [new winston.transports.Console()]
  });

  // Redis client for duplicate prevention
  const redisClient = Redis.createClient({ url: REDIS_URL });
  await redisClient.connect();

  // RabbitMQ connection
  let channel;
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Assert queues for each channel type
    await channel.assertQueue('email_queue', { durable: true });
    await channel.assertQueue('sms_queue', { durable: true });
    await channel.assertQueue('whatsapp_queue', { durable: true });
    await channel.assertQueue('logging_queue', { durable: true });
  } catch (error) {
    logger.error('RabbitMQ connection failed:', error);
    process.exit(1);
  }

  // Message validation schema
  const validateMessage = (message) => {
    const { messageId, channel, destination, content } = message;
    if (!messageId || !channel || !destination || !content) {
      throw new Error('Missing required fields');
    }
    if (!['email', 'sms', 'whatsapp'].includes(channel)) {
      throw new Error('Invalid channel');
    }
  };

  // Duplicate check with Redis
  const isDuplicate = async (messageId) => {
    const key = `msg:${messageId}`;
    const exists = await redisClient.exists(key);
    if (!exists) {
      await redisClient.setEx(key, 3600, 'processed'); // 1 hour TTL
      return false;
    }
    return true;
  };

  // Send to logging service
  const sendToLogging = async (logData) => {
    const correlationId = uuidv4();
    const logMessage = {
      ...logData,
      correlationId,
      timestamp: new Date().toISOString()
    };

    channel.sendToQueue(
      'logging_queue', 
      Buffer.from(JSON.stringify(logMessage)),
      { persistent: true }
    );
  };

  // Main routing endpoint
  app.post('/api/messages', async (req, res) => {
    const traceId = uuidv4();
    const startTime = Date.now();

    try {
      const message = req.body;

      // Log incoming request
      await sendToLogging({
        traceId,
        service: 'task-router',
        action: 'message_received',
        level: 'info',
        data: message
      });

      // Validate message
      validateMessage(message);

      // Check for duplicates
      if (await isDuplicate(message.messageId)) {
        await sendToLogging({
          traceId,
          service: 'task-router',
          action: 'duplicate_rejected',
          level: 'warn',
          data: { messageId: message.messageId }
        });
        return res.status(409).json({ error: 'Duplicate message' });
      }

      // Route to appropriate queue
      const targetQueue = `${message.channel}_queue`;
      channel.sendToQueue(
        targetQueue,
        Buffer.from(JSON.stringify({
          ...message,
          traceId,
          receivedAt: new Date().toISOString()
        })),
        { persistent: true }
      );

      // Log successful routing
      await sendToLogging({
        traceId,
        service: 'task-router',
        action: 'message_routed',
        level: 'info',
        data: { 
          messageId: message.messageId, 
          channel: message.channel,
          queue: targetQueue,
          processingTime: Date.now() - startTime
        }
      });

      res.json({ 
        status: 'accepted', 
        messageId: message.messageId,
        traceId 
      });

    } catch (error) {
      // Log error
      await sendToLogging({
        traceId,
        service: 'task-router',
        action: 'processing_error',
        level: 'error',
        data: { error: error.message }
      });

      res.status(400).json({ error: error.message });
    }
  });

  app.listen(PORT, () => {
    logger.info(`Task Router Service running on port ${PORT}`);
  });
}

startServer().catch(console.error);
