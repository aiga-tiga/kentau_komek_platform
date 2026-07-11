FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# Photos written here should be on a mounted volume - see docker-compose.yml
VOLUME ["/app/uploads"]

EXPOSE 4000
CMD ["node", "server.js"]
