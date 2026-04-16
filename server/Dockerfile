FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

RUN mkdir -p /data/notes

EXPOSE 3000

CMD ["node", "src/index.js"]