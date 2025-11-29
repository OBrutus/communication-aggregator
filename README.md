# Communication Aggregator System

A microservices-based system for routing messages to different communication channels (Email, SMS, WhatsApp) with full observability and resilience.

## 🏗️ System Architecture

### High-Level Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATIONS                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │ (REST API)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TASK ROUTER SERVICE                          │
│                    (Port: 3000)                                 │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Validation  │  │ Duplicate   │  │ Routing Logic           │  │
│  │             │  │ Prevention  │  │ email → email_queue     │  │
│  │             │  │ (Redis)     │  │ sms → sms_queue         │  │
│  │             │  │             │  │ whatsapp → whatsapp_queue│  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ (RabbitMQ)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DELIVERY SERVICE                             │
│                    (Port: N/A - Background)                     │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Email       │  │ SMS         │  │ WhatsApp                │  │
│  │ Consumer    │  │ Consumer    │  │ Consumer                │  │
│  │             │  │             │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    SQLite Database                          │ │
│  │  messages (id, message_id, channel, destination, status)    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │ (RabbitMQ)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOGGING SERVICE                              │
│                    (Port: N/A - Background)                     │
│                                                                 │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐   │
│  │ Log         │  │ Elasticsearch Indexing                  │   │
│  │ Consumer    │  │                                         │   │
│  │             │  │  message-logs (timestamp, service,      │   │
│  │             │  │   action, traceId, data)                │   │
│  └─────────────┘  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY STACK                          │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ RabbitMQ    │  │ Elastic-    │  │ Kibana                  │  │
│  │ Management  │  │ search      │  │ Dashboard               │  │
│  │ (15672)     │  │ (9200)      │  │ (5601)                  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Prerequisites
- **Docker and Docker Compose**
- **Node.js** (v18 or higher)
- **npm** (Node Package Manager)

## 🏃‍♂️ Running the System

### Step 1: Start Infrastructure

```bash
# Ensure Docker is running, then:
docker-compose up -d

# Verify all services are running:
docker-compose ps
```

### Step 2: Start Microservices (in separate terminals)

**Terminal 1 - Task Router:**
```bash
cd task-router
npm start
```

**Terminal 2 - Delivery Service:**
```bash
cd delivery-service
npm start
```

**Terminal 3 - Logging Service:**
```bash
cd logging-service
npm start
```

### Step 3: Verify Services Are Running

Check each service output:

**Task Router:**
```text
{"level":"info","message":"Task Router Service running on port 3000","service":"task-router"}
```

**Delivery Service:**
```text
{"level":"info","message":"Delivery Service started and consuming messages","service":"delivery-service"}
{"level":"info","message":"Started email consumer","service":"delivery-service"}
{"level":"info","message":"Started sms consumer","service":"delivery-service"}
{"level":"info":"message":"Started whatsapp consumer","service":"delivery-service"}
```

**Logging Service:**
```text
{"level":"info","message":"Logging Service started and consuming log messages","service":"logging-service"}
```

## 📡 API Documentation

### Base URL
`http://localhost:3000`

### Endpoints

#### POST /api/messages
Send a message to be routed to appropriate channel.

**Request Body:**
```json
{
  "messageId": "string (required, unique)",
  "channel": "string (required, enum: email, sms, whatsapp)",
  "destination": "string (required)",
  "content": "string (required)"
}
```

**Success Response (200):**
```json
{
  "status": "accepted",
  "messageId": "msg-001",
  "traceId": "uuid-string"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid payload or channel
- `409 Conflict` - Duplicate message ID

**Example Requests:**

```bash
# Email message
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg-001",
    "channel": "email",
    "destination": "user@example.com",
    "content": "Welcome to our service!"
  }'

# SMS message
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg-002", 
    "channel": "sms",
    "destination": "+1234567890",
    "content": "Your verification code is 123456"
  }'

# WhatsApp message
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg-003",
    "channel": "whatsapp", 
    "destination": "+1234567890",
    "content": "Hello from WhatsApp!"
  }'
