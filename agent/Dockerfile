FROM node:22-alpine

# Agent host'dagi docker bilan gaplashadi (docker.sock orqali)
RUN apk add --no-cache docker-cli

WORKDIR /app
COPY package.json ./
COPY bin ./bin
COPY src ./src

ENTRYPOINT ["node", "bin/pingo.js"]
CMD ["start"]
