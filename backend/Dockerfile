FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Install dependencies including devDependencies to build the project
RUN npm install

COPY . .

RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/main"]