```

## 🛠️ Monitoring & Debugging

### RabbitMQ Management Console
- **URL:** `http://localhost:15672`
- **Username:** `guest`
- **Password:** `guest`

Check queue status, message rates, and connection health.

### Kibana Dashboard
- **URL:** `http://localhost:5601`

To set up Kibana:
1. Go to "Stack Management" → "Index Patterns"
2. Create pattern: `message-logs`
3. Time field: `timestamp`
4. Explore in "Discover" tab

### Elasticsearch API
```bash
# Check if logs are being stored
curl -X GET "localhost:9200/message-logs/_search?pretty"

# Check cluster health
curl -X GET "localhost:9200/_cluster/health?pretty"
```

### Check Delivery Database
```bash
cd delivery-service
sqlite3 messages.db "SELECT * FROM messages ORDER BY processed_at DESC LIMIT 10;"
```

## 🔧 Configuration

### Environment Variables (Optional)
You can configure these by setting environment variables before starting services:

| Variable | Default | Description |
|----------|---------|-------------|
| `RABBITMQ_URL` | `amqp://localhost:5672` | RabbitMQ connection URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | Elasticsearch connection URL |
| `TASK_ROUTER_PORT` | `3000` | Task Router service port |

### Ports Used
| Service | Port | Purpose |
|---------|------|---------|
| Task Router | 3000 | Main API endpoint |
| RabbitMQ | 5672 | AMQP message broker |
| RabbitMQ Management | 15672 | Web management console |
| Redis | 6379 | In-memory data store |
| Elasticsearch | 9200 | Search and analytics engine |
| Kibana | 5601 | Data visualization dashboard |

## 🗂️ Project Structure

```text
communication-aggregator/
├── docker-compose.yml          # Infrastructure services
├── task-router/                # Service 1: Task Router
│   ├── src/
│   │   └── server.js          # Main server file
│   ├── package.json
│   └── package-lock.json
├── delivery-service/           # Service 2: Delivery Service  
│   ├── src/
│   │   └── processor.js       # Message processor
│   ├── package.json
│   ├── package-lock.json
│   └── messages.db            # SQLite database (auto-created)
├── logging-service/            # Service 3: Logging Service
│   ├── src/
│   │   └── logger.js          # Log processor
│   ├── package.json
│   └── package-lock.json
└── README.md
```

## 🛡️ Key Features

- ✅ **Concurrency:** Parallel message processing with RabbitMQ workers
- ✅ **Resilience:** Retry logic, duplicate prevention, persistent queues
- ✅ **Observability:** Full distributed tracing with correlation IDs
- ✅ **Scalability:** Independent microservices that can scale horizontally
- ✅ **Simplicity:** Minimal dependencies, clear separation of concerns
- ✅ **Monitoring:** Built-in dashboards for RabbitMQ and Elasticsearch

## 🚨 Troubleshooting

### Common Issues

**Connection Refused Errors:**
```bash
# Check if infrastructure is running
docker-compose ps

# Restart if needed
docker-compose restart
```

**Port Already in Use:**
```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill -9 $(lsof -ti:3000)
```

**Node Module Issues:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Elasticsearch Not Starting:**
```bash
# Check logs
docker-compose logs elasticsearch

# Increase memory if needed (in Docker Desktop settings)
```

### Service Health Checks
```bash
# Check Task Router
curl http://localhost:3000/health

# Check Elasticsearch
curl http://localhost:9200/

# Check Redis
redis-cli ping
```

## 🧹 Cleanup

To stop all services:

```bash
# Stop microservices (Ctrl+C in each terminal)

# Stop and remove infrastructure
docker-compose down

# Remove volumes (optional - deletes all data)
docker-compose down -v
```

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify all prerequisites are installed
3. Ensure all services are running in the correct order
4. Check service logs for error messages

---
🎉 **Your Communication Aggregator System is now ready!**
