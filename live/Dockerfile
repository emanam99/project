FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 3004 3005

ENV NODE_ENV=production

CMD ["npm", "start"]
