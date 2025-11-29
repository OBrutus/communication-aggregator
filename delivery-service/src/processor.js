const amqp = require('amqplib');
const sqlite3 = require('sqlite3');
const { promisify } = require('util');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

async function startDeliveryService() {
  // Configuration
  const RABBITMQ_URL = 'amqp://localhost:5672';

  // Logger
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'delivery-service' },
    transports: [new winston.transports.Console()]
  });

  // SQLite Database setup
  const db = new sqlite3.Database('./messages.db');
  const dbRun = promisify(db.run.bind(db));
  
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE,
        channel TEXT,
        destination TEXT,
        content TEXT,
        status TEXT,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  // RabbitMQ connection
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  // Assert queues and logging queue
  await channel.assertQueue('email_queue', { durable: true });
  await channel.assertQueue('sms_queue', { durable: true });
  await channel.assertQueue('whatsapp_queue', { durable: true });
  await channel.assertQueue('logging_queue', { durable: true });

  // Send to logging service
  const sendToLogging = async (logData) => {
    const logMessage = {
      ...logData,
      timestamp: new Date().toISOString()
    };
    
    channel.sendToQueue(
      'logging_queue', 
      Buffer.from(JSON.stringify(logMessage)),
      { persistent: true }
    );
  };

  // Simulate message delivery
  const simulateDelivery = async (message, channelType) => {
    // Simulate random failures (10% failure rate for demo)
    if (Math.random() < 0.1) {
      throw new Error(`Simulated ${channelType} delivery failure`);
    }
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    return { status: 'delivered', simulatedProviderId: uuidv4() };
  };

  // Process message from queue
  const processMessage = async (message, channelType) => {
    const { traceId, messageId, destination, content } = message;
    const processingStart = Date.now();

    try {
      await sendToLogging({
        traceId,
        service: 'delivery-service',
        action: 'processing_started',
        level: 'info',
        data: { messageId, channel: channelType }
      });

      // Store in database
      await dbRun(
        `INSERT INTO messages (message_id, channel, destination, content, status) 
         VALUES (?, ?, ?, ?, ?)`,
        [messageId, channelType, destination, content, 'processing']
      );

      // Simulate delivery
      const result = await simulateDelivery(message, channelType);

      // Update status in database
      await dbRun(
        `UPDATE messages SET status = ? WHERE message_id = ?`,
        [result.status, messageId]
      );

      await sendToLogging({
        traceId,
        service: 'delivery-service',
        action: 'message_delivered',
        level: 'info',
        data: { 
          messageId, 
          channel: channelType,
          status: result.status,
          processingTime: Date.now() - processingStart
        }
      });

      return result;

    } catch (error) {
      // Update status to failed
      await dbRun(
        `UPDATE messages SET status = ? WHERE message_id = ?`,
        ['failed', messageId]
      );

      await sendToLogging({
        traceId,
        service: 'delivery-service',
        action: 'delivery_failed',
        level: 'error',
        data: { 
          messageId, 
          channel: channelType,
          error: error.message
        }
      });

      throw error;
    }
  };

  // Start consumers for each channel
  const startConsumer = async (queueName, channelType) => {
    await channel.assertQueue(queueName, { durable: true });
    
    channel.consume(queueName, async (msg) => {
      if (msg !== null) {
        try {
          const message = JSON.parse(msg.content.toString());
          await processMessage(message, channelType);
          channel.ack(msg);
        } catch (error) {
          logger.error(`Error processing ${channelType} message:`, error);
          channel.nack(msg, false, false); // Don't requeue
        }
      }
    }, { noAck: false });

    logger.info(`Started ${channelType} consumer`);
  };

  // Start all consumers
  await startConsumer('email_queue', 'email');
  await startConsumer('sms_queue', 'sms');
  await startConsumer('whatsapp_queue', 'whatsapp');

  logger.info('Delivery Service started and consuming messages');
}

startDeliveryService().catch(console.error);
