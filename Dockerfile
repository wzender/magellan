FROM artifactory_url/images/node:18.18.2-slim

WORKDIR /app

# Install server dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Install client dependencies and build
COPY client/package.json ./client/
RUN cd client && npm install

COPY client/ ./client/

# Copy server and data
COPY server/ ./server/
COPY data/ ./data/
COPY start.sh ./start.sh

RUN chmod +x ./start.sh

EXPOSE 5000

CMD ["./start.sh"]
