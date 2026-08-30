FROM oven/bun:latest

WORKDIR /app

COPY package.json .
COPY src src

RUN bun i
RUN bun run compile

CMD ["bun", "run", "start"]
