const amqp = require('amqplib');
const { Client } = require('@elastic/elasticsearch');
const winston = require('winston');

async function startLoggingService() {
  // Configuration
  const RABBITMQ_URL = 'amqp://localhost:5672';
  const ELASTICSEARCH_URL = 'http://localhost:9200';

  // Logger
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'logging-service' },
    transports: [new winston.transports.Console()]
  });

  // Elasticsearch client
  const esClient = new Client({ 
    node: ELASTICSEARCH_URL 
  });

  // Create index if not exists
  const ensureIndexExists = async () => {
    try {
      const exists = await esClient.indices.exists({ index: 'message-logs' });
      if (!exists) {
        await esClient.indices.create({
          index: 'message-logs',
          body: {
            mappings: {
              properties: {
                timestamp: { type: 'date' },
                service: { type: 'keyword' },
                action: { type: 'keyword' },
                level: { type: 'keyword' },
                traceId: { type: 'keyword' },
                correlationId: { type: 'keyword' },
                data: { type: 'object' }
              }
            }
          }
        });
        logger.info('Created Elasticsearch index: message-logs');
      }
    } catch (error) {
      logger.error('Error creating Elasticsearch index:', error);
    }
  };

  await ensureIndexExists();

  // RabbitMQ connection
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue('logging_queue', { durable: true });

  // Process log messages
  channel.consume('logging_queue', async (msg) => {
    if (msg !== null) {
      try {
        const logEntry = JSON.parse(msg.content.toString());
        
        // Index in Elasticsearch
        await esClient.index({
          index: 'message-logs',
          body: logEntry
        });

        logger.info('Logged to Elasticsearch:', {
          service: logEntry.service,
          action: logEntry.action,
          traceId: logEntry.traceId
        });

        channel.ack(msg);
      } catch (error) {
        logger.error('Error processing log message:', error);
        channel.nack(msg, false, true); // Requeue on error
      }
    }
  }, { noAck: false });

  logger.info('Logging Service started and consuming log messages');
}

startLoggingService().catch(console.error);
