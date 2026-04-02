FROM node:21-slim

WORKDIR /app

# Install server dependencies
COPY package.json ./
RUN npm install --omit=dev

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
