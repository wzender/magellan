FROM node:20-slim

WORKDIR /app

# Reduce npm parallelism on constrained environments.
ENV npm_config_jobs=1

# Install server dependencies
COPY package.json ./
RUN echo "==> Installing server dependencies in $(pwd)" && \
	npm install --omit=dev

# Install client dependencies and build frontend
WORKDIR /app/client
COPY client/package.json ./
RUN echo "==> Installing client dependencies in $(pwd)" && \
	npm install

COPY client/ ./
RUN echo "==> Building client in $(pwd)" && \
	npm run build

WORKDIR /app

# Copy server and data
COPY server/ ./server/
COPY data/ ./data/
RUN echo "==> Runtime files prepared in $(pwd)" && \
	ls -la && \
	ls -la client && \
	ls -la server

WORKDIR /app

EXPOSE 5000

CMD ["node", "server/index.js"]
