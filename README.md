# Communication Aggregator

Step 1: Infrastructure
We have a docker-compose.yml file in the project root. We start it first.

Step 2: Task Router Service
We have the Task Router Service in the task-router directory. We need to start it after the infrastructure is up.

Step 3: Delivery Service
Similarly, start the Delivery Service. It will connect to RabbitMQ and start consuming messages.

Step 4: Logging Service
Start the Logging Service to consume log messages and index them in Elasticsearch.

We also need to wait for the infrastructure to be ready. We can use a simple sleep or a script to check.

## Prerequisites
Docker and Docker Compose installed.

Node.js (v16 or above) installed.

