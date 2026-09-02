FROM oven/bun AS build

WORKDIR /app

# Cache packages installation
COPY package.json package.json
COPY bun.lock bun.lock

RUN bun install

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build \
	--minify-whitespace \
	--minify-syntax \
	--outdir dist \
    --target bun \
	src/index.ts

FROM oven/bun

WORKDIR /app

COPY --from=build /app/dist /app/dist

WORKDIR /app/dist

ENV NODE_ENV=production

CMD ["bun", "run", "./index.js"]

EXPOSE 3000